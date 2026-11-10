# Strangers Wholesale desktop publisher

Temporary publisher in georgefarrowgreen1/strangers for the requested Wholesale Admin sidebar and order-workspace refinement in strangerscoffee/StrangersRepo. Normal GitHub CLI device sign-in accepts only georgefarrowgreen1 (292799750), verifies target push access, and removes credentials from the temporary runner when finished.

Source: `265eda447325ee547000f92361cae5af30730c09` on `feature/wholesale-admin-desktop-refinement`, based on deployed main `c5ea889f2f4fab4b90f325349b7bb94761aea205`. The exact frozen source bundle is verified locally.

Desktop sections move into the expandable Wholesale sidebar group, keeping Orders as the parent-label default and pending reviews beside Customers. The main Orders workspace shows only its two preparation metrics and work queue. List headings, counts, search, filters and rows form one panel. Narrow desktop search/filters stack; wider desktop controls share a row. Empty states explain the next step and offer Clear filters. Totals retain aligned columns without a next action; initial invoice setup sits beside the issued list. Mobile section navigation stays available; breakpoint changes retain open drafts and do not reload wholesale data.

Scope is five front-end files plus design documentation, with no backend or data-model changes.

The new branch has no allowed prior head (PRIOR=None). Unknown remote work is refused. Push is non-forced; a normal ready PR waits for required Tests before an expected-head squash merge. No direct main push or branch-rule bypass.

Validation: npm test passes TypeScript and all 167 API/PDF tests; npm run test:e2e passes all 75 browser tests (242 total). Manual local QA passes 80 empty/populated layouts across desktop 1180/1440/1680, phone 393 and iPad 820 in both themes, plus 30 filter-reset flows, two sidebar/navigation/draft-resize flows and two short-laptop checks at 1024 x 640. Reviewed long names, aligned totals, images and representative editors. Worker dry build, script syntax and diff checks pass.
