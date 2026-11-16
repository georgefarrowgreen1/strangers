"""Publish a verified change using an encrypted repository deployment secret."""

import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import urllib.request
import urllib.error


TARGET = "strangerscoffee/StrangersRepo"
BRANCH = "fix/production-audit-2026-11-16"
EXPECTED = "868706b6400b34593b7cf2199c028eef1b1230f0"
PRIOR = "c2ee2bd00bf1436c83d07e452e798fbc17c2c356"
EXPECTED_USER_ID = 292799750
ROOT = Path(__file__).resolve().parent


def redact(value, env=None):
    secrets = {mapping.get(name, "") for mapping in [os.environ, env or {}]
               for name in ["GH_TOKEN", "GITHUB_TOKEN", "PUBLISH_CHECK_TOKEN", "STRANGERS_DEPLOY_TOKEN"]}
    for secret in sorted((secret for secret in secrets if secret), key=len, reverse=True):
        value = value.replace(secret, "[REDACTED]")
    return value


def command(args, *, env, cwd=None):
    result = subprocess.run(args, env=env, cwd=cwd, text=True, capture_output=True)
    if result.returncode:
        detail = redact(result.stderr + result.stdout, env)[-1600:]
        raise RuntimeError(f"{args[0]} {args[1]} failed: {detail}")
    return result.stdout.strip()


def verify_destination(existing, *, env, cwd):
    if not existing:
        return
    parts = existing.split()
    if len(parts) != 2 or parts[1] != f"refs/heads/{BRANCH}":
        raise RuntimeError("The destination branch response was unexpected; refusing to publish.")
    head = parts[0]
    if head == EXPECTED:
        return
    if head != PRIOR:
        raise RuntimeError("The destination branch has other work; refusing to overwrite it.")
    try:
        command(["git", "merge-base", "--is-ancestor", PRIOR, EXPECTED], env=env, cwd=cwd)
    except RuntimeError:
        raise RuntimeError("The expected previous branch commit is not an ancestor of the tested commit; refusing to publish.") from None


