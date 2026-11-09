# Strangers wholesale publisher

Temporary publisher in georgefarrowgreen1/strangers for the tested change to
strangerscoffee/StrangersRepo. It uses existing Actions settings and does not
change repository visibility or billing settings.

Source: `03c51f8191aeae4d434b429901244da32e63753c` on `feature/wholesale-catalogue-payments`, in the verified Git bundle.
The job uses GitHub CLI device sign-in on a temporary GitHub-hosted runner. Only
georgefarrowgreen1 (user ID 292799750) is accepted. Credentials remain on the
runner, are never printed or sent to the Codex workspace, and are removed at the
end. No credentials are stored in this repository.

The job pushes the verified branch, opens a normal PR into main, waits for Tests
and requests squash merge without overriding branch rules. Cloudflare deploys
main using the existing target configuration. It does not push to main or force
any branch.

The change adds catalogue creation/editing, photo upload/removal, bag pricing,
visibility/stock controls and per-customer payment terms across Admin and ordering.
Checkout rechecks availability and terms; saved orders retain their original
agreement. Existing account approval and staff isolation remain in place.
All 116 API tests and 33 browser tests passed. A Worker dry build succeeded.
