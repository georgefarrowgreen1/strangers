# Strangers Wholesale catalogue publisher

Temporary publisher in georgefarrowgreen1/strangers for the requested customer sorting and editable grind options in strangerscoffee/StrangersRepo. GitHub CLI device sign-in verifies georgefarrowgreen1 (292799750) and target push access. Credentials stay on the temporary runner and are cleared at completion.

Frozen source: `a2dfeda4099a66720513ec6282994fca0afe2411`, branch `feature/wholesale-grind-options`, based on deployed main `ca6ae4d734b27325a8dc630ea8e84fb7dcd6b883`. The exact source bundle is verified locally.

Customer catalogue refresh is replaced by an icon-only filter and animated price-sorting dropdown. Order/invoice refresh icons spin during loading and respect reduced motion. Admin coffee editors manage per-coffee grind names, enabled choices, removal and custom options. Checkout validates against the selected coffee and preserves immutable historical labels/idempotent retries. Renaming retires option IDs to prevent silently changing a reviewed basket. Existing versioned JSON/backups store settings without a migration.

PRIOR=None refuses unknown destination branch work. Normal non-forced branch push, ready pull request, required Tests, expected-head squash, then Cloudflare main deployment. No direct main push or branch-rule bypass.

Validation: npm test passes TypeScript and all 169 API/PDF tests; npm run test:e2e passes all 87 browser tests (256 total). The suite includes per-coffee grind permission/validation, version conflicts, custom labels, retired variants and immutable retries, plus customer sorting, retained selections, refresh busy/failure/reduced-motion behavior and admin/customer grind workflows on phone, iPad and desktop in both themes. Focused screenshots were reviewed. Worker dry build, JavaScript syntax, clean-tree and diff checks pass.
