# Strangers wholesale publisher

Temporary publisher in georgefarrowgreen1/strangers for the tested change to
strangerscoffee/StrangersRepo. It uses existing Actions settings and does not
change repository visibility or billing settings.

Source: `09594cc0477d4ab6726dcdb6f15a8d9e624ba3d5` on `feature/wholesale-customer-accounts`, in the verified Git bundle.
The job uses GitHub CLI device sign-in on a temporary GitHub-hosted runner. Only
georgefarrowgreen1 (user ID 292799750) is accepted. Credentials remain on the
runner, are never printed or sent to the Codex workspace, and are removed at the
end. No credentials are stored in this repository.

The job pushes the verified branch, opens a normal PR into main, waits for Tests
and requests squash merge without overriding branch rules. Cloudflare deploys
main using the existing target configuration. It does not push to main or force
any branch.

The change adds customer registration with admin approval, isolated wholesale
accounts, business/delivery profiles, ordering, history and reorder; it also
removes the requested introduction and fixes product image proportions/access.
All 110 API tests and 29 browser tests passed. A Worker dry build succeeded.
