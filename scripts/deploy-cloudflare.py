#!/usr/bin/env python3
"""Publish compatible assets first, then validate and activate the new interface."""
import argparse
import datetime
import fcntl
import json
import os
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parent.parent
WRANGLER = ['node', os.environ['INK_WRANGLER']] if os.environ.get('INK_WRANGLER') else ['wrangler']
ORIGIN = 'https://inkexplorer.xyz'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expected-version', help='Current version serving 100%% of traffic')
    parser.add_argument('--previous-source', type=Path, help='Verified source of that version, including prepared dist')
    parser.add_argument('--previous-browser-source', type=Path, help='Matching full source when previous-source is an artifact-only compatibility release')
    parser.add_argument('--report', type=Path, help='New report directory')
    parser.add_argument('--message', default='Validated explorer update')
    parser.add_argument('--resume', type=Path, help='Resume a stopped process after inspecting remote state')
    args = parser.parse_args()
    if not args.resume and not (args.expected_version and args.previous_source and args.report):
        parser.error('Provide --expected-version, --previous-source and --report, or --resume')
    lock_path = Path.home() / '.cache/inkexplorer-release.lock'
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    lock = lock_path.open('a')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise RuntimeError('Another release process is still running; inspect it instead of starting another') from None
    report = (args.resume or args.report).resolve()
    state_file = report / 'state.json'
    if args.resume:
        state = json.loads(state_file.read_text())
        if state.get('schema') != 2 or Path(state['source']) != ROOT:
            raise RuntimeError('Resume with the original source and deployment script')
    else:
        report.mkdir(parents=True, exist_ok=False)
        state = {'schema': 2, 'source': str(ROOT), 'expected': args.expected_version, 'previousSource': str(args.previous_source.resolve()), 'phase': 'preparing', 'message': args.message}
    previous = Path(state['previousSource'])
    previous_browser = (args.previous_browser_source or Path(state.get('previousBrowserSource') or previous)).resolve()
    if not (previous_browser / 'scripts/home-arrival-browser-test.mjs').is_file():
        raise RuntimeError('Previous browser tests are missing; provide --previous-browser-source with the matching full source before publishing')
    if (previous_browser / 'dist/index.html').read_bytes() != (previous / 'dist/index.html').read_bytes():
        raise RuntimeError('The previous browser test source does not match the interface being retained')
    state['previousBrowserSource'] = str(previous_browser)
    compatibility = report / 'compatibility-source'
    rolling_dir = Path(os.environ.get('INK_ROLLING_DATA_DIR') or state.get('rollingDataDir') or ROOT / 'data/rolling-metrics').resolve()
    for chain_id in (57073, 763373):
        if not (rolling_dir / f'{chain_id}.sqlite').is_file():
            raise RuntimeError('Before publishing, set INK_ROLLING_DATA_DIR to the persistent collector directory; both databases must exist')
    state['rollingDataDir'] = str(rolling_dir)
    api_token = os.environ.get('CLOUDFLARE_API_TOKEN') or (Path.home() / '.config/cloudflare/api-token').read_text().strip()
    env = {**os.environ, 'INK_ROLLING_DATA_DIR': str(rolling_dir), 'CLOUDFLARE_API_TOKEN': api_token, 'WRANGLER_SEND_METRICS': 'false'}

    def save():
        state['updatedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        temporary = state_file.with_suffix('.tmp')
        temporary.write_text(json.dumps(state, indent=2) + '\n')
        temporary.replace(state_file)

    def run(command, name, extra=None, required=True, cwd=ROOT):
        print(name, flush=True)
        with (report / (name + '.log')).open('w') as output:
            result = subprocess.run(command, cwd=cwd, env={**env, **(extra or {})}, stdout=output, stderr=subprocess.STDOUT)
        if required and result.returncode:
            raise RuntimeError(f'{name} failed; inspect its report before resuming. No subsequent phase was run.')
        return result.returncode == 0

    def wrangler(*command, config=ROOT / 'wrangler.jsonc'):
        return [*WRANGLER, *command, '--config', str(config)]

    def current():
        output = subprocess.check_output(wrangler('deployments', 'list', '--json'), cwd=ROOT, env=env, text=True)
        return json.loads(output)[-1]

    def require(versions):
        remote = current()
        if {v['version_id']: v['percentage'] for v in remote['versions']} != versions:
            raise RuntimeError('Active deployment differs from the expected state; preserve concurrent changes')
        return remote

    def settle(versions):
        for _ in range(15):
            remote = current()
            if {v['version_id']: v['percentage'] for v in remote['versions']} == versions:
                return remote
            time.sleep(2)
        raise RuntimeError('Deployment state has not converged; inspect the action before resuming')

    def gate(label, part, dist, override):
        consecutive = 0
        existing = [int(p.stem.rsplit('-', 1)[1]) for p in report.glob(label + '-*.json')]
        start = max(existing, default=0) + 1
        for attempt in range(start, start + 10):
            output = report / f'{label}-{attempt}.json'
            ok = run(['node', 'scripts/release-gate.mjs', ORIGIN, part['version'], str(output), *(['override'] if override else [])], f'{label}-{attempt}', {'RELEASE_DIST': str(dist)}, required=False)
            consecutive = consecutive + 1 if ok else 0
            if consecutive == 2:
                return
            time.sleep(5)
        raise RuntimeError(f'{label}: validation incomplete, phase {part["phase"]}. Inspect and resume; do not upload again.')

    def publish(kind, expected, source, browser_source):
        part = state.setdefault(kind, {'phase': 'prepared', 'expected': expected})
        if part['expected'] != expected:
            raise RuntimeError('The recorded previous version changed')
        save()
        config, dist = source / 'wrangler.jsonc', source / 'dist'
        run(['node', 'scripts/release-artifacts.mjs', 'verify', str(dist)], kind + '-verify-artifacts')
        if part['phase'] == 'prepared':
            part['before'] = require({expected: 100})
            part['phase'] = 'uploading'
            save()
            run(wrangler('versions', 'upload', '--keep-vars', '--message', f"Ink Explorer {kind}: {state.get('message', 'Validated explorer update')}", config=config), kind + '-upload', {'WRANGLER_OUTPUT_FILE_PATH': str(report / (kind + '-upload.jsonl'))})
        if part['phase'] == 'uploading':
            records = [json.loads(line) for line in (report / (kind + '-upload.jsonl')).read_text().splitlines() if line.strip()]
            upload = next(row for row in reversed(records) if row.get('type') == 'version-upload' and row.get('version_id'))
            part['version'] = upload['version_id']
            run(wrangler('versions', 'view', part['version'], '--json', config=config), kind + '-uploaded-version')
            part['phase'] = 'uploaded'
            save()
        staged = {expected: 100, part['version']: 0}
        if part['phase'] == 'uploaded':
            require({expected: 100})
            part['phase'] = 'staging'
            save()
            run(wrangler('versions', 'deploy', f'{expected}@100', f"{part['version']}@0", '--yes', config=config), kind + '-stage')
        if part['phase'] == 'staging':
            part['staged'] = settle(staged)
            part['phase'] = 'staged'
            save()
        if part['phase'] == 'staged':
            require(staged)
            gate(kind + '-preflight', part, dist, True)
            browser_env = {'BASE_URL': ORIGIN, 'INK_RELEASE_VERSION': part['version'], 'ARRIVAL_OUTPUT': str(report / (kind + '-browser'))}
            run(['node', 'scripts/home-arrival-browser-test.mjs'], kind + '-browser', browser_env, cwd=browser_source)
            if kind == 'candidate':
                run(['node', 'scripts/record-locales-live-test.mjs'], 'candidate-record-locales', {**browser_env, 'EXPECTED_VERSION': part['version'], 'RECORD_LOCALES_OUTPUT': str(report / 'candidate-record-locales')})
                run(['node', 'scripts/search-handoff-browser-test.mjs'], 'candidate-search', {**browser_env, 'HANDOFF_OUTPUT': str(report / 'candidate-search')})
                run(['node', 'scripts/search-ime-browser-test.mjs'], 'candidate-ime', {**browser_env, 'IME_OUTPUT': str(report / 'candidate-ime')})
                run(['node', 'scripts/recovery-deadline-browser-test.mjs'], 'candidate-deadline', {**browser_env, 'DEADLINE_OUTPUT': str(report / 'candidate-deadline')})
                run(['node', 'scripts/page-arrival-browser-test.mjs'], 'candidate-pages', {**browser_env, 'PAGE_ARRIVAL_OUTPUT': str(report / 'candidate-pages')})
                run(['node', 'scripts/ledger-arrival-browser-test.mjs'], 'candidate-ledger', {**browser_env, 'LEDGER_ARRIVAL_OUTPUT': str(report / 'candidate-ledger')})
                run(['node', 'scripts/stream-first-browser-test.mjs'], 'candidate-stream-first', {**browser_env, 'STREAM_FIRST_OUTPUT': str(report / 'candidate-stream-first')})
                run(['node', 'scripts/stream-first-live-test.mjs'], 'candidate-stream-real', {**browser_env, 'EXPECTED_VERSION': part['version'], 'STREAM_LIVE_OUTPUT': str(report / 'candidate-stream-real')})
                run(['node', 'scripts/record-arrival-browser-test.mjs'], 'candidate-records', {**browser_env, 'RECORD_BROWSER_OUTPUT': str(report / 'candidate-records')})
                run(['node', 'scripts/record-arrival-live-test.mjs'], 'candidate-records-real', {**browser_env, 'EXPECTED_VERSION': part['version'], 'RECORD_LIVE_OUTPUT': str(report / 'candidate-records-real')})
                run(['node', 'scripts/profile-arrival-browser-test.mjs'], 'candidate-profiles', {**browser_env, 'PROFILE_BROWSER_OUTPUT': str(report / 'candidate-profiles')})
                run(['node', 'scripts/profile-arrival-live-test.mjs'], 'candidate-profiles-real', {**browser_env, 'EXPECTED_VERSION': part['version'], 'PROFILE_LIVE_OUTPUT': str(report / 'candidate-profiles-real')})
                run(['node', 'scripts/address-live-browser-test.mjs'], 'candidate-address-live', {**browser_env, 'ADDRESS_LIVE_OUTPUT': str(report / 'candidate-address-live')})
                run(['node', 'scripts/address-live-real-test.mjs'], 'candidate-address-real', {**browser_env, 'EXPECTED_VERSION': part['version'], 'ADDRESS_REAL_OUTPUT': str(report / 'candidate-address-real')})
                run(['node', 'scripts/address-activity-browser-test.mjs'], 'candidate-address-activity', {**browser_env, 'ADDRESS_ACTIVITY_OUTPUT': str(report / 'candidate-address-activity')})
                run(['node', 'scripts/address-activity-real-test.mjs'], 'candidate-address-activity-real', {**browser_env, 'EXPECTED_VERSION': part['version'], 'ADDRESS_ACTIVITY_REAL_OUTPUT': str(report / 'candidate-address-activity-real')})
                run(['node', 'scripts/address-activity-runtime-test.mjs'], 'candidate-activity-runtime', {**browser_env, 'EXPECTED_VERSION': part['version'], 'ADDRESS_ACTIVITY_RUNTIME_OUTPUT': str(report / 'candidate-activity-runtime')})
                run(['node', 'scripts/transaction-follow-browser-test.mjs'], 'candidate-transaction-follow', {**browser_env, 'TX_FOLLOW_OUTPUT': str(report / 'candidate-transaction-follow')})
                run(['node', 'scripts/transaction-follow-live-test.mjs'], 'candidate-transaction-follow-real', {**browser_env, 'EXPECTED_VERSION': part['version'], 'TX_FOLLOW_LIVE_OUTPUT': str(report / 'candidate-transaction-follow-real')})
                run(['node', 'scripts/network-arrival-browser-test.mjs'], 'candidate-network', {**browser_env, 'NETWORK_ARRIVAL_OUTPUT': str(report / 'candidate-network')})
                run(['node', 'scripts/rolling-count-browser-test.mjs'], 'candidate-rolling', {**browser_env, 'ROLLING_BROWSER_OUTPUT': str(report / 'candidate-rolling')})
            require(staged)
            part['phase'] = 'promoting'
            save()
            run(wrangler('versions', 'deploy', f"{part['version']}@100", '--yes', config=config), kind + '-promote')
        if part['phase'] == 'promoting':
            part['after'] = settle({part['version']: 100})
            part['phase'] = 'promoted'
            save()
        if part['phase'] == 'promoted':
            require({part['version']: 100})
            gate(kind + '-public', part, dist, False)
            run(['node', 'scripts/post-deploy-test.mjs'], kind + '-acceptance', {'BASE_URL': ORIGIN, 'EXPECTED_DIST': str(dist), 'POST_DEPLOY_DIR': str(report / (kind + '-acceptance'))})
            if kind == 'candidate':
                run(['node', 'scripts/record-locales-live-test.mjs'], 'public-record-locales', {'BASE_URL': ORIGIN, 'EXPECTED_VERSION': part['version'], 'RECORD_LOCALES_OUTPUT': str(report / 'public-record-locales')})
                run(['node', 'scripts/home-live-acceptance-test.mjs'], 'public-live', {'BASE_URL': ORIGIN, 'LIVE_OUTPUT': str(report / 'public-live')})
                run(['node', 'scripts/search-handoff-browser-test.mjs'], 'public-search', {'BASE_URL': ORIGIN, 'HANDOFF_OUTPUT': str(report / 'public-search')})
                run(['node', 'scripts/search-ime-browser-test.mjs'], 'public-ime', {'BASE_URL': ORIGIN, 'IME_OUTPUT': str(report / 'public-ime')})
                run(['node', 'scripts/recovery-deadline-browser-test.mjs'], 'public-deadline', {'BASE_URL': ORIGIN, 'DEADLINE_OUTPUT': str(report / 'public-deadline')})
                run(['node', 'scripts/page-arrival-browser-test.mjs'], 'public-pages', {'BASE_URL': ORIGIN, 'PAGE_ARRIVAL_OUTPUT': str(report / 'public-pages')})
                run(['node', 'scripts/ledger-arrival-browser-test.mjs'], 'public-ledger', {'BASE_URL': ORIGIN, 'LEDGER_ARRIVAL_OUTPUT': str(report / 'public-ledger')})
                run(['node', 'scripts/stream-first-browser-test.mjs'], 'public-stream-first', {'BASE_URL': ORIGIN, 'STREAM_FIRST_OUTPUT': str(report / 'public-stream-first')})
                run(['node', 'scripts/stream-first-live-test.mjs'], 'public-stream-real', {'BASE_URL': ORIGIN, 'EXPECTED_VERSION': part['version'], 'STREAM_LIVE_OUTPUT': str(report / 'public-stream-real')})
                run(['node', 'scripts/record-arrival-browser-test.mjs'], 'public-records', {'BASE_URL': ORIGIN, 'RECORD_BROWSER_OUTPUT': str(report / 'public-records')})
                run(['node', 'scripts/record-arrival-live-test.mjs'], 'public-records-real', {'BASE_URL': ORIGIN, 'EXPECTED_VERSION': part['version'], 'RECORD_LIVE_OUTPUT': str(report / 'public-records-real')})
                run(['node', 'scripts/profile-arrival-browser-test.mjs'], 'public-profiles', {'BASE_URL': ORIGIN, 'PROFILE_BROWSER_OUTPUT': str(report / 'public-profiles')})
                run(['node', 'scripts/profile-arrival-live-test.mjs'], 'public-profiles-real', {'BASE_URL': ORIGIN, 'EXPECTED_VERSION': part['version'], 'PROFILE_LIVE_OUTPUT': str(report / 'public-profiles-real')})
                run(['node', 'scripts/address-live-browser-test.mjs'], 'public-address-live', {'BASE_URL': ORIGIN, 'ADDRESS_LIVE_OUTPUT': str(report / 'public-address-live')})
                run(['node', 'scripts/address-live-real-test.mjs'], 'public-address-real', {'BASE_URL': ORIGIN, 'EXPECTED_VERSION': part['version'], 'ADDRESS_REAL_OUTPUT': str(report / 'public-address-real')})
                run(['node', 'scripts/address-activity-browser-test.mjs'], 'public-address-activity', {'BASE_URL': ORIGIN, 'ADDRESS_ACTIVITY_OUTPUT': str(report / 'public-address-activity')})
                run(['node', 'scripts/address-activity-real-test.mjs'], 'public-address-activity-real', {'BASE_URL': ORIGIN, 'EXPECTED_VERSION': part['version'], 'ADDRESS_ACTIVITY_REAL_OUTPUT': str(report / 'public-address-activity-real')})
                run(['node', 'scripts/address-activity-runtime-test.mjs'], 'public-activity-runtime', {'BASE_URL': ORIGIN, 'EXPECTED_VERSION': part['version'], 'ADDRESS_ACTIVITY_RUNTIME_OUTPUT': str(report / 'public-activity-runtime')})
                run(['node', 'scripts/transaction-follow-browser-test.mjs'], 'public-transaction-follow', {'BASE_URL': ORIGIN, 'TX_FOLLOW_OUTPUT': str(report / 'public-transaction-follow')})
                run(['node', 'scripts/transaction-follow-live-test.mjs'], 'public-transaction-follow-real', {'BASE_URL': ORIGIN, 'EXPECTED_VERSION': part['version'], 'TX_FOLLOW_LIVE_OUTPUT': str(report / 'public-transaction-follow-real')})
                run(['node', 'scripts/network-arrival-browser-test.mjs'], 'public-network', {'BASE_URL': ORIGIN, 'NETWORK_ARRIVAL_OUTPUT': str(report / 'public-network')})
                run(['node', 'scripts/network-arrival-live-test.mjs'], 'public-network-live', {'BASE_URL': ORIGIN, 'NETWORK_LIVE_OUTPUT': str(report / 'public-network-live')})
                run(['node', 'scripts/rolling-count-live-test.mjs'], 'public-rolling', {'BASE_URL': ORIGIN, 'ROLLING_LIVE_OUTPUT': str(report / 'public-rolling')})
            part['phase'] = 'verified'
            save()
        return part['version']

    save()
    if state['phase'] == 'preparing':
        state['before'] = require({state['expected']: 100})
        run(['node', 'scripts/record-workerd-test.mjs'], 'workerd-runtime', {'RECORD_WORKERD_OUTPUT': str(report / 'workerd-runtime')})
        run(['node', 'scripts/release-artifacts.mjs', 'prepare', 'dist', str(previous / 'dist')], 'prepare-artifacts')
        run(['node', 'scripts/prepare-compatibility.mjs', str(previous), str(ROOT / 'dist'), str(compatibility)], 'prepare-compatibility')
        state['phase'] = 'prepared'
        save()
    if state['phase'] != 'verified':
        state['phase'] = 'candidate' if state.get('compatibility', {}).get('phase') == 'verified' else 'compatibility'
        save()
    compatible_version = publish('compatibility', state['expected'], compatibility, previous_browser)
    if state['phase'] != 'verified':
        state['phase'] = 'candidate'
        save()
    version = publish('candidate', compatible_version, ROOT, ROOT)
    state['after'] = require({version: 100})
    state['phase'] = 'verified'
    save()
    print(f'Release {version}: verified. Report: {report}', flush=True)


if __name__ == '__main__':
    main()
