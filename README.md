# Strangers wholesale publisher

Temporary publisher in georgefarrowgreen1/strangers for the requested changes to strangerscoffee/StrangersRepo. It uses normal GitHub CLI device sign-in on an isolated Actions runner and accepts only georgefarrowgreen1 (292799750). Credentials stay on the runner and are removed when the job finishes.

Source: `1f4a3f5f864ebb25218142013d99cf4f7fd8adbb` on `feature/wholesale-mobile-refinements`, based on deployed main `4d91c9737d1e162b8ad3729bfed6d66b9bcc6b73`. The Git bundle contains the exact frozen source and was verified locally.

This release changes the mobile Admin tabs to Overview, Wholesale, People, Activity and More, puts Sites in More, uses the actual Strangers logo and removes the Wholesale subtitle. Customer account controls collapse smoothly while scrolling on mobile. Confirmed checkout clears matching carts safely across tabs without discarding newer baskets or uncertain recovery. Admins can add/edit/remove dispatch tracking links, which customers can open from their own dispatched delivery orders. No migration, new service, secret, hostname or payment action.

The new target branch has no allowed prior head (PRIOR=None). Unknown remote work is refused. The exact verified commit is pushed without force, a normal ready PR is opened, and the job waits for required Tests before a squash merge with an expected-head guard. No direct main push or branch-rule bypass.

Validation: npm test passed all 147 API/PDF tests with TypeScript; npm run test:e2e passed all 63 browser tests (210 total). Focused tracking API and dispatch/account journeys passed. Cart cases cover stale tabs, storage failure, newer-cart preservation and uncertain recovery. Worker dry build passed. Phone/iPad/desktop light/dark visual review covered 20 Admin navigation/logo states and 28 mobile header focus/reduced-motion/resize states.
