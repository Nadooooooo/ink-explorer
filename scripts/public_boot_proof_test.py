import unittest
from pathlib import Path
import public_boot_proof as proof


class BootProof(unittest.TestCase):
    def harness(self, scope='user', change=None, linger='yes', changed_content=False):
        calls = []
        user_path = Path.home() / '.config/systemd/user' / proof.UNIT
        system_path = Path('/etc/systemd/system') / proof.UNIT
        def run(args, **kwargs):
            calls.append(args)
            if args[0] == 'loginctl':
                return linger + '\n'
            actual_scope = 'user' if '--user' in args else 'system'
            if actual_scope != scope:
                return 'UnitFileState=disabled\nActiveState=inactive\n'
            values = {'UnitFileState': 'enabled', 'ActiveState': 'active',
                      'SubState': 'exited', 'Result': 'success',
                      'FragmentPath': str(user_path if scope == 'user' else system_path),
                      'WorkingDirectory': str(proof.ROOT)}
            values.update(change or {})
            return '\n'.join(f'{key}={value}' for key, value in values.items())
        def read(path):
            if changed_content and path in (user_path, system_path):
                return b'Unexpected executable'
            return b'Reviewed explicit bootstrap'
        return calls, lambda: proof.verify_boot_persistence(run=run, read=read)

    def test_enabled_user_unit_with_linger_and_exact_source_passes(self):
        calls, verify = self.harness()
        result = verify()
        self.assertEqual(result['scope'], 'user')
        self.assertEqual(result['linger'], 'yes')
        self.assertTrue(any(args[0] == 'loginctl' for args in calls))

    def test_enabled_system_unit_passes_without_user_manager(self):
        calls, verify = self.harness(scope='system')
        self.assertEqual(verify()['scope'], 'system')
        self.assertFalse(any(args[0] == 'loginctl' for args in calls))

    def test_disabled_unit_cannot_pass(self):
        _, verify = self.harness(change={'UnitFileState': 'disabled'})
        with self.assertRaisesRegex(AssertionError, 'not enabled'):
            verify()

    def test_inactive_unit_cannot_pass(self):
        _, verify = self.harness(change={'ActiveState': 'inactive'})
        with self.assertRaisesRegex(AssertionError, 'not active'):
            verify()

    def test_running_or_failed_bootstrap_cannot_pass(self):
        for change in ({'SubState': 'running'}, {'Result': 'exit-code'}):
            _, verify = self.harness(change=change)
            with self.assertRaises(AssertionError):
                verify()

    def test_different_unit_path_or_working_directory_cannot_pass(self):
        for change in ({'FragmentPath': '/tmp/other.service'}, {'WorkingDirectory': '/tmp'}):
            _, verify = self.harness(change=change)
            with self.assertRaises(AssertionError):
                verify()

    def test_modified_installed_unit_cannot_pass(self):
        _, verify = self.harness(changed_content=True)
        with self.assertRaisesRegex(AssertionError, 'differs'):
            verify()

    def test_user_unit_requires_linger(self):
        _, verify = self.harness(linger='no')
        with self.assertRaisesRegex(AssertionError, 'without login'):
            verify()


if __name__ == '__main__':
    unittest.main()