class Progress:
    def __init__(self):
        self.repository = os.environ["GITHUB_REPOSITORY"]
        self.token = os.environ["PUBLISH_CHECK_TOKEN"]
        self.check_id = None

    def request(self, method, path, data):
        request = urllib.request.Request(
            f"https://api.github.com/repos/{self.repository}/{path}",
            data=json.dumps(data).encode(),
            headers={
                "Authorization": f"Bearer {self.token}",
                "Accept": "application/vnd.github+json",
                "Content-Type": "application/json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            method=method,
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)

    def update(self, title, summary, *, conclusion=None, url=None):
        body = {
            "status": "completed" if conclusion else "in_progress",
            "output": {"title": redact(title), "summary": redact(summary)},
        }
        if conclusion:
            body["conclusion"] = conclusion
        if url:
            body["details_url"] = url
        if self.check_id is None:
            body.update(name="Strangers deployment publisher", head_sha=os.environ["GITHUB_SHA"])
            self.check_id = self.request("POST", "check-runs", body)["id"]
        else:
            for attempt in range(3):
                try:
                    self.request("PATCH", f"check-runs/{self.check_id}", body)
                    break
                except urllib.error.HTTPError as error:
                    if error.code != 404 or attempt == 2:
                        raise
                    time.sleep(attempt + 1)  # A newly created check can briefly be absent on another API replica.
        print(title, flush=True)


def authenticate(env, progress):
    if not env.get("GH_TOKEN"):
        raise RuntimeError("STRANGERS_DEPLOY_TOKEN is missing. Add it as an encrypted Actions repository secret in georgefarrowgreen1/strangers, then rerun this workflow. No device sign-in was started.")
    progress.update("Verifying saved deployment access", "Using STRANGERS_DEPLOY_TOKEN from GitHub Actions secrets. Its value is never displayed or written to the checkout.")
    account = json.loads(command(["gh", "api", "user"], env=env))
    if account.get("id") != EXPECTED_USER_ID:
        raise RuntimeError("The deployment token does not belong to georgefarrowgreen1; no change was published.")
    repository = json.loads(command(["gh", "api", f"repos/{TARGET}"], env=env))
    if not repository.get("permissions", {}).get("push"):
        raise RuntimeError("The deployment token has no write access to StrangersRepo; no change was published.")
    progress.update("Saved deployment access verified", "The expected collaborator account has repository write access. No device sign-in is needed.")


def runner_environment(auth_dir, source):
    env = {key: value for key, value in source.items()
           if key not in {"GH_TOKEN", "GITHUB_TOKEN", "PUBLISH_CHECK_TOKEN", "STRANGERS_DEPLOY_TOKEN"}}
    token = source.get("STRANGERS_DEPLOY_TOKEN", "").strip()
    if token:
        env["GH_TOKEN"] = token
    env.update(GH_CONFIG_DIR=str(auth_dir), GH_BROWSER="/bin/true", GH_PROMPT_DISABLED="1", GIT_TERMINAL_PROMPT="0")
    return env


def transient_database_lock(log):
    # Rerun only the observed local migration fixture's single SQLite lock failure.
    return ("database is locked: SQLITE_BUSY" in log
            and bool(re.search(r"not ok \d+ - Migration 16 preserves legacy Sandbox tokens/mappings", log))
            and bool(re.search(r"# fail 1(?:\s|$)", log))
            and not bool(re.search(r"# fail (?:[2-9]|[1-9]\d+)(?:\s|$)", log)))


def transient_schema_read_lock(log):
    # Observed on this release: Wrangler's separate local SQL reader collided
    # with the running migration fixture. Never retry assertions or another query.
    return ("database is locked: SQLITE_BUSY" in log
            and bool(re.search(r"not ok \d+ - migrations run once each, in order, and are recorded; the list indexes are used", log))
            and "--local --persist-to" in log
            and "--json --command SELECT id FROM wholesale_invoice_settings" in log
            and "test/migration.test.mjs:85:" in log
            and bool(re.search(r"# fail 1(?:\s|$)", log))
            and not bool(re.search(r"# fail (?:[2-9]|[1-9]\d+)(?:\s|$)", log))
            and "ERR_ASSERTION" not in log and "AssertionError" not in log)


def transient_invoice_fixture_port(log):
    # One shared invoice before-hook failed to start; none of its nine cases ran.
    # Retry that observed infrastructure failure once, never an assertion failure.
    names = set(re.findall(r"not ok \d+ - ([^\r\n]+)", log))
    ports = set(re.findall(r"Address already in use \(127\.0\.0\.1:(\d+)\)", log))
    failures = set(re.findall(r"# fail (\d+)(?:\s|$)", log))
    return (len(names) == 9 and all(name.startswith("wholesale invoices:") for name in names)
            and len(ports) == 1 and failures == {"9"}
            and "failureType: 'hookFailed'" in log
            and "failureType: 'testCodeFailure'" not in log
            and "ERR_ASSERTION" not in log)


def use_saved_merge_identity(pr, url, env):
    """Keep the merge under the verified saved identity so production deploy events run."""
    if pr["headRefOid"] != EXPECTED:
        raise RuntimeError("The PR head changed; no merge setting was changed.")
    if pr["state"] == "OPEN" and pr.get("autoMergeRequest"):
        command(["gh", "pr", "merge", url, "--repo", TARGET, "--disable-auto"], env=env)


def publish(env, progress, work):
    progress.update("Verifying source", f"Authorised. Verifying the tested commit `{EXPECTED}`.")
    merged = json.loads(command(
        ["gh", "pr", "list", "--repo", TARGET, "--head", BRANCH, "--base", "main",
         "--state", "merged", "--json", "url,headRefOid,mergeCommit"], env=env,
    ))
    already = next((pr for pr in merged if pr["headRefOid"] == EXPECTED), None)
    if already:
        duplicates = json.loads(command(
            ["gh", "pr", "list", "--repo", TARGET, "--head", BRANCH, "--base", "main",
             "--state", "open", "--json", "url,headRefOid"], env=env,
        ))
        for duplicate in duplicates:
            if duplicate["headRefOid"] != EXPECTED:
                continue
            number = duplicate["url"].removeprefix(f"https://github.com/{TARGET}/pull/")
            if not number.isdigit():
                raise RuntimeError("A duplicate PR URL did not match the verified repository.")
            command(["gh", "api", "--method", "PATCH", f"repos/{TARGET}/pulls/{number}",
                     "-f", "state=closed"], env=env)
        progress.update("Verified release already squash-merged", f"[{already['url']}]({already['url']})\n\nMerged as `{already['mergeCommit']['oid']}`. No duplicate PR or branch was created.", conclusion="success", url=already["url"])
        return
    source = work / "StrangersRepo"
    command(["git", "clone", "--no-checkout", f"https://github.com/{TARGET}.git", str(source)], env=env)
    bundle = str(ROOT / "wholesale-staff-integration.bundle")
    command(["git", "bundle", "verify", bundle], env=env, cwd=source)
    command(["git", "fetch", bundle, f"refs/heads/{BRANCH}:refs/heads/{BRANCH}"], env=env, cwd=source)
    actual = command(["git", "rev-parse", BRANCH], env=env, cwd=source)
    if actual != EXPECTED:
        raise RuntimeError("Source commit verification failed; no branch was pushed.")
    existing = command(["git", "ls-remote", "--heads", "origin", BRANCH], env=env, cwd=source)
    verify_destination(existing, env=env, cwd=source)
    command(
        ["git", "-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential",
         "push", "origin", f"refs/heads/{BRANCH}:refs/heads/{BRANCH}"],
        env=env, cwd=source,
    )
    prs = json.loads(command(
        ["gh", "pr", "list", "--repo", TARGET, "--head", BRANCH, "--base", "main",
         "--state", "open", "--json", "url"], env=env,
    ))
    if prs:
        url = prs[0]["url"]
        number = url.removeprefix(f"https://github.com/{TARGET}/pull/")
        if not number.isdigit():
            raise RuntimeError("The existing PR URL did not match the verified repository.")
        metadata = work / "pr-metadata.json"
        metadata.write_text(json.dumps({
            "title": "Fix all seven production audit findings",
            "body": (ROOT / "pull-request.txt").read_text(),
        }))
        command(
            ["gh", "api", "--method", "PATCH", f"repos/{TARGET}/pulls/{number}",
             "--input", str(metadata)], env=env,
        )
    else:
        url = command(
            ["gh", "pr", "create", "--repo", TARGET, "--head", BRANCH, "--base", "main",
             "--title", "Fix all seven production audit findings",
             "--body-file", str(ROOT / "pull-request.txt")], env=env,
        ).splitlines()[-1]
    progress.update("PR published; waiting for Tests", f"[{url}]({url})\n\nWaiting for the existing Tests workflow before squash merge.", url=url)
    print(f"Pull request: {url}", flush=True)
    # Allow the target Tests job its full 25-minute budget before reporting a timeout.
    deadline = time.monotonic() + 1560
    merge_busy_since = None
    retried_test = None
    retried_at = 0

    def read_pr():
        return json.loads(command(
            ["gh", "pr", "view", url, "--repo", TARGET, "--json", "state,headRefOid,mergeCommit,autoMergeRequest"], env=env,
        ))

    def finished(pr):
        if pr["headRefOid"] != EXPECTED:
            raise RuntimeError("The PR head changed; no merge was requested by this publisher.")
        if pr["state"] == "MERGED":
            progress.update("Production audit fixes squash-merged", f"[{url}]({url})\n\nMerged as `{pr['mergeCommit']['oid']}`. Cloudflare can now deploy main.", conclusion="success", url=url)
            return True
        if pr["state"] != "OPEN":
            raise RuntimeError("The PR closed without merging; no merge was requested by this publisher.")
        return False

    while time.monotonic() < deadline:
        pr = read_pr()
        if finished(pr):
            return
        use_saved_merge_identity(pr, url, env)
        runs = json.loads(command(
            ["gh", "api", f"repos/{TARGET}/actions/runs?head_sha={EXPECTED}&event=pull_request&per_page=100"], env=env,
        ))["workflow_runs"]
        tests = sorted((r for r in runs if r["name"] == "Tests"), key=lambda r: r["id"], reverse=True)
        if tests and tests[0]["status"] == "completed":
            if tests[0]["conclusion"] != "success":
                run = tests[0]
                identity = (run["id"], run.get("run_attempt", 1))
                if retried_test == identity and time.monotonic() - retried_at < 60:
                    time.sleep(5)
                    continue
                if retried_test is None and run["conclusion"] == "failure" and run.get("run_attempt", 1) == 1:
                    log = command(["gh", "run", "view", str(run["id"]), "--repo", TARGET, "--log-failed"], env=env)
                    if transient_database_lock(log) or transient_schema_read_lock(log) or transient_invoice_fixture_port(log):
                        command(["gh", "run", "rerun", str(run["id"]), "--repo", TARGET, "--failed"], env=env)
                        retried_test, retried_at = identity, time.monotonic()
                        progress.update("Retrying a temporary test fixture startup failure", f"[{url}]({url})\n\nA test fixture hit the verified SQLite lock or invoice-server port collision. Rerunning its normal Tests job once; a successful test run is still required before merge.", url=url)
                        time.sleep(5)
                        continue
                raise RuntimeError(f"Tests concluded {run['conclusion']}; the PR has been left for review: {url}")
            try:
                command(
                    ["gh", "pr", "merge", url, "--repo", TARGET, "--squash", "--delete-branch",
                     "--match-head-commit", EXPECTED], env=env,
                )
                merge_busy_since = None
            except RuntimeError as error:
                # The repository's own auto-merge may finish between our state read and merge call.
                # Re-read before reporting a failure; a brief mergeability delay never bypasses rules.
                if finished(read_pr()):
                    return
                detail = str(error).lower()
                if not any(message in detail for message in ["not mergeable", "already been merged"]):
                    raise
                if merge_busy_since is None:
                    merge_busy_since = time.monotonic()
                if time.monotonic() - merge_busy_since >= 60:
                    raise
        time.sleep(10)
    progress.update("PR ready; checks still running", f"[{url}]({url})\n\nThe PR remains open. The target repository's existing auto-merge workflow can squash it after its required checks pass.", conclusion="neutral", url=url)


def main():
    progress = Progress()
    with tempfile.TemporaryDirectory(prefix="wholesale-publisher-") as directory:
        work = Path(directory)
        auth_dir = work / "github-auth"
        auth_dir.mkdir(mode=0o700)
        env = runner_environment(auth_dir, os.environ)
        try:
            authenticate(env, progress)
            publish(env, progress, work)
        except Exception as error:
            progress.update("Publication stopped", str(error), conclusion="failure")
            raise SystemExit(1) from None
        finally:
            shutil.rmtree(auth_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
