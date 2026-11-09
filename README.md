# Strangers wholesale publisher

Temporary publisher in georgefarrowgreen1/strangers for the tested change to strangerscoffee/StrangersRepo. Uses the existing isolated Actions branch and GitHub CLI device sign-in on a temporary hosted runner. Only georgefarrowgreen1 (292799750) is accepted. Credentials stay on that runner and are removed when it finishes.

Source: `0190360a451d84f880eb353d0dcdc46c56963474` on `feature/wholesale-polish`, based on deployed main `d217eb463aa0e061c546f690d3fd450c1b735fe0`. The frozen source and verified bundle match the tested commit.

This release adds saved business locations/default selection and immutable order location snapshots, fixes approved business names in ordering, and polishes customer naming, header, footer, baskets and built-in dialogs. All visible feature names are Wholesale; the existing preview.staffstrangerscoffee.com address and internal compatibility fields remain.

The new target branch has no allowed prior head (PRIOR=None). Unknown remote work is refused. The job pushes the exact verified commit without force, opens a normal PR, waits for Tests and squash-merges with an expected-head guard. Existing auto-merge races are rechecked safely. Cloudflare deploys main using its existing configuration. No direct main push or branch-rule bypass.

Validation passed: 131 API/security/data tests and 53 browser tests, Worker dry build, diff checks and phone/iPad light/dark visual review. Focused location ownership/snapshot/retry checks and the single-mouse-click regression also passed. No migrations, new services, DNS, billing or secrets.
