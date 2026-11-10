import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch
import publish


class Progress:
    def __init__(self):
        self.messages = []

    def update(self, title, summary):
        self.messages.append((title, summary))


class AuthenticationTests(unittest.TestCase):
    def test_repository_secret_is_the_only_authentication_source(self):
        source = {"PATH": "/bin", "GH_TOKEN": "untrusted-token", "GITHUB_TOKEN": "job-only-token",
                  "PUBLISH_CHECK_TOKEN": "progress-token", "STRANGERS_DEPLOY_TOKEN": " saved-token "}
        env = publish.runner_environment(Path("/temporary/auth"), source)
        self.assertEqual(env["GH_TOKEN"], "saved-token")
        for name in ["GITHUB_TOKEN", "PUBLISH_CHECK_TOKEN", "STRANGERS_DEPLOY_TOKEN"]:
            self.assertNotIn(name, env)
        self.assertEqual(env["PATH"], "/bin")
        self.assertEqual(source["GH_TOKEN"], "untrusted-token")
        self.assertEqual(env["GIT_TERMINAL_PROMPT"], "0")

    def test_missing_secret_stops_without_device_authentication(self):
        env = publish.runner_environment(Path("/temporary/auth"), {"GH_TOKEN": "other-token"})
        with patch.object(publish, "command") as command:
            with self.assertRaisesRegex(RuntimeError, "STRANGERS_DEPLOY_TOKEN is missing"):
                publish.authenticate(env, Progress())
            command.assert_not_called()

    def test_expected_collaborator_and_write_permission_are_verified(self):
        progress = Progress()
        responses = [json.dumps({"id": publish.EXPECTED_USER_ID}), json.dumps({"permissions": {"push": True}})]
        with patch.object(publish, "command", side_effect=responses) as command:
            publish.authenticate({"GH_TOKEN": "private-test-token"}, progress)
            self.assertEqual([call.args[0] for call in command.call_args_list],
                             [["gh", "api", "user"], ["gh", "api", "repos/" + publish.TARGET]])
        self.assertNotIn("private-test-token", str(progress.messages))
        self.assertIn("Saved deployment access verified", str(progress.messages))

    def test_wrong_account_stops_before_repository_access(self):
        with patch.object(publish, "command", return_value=json.dumps({"id": 1})) as command:
            with self.assertRaisesRegex(RuntimeError, "does not belong"):
                publish.authenticate({"GH_TOKEN": "private-test-token"}, Progress())
            self.assertEqual(command.call_count, 1)

    def test_read_only_token_cannot_publish(self):
        responses = [json.dumps({"id": publish.EXPECTED_USER_ID}), json.dumps({"permissions": {"push": False}})]
        with patch.object(publish, "command", side_effect=responses):
            with self.assertRaisesRegex(RuntimeError, "no write access"):
                publish.authenticate({"GH_TOKEN": "private-test-token"}, Progress())

    def test_failed_command_redacts_secret_before_reporting(self):
        token = "private-token-that-must-not-leak"
        result = subprocess.CompletedProcess([], 1, stdout="", stderr="Denied token=" + token)
        with patch.object(publish.subprocess, "run", return_value=result):
            with self.assertRaises(RuntimeError) as failure:
                publish.command(["gh", "api", "user"], env={"GH_TOKEN": token})
        self.assertNotIn(token, str(failure.exception))
        self.assertIn("[REDACTED]", str(failure.exception))

    def test_progress_redacts_repository_secret(self):
        with patch.dict(publish.os.environ, {"GITHUB_SHA": "source-sha", "GITHUB_REPOSITORY": "owner/publisher", "PUBLISH_CHECK_TOKEN": "progress-token", "STRANGERS_DEPLOY_TOKEN": "private-deploy-token"}):
            progress = publish.Progress()
            with patch.object(progress, "request", return_value={"id": 42}) as request:
                progress.update("Status", "Denied private-deploy-token")
                self.assertNotIn("private-deploy-token", json.dumps(request.call_args.args[2]))

    def test_destination_branch_cannot_be_overwritten(self):
        with self.assertRaisesRegex(RuntimeError, "other work"):
            publish.verify_destination("unrelated refs/heads/" + publish.BRANCH, env={}, cwd=None)


class RetryTests(unittest.TestCase):
    def test_only_single_observed_migration_lock_is_retryable(self):
        log = "not ok 132 - Migration 16 preserves legacy Sandbox tokens/mappings\n database is locked: SQLITE_BUSY\n# fail 1\n"
        self.assertTrue(publish.transient_database_lock(log))
        self.assertFalse(publish.transient_database_lock(log.replace("# fail 1", "# fail 2")))
        self.assertFalse(publish.transient_database_lock(log.replace("# fail 1", "# fail 10")))
        self.assertFalse(publish.transient_database_lock(log.replace("database is locked: SQLITE_BUSY", "assertion failed")))
        self.assertFalse(publish.transient_database_lock(log.replace("Migration 16 preserves legacy Sandbox tokens/mappings", "another test")))


if __name__ == "__main__":
    unittest.main()
