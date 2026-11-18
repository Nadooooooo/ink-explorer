"""Verify the exact enabled bootstrap unit, including user-manager boot persistence."""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UNIT = 'inkexplorer-public-bootstrap.service'


def verify_boot_persistence(run=subprocess.check_output, read=lambda p: p.read_bytes()):
    failures = []
    for scope, flags, fragment, expected in [
        ('system', [], Path('/etc/systemd/system') / UNIT,
         ROOT / 'ops/inkexplorer-public-bootstrap.service'),
        ('user', ['--user'], Path.home() / '.config/systemd/user' / UNIT,
         ROOT / 'ops/inkexplorer-public-bootstrap.user.service'),
    ]:
        try:
            raw = run(['systemctl', *flags, 'show', UNIT,
                       '-p', 'UnitFileState', '-p', 'ActiveState', '-p', 'SubState',
                       '-p', 'Result', '-p', 'FragmentPath', '-p', 'WorkingDirectory'],
                      text=True, stderr=subprocess.DEVNULL, timeout=15)
            properties = dict(line.split('=', 1) for line in raw.splitlines() if '=' in line)
            for key, value, message in [
                ('UnitFileState', 'enabled', 'unit is not enabled'),
                ('ActiveState', 'active', 'unit is not active'),
                ('SubState', 'exited', 'bootstrap has not completed'),
                ('Result', 'success', 'bootstrap failed'),
                ('FragmentPath', str(fragment), 'unexpected unit source'),
                ('WorkingDirectory', str(ROOT), 'unexpected working directory'),
            ]:
                if properties.get(key) != value:
                    raise AssertionError(message)
            content = read(fragment)
            if content != read(expected):
                raise AssertionError('installed unit differs from reviewed configuration')
            linger = None
            if scope == 'user':
                linger = run(['loginctl', 'show-user', str(Path.home().owner()),
                              '-p', 'Linger', '--value'], text=True, timeout=15).strip()
                if linger != 'yes':
                    raise AssertionError('user manager does not persist without login')
            return {'scope': scope, 'unit': UNIT, 'properties': properties,
                    'linger': linger, 'unitSha256': hashlib.sha256(content).hexdigest()}
        except (AssertionError, OSError, subprocess.SubprocessError) as error:
            failures.append(f'{scope}: {error}')
    raise AssertionError('Boot persistence not verified: ' + '; '.join(failures))


if __name__ == '__main__':
    print(json.dumps(verify_boot_persistence()))
