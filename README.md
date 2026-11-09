# Strangers wholesale publisher

This isolated branch in `georgefarrowgreen1/strangers` is a temporary publishing job
for the already-tested change to `strangerscoffee/StrangersRepo`. This personal
repository was empty before adding the publisher. It uses its existing GitHub
Actions settings and does not change repository visibility or billing settings.

The job opens GitHub CLI's normal device sign-in on a temporary GitHub-hosted
runner. Its check summary shows the one-time code. Only the GitHub account
`georgefarrowgreen1` (user ID 292799750) is accepted. Personal credentials remain on
the runner, are never printed, and are removed at the end. They are not returned
to the Codex workspace or stored in this repository.

The source is the Git bundle in this branch. The publisher verifies the exact
commit `4020c82682631db0707db9f23cc2b5f007e1e081`, pushes it as
`feature/wholesale-admin-preview-host` to StrangersRepo, and opens a normal PR into
main. It waits for the existing Tests workflow before requesting a squash merge;
it does not bypass branch protection, force-push, or push directly to main.
Cloudflare deploys main using the target project's existing configuration.

The source change passed all 104 API/model tests and all 25 browser tests, plus a
Worker dry build. Ordering uses Staff Login at preview.staffstrangerscoffee.com;
the management dashboard is a Wholesale item in the existing Admin menu.
