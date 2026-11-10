"""Publish a verified change with the user's normal GitHub CLI device sign-in."""

import json
import os
from pathlib import Path
import re
import selectors
import shutil
import subprocess
import tempfile
import time
import urllib.request


TARGET = "strangerscoffee/StrangersRepo"
BRANCH = "feature/wholesale-trade-domain"
EXPECTED = "419deadf5766c0801e1e8256c5a6c102b6eda215"
PRIOR = None
EXPECTED_USER_ID = 292799750
ROOT = Path(__file__).resolve().parent


def command(args, *, env, cwd=None):
    result = subprocess.run(args, env=env, cwd=cwd, text=True, capture_output=True)
    if result.returncode:
        detail = (result.stderr + result.stdout)[-1600:]
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
            "output": {"title": title, "summary": summary},
        }
        if conclusion:
            body["conclusion"] = conclusion
        if url:
            body["details_url"] = url
        if self.check_id is None:
            body.update(name="Strangers wholesale domain publication", head_sha=os.environ["GITHUB_SHA"])
            self.check_id = self.request("POST", "check-runs", body)["id"]
        else:
            self.request("PATCH", f"check-runs/{self.check_id}", body)
        print(title, flush=True)


def authenticate(env, progress):
    progress.update("Starting GitHub sign-in", "Preparing GitHub CLI device authentication.")
    process = subprocess.Popen(
        ["gh", "auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web"],
        env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )
    process.stdin.write(b"\n")
    process.stdin.close()
    selector = selectors.DefaultSelector()
    selector.register(process.stdout, selectors.EVENT_READ)
    output = ""
    displayed = False
    deadline = time.monotonic() + 540
    try:
        while process.poll() is None:
            if time.monotonic() >= deadline:
                raise TimeoutError("GitHub device authorisation expired; no change was published.")
            for key, _ in selector.select(timeout=1):
                chunk = os.read(key.fileobj.fileno(), 4096)
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                output = (output + chunk.decode(errors="replace"))[-8192:]
                match = re.search(r"\b[A-Z0-9]{4}-[A-Z0-9]{4}\b", output)
                if match and not displayed:
                    code = match.group()
                    summary = (
                        f"Open https://github.com/login/device and enter **{code}**.\n\n"
                        "Sign in as **georgefarrowgreen1** to authorise GitHub CLI on this temporary "
                        f"runner. It will publish the tested customer-domain routing change `{EXPECTED}` to "
                        f"**{TARGET}** through a normal pull request and wait for Tests before squash merge. "
                        "Credentials stay on the runner and are removed when it finishes."
                    )
                    progress.update("GitHub authorisation required", summary)
                    print(f"Device code: {code} at https://github.com/login/device", flush=True)
                    displayed = True
        if process.returncode:
            raise RuntimeError("GitHub CLI device sign-in did not complete; no change was published.")
    finally:
        selector.close()
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=10)

    account = json.loads(command(["gh", "api", "user"], env=env))
    if account["id"] != EXPECTED_USER_ID:
        raise RuntimeError("The authorised account is not georgefarrowgreen1; no change was published.")
    repository = json.loads(command(["gh", "api", f"repos/{TARGET}"], env=env))
    if not repository.get("permissions", {}).get("push"):
        raise RuntimeError("GitHub did not grant this account write access to StrangersRepo.")


def publish(env, progress, work):
    progress.update("Verifying source", f"Authorised. Verifying the tested commit `{EXPECTED}`.")
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
    else:
        url = command(
            ["gh", "pr", "create", "--repo", TARGET, "--head", BRANCH, "--base", "main",
             "--title", "Wholesale: use strangerscoffee.trade for customer ordering",
             "--body-file", str(ROOT / "pull-request.txt")], env=env,
        ).splitlines()[-1]
    progress.update("PR published; waiting for Tests", f"[{url}]({url})\n\nWaiting for the existing Tests workflow before squash merge.", url=url)
    print(f"Pull request: {url}", flush=True)
    deadline = time.monotonic() + 1080
    merge_busy_since = None

    def read_pr():
        return json.loads(command(
            ["gh", "pr", "view", url, "--repo", TARGET, "--json", "state,headRefOid,mergeCommit"], env=env,
        ))

    def finished(pr):
        if pr["headRefOid"] != EXPECTED:
            raise RuntimeError("The PR head changed; no merge was requested by this publisher.")
        if pr["state"] == "MERGED":
            progress.update("Wholesale domain change squash-merged", f"[{url}]({url})\n\nMerged as `{pr['mergeCommit']['oid']}`. Cloudflare can now deploy main.", conclusion="success", url=url)
            return True
        if pr["state"] != "OPEN":
            raise RuntimeError("The PR closed without merging; no merge was requested by this publisher.")
        return False

    while time.monotonic() < deadline:
        if finished(read_pr()):
            return
        runs = json.loads(command(
            ["gh", "api", f"repos/{TARGET}/actions/runs?head_sha={EXPECTED}&event=pull_request&per_page=100"], env=env,
        ))["workflow_runs"]
        tests = sorted((r for r in runs if r["name"] == "Tests"), key=lambda r: r["id"], reverse=True)
        if tests and tests[0]["status"] == "completed":
            if tests[0]["conclusion"] != "success":
                raise RuntimeError(f"Tests concluded {tests[0]['conclusion']}; the PR has been left for review: {url}")
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
        env = {key: value for key, value in os.environ.items()
               if key not in {"GH_TOKEN", "GITHUB_TOKEN", "PUBLISH_CHECK_TOKEN"}}
        env.update(GH_CONFIG_DIR=str(auth_dir), GH_BROWSER="/bin/true", GH_PROMPT_DISABLED="1", GIT_TERMINAL_PROMPT="0")
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
