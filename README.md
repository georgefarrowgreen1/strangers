# Strangers Wholesale desktop publisher

Temporary publisher in georgefarrowgreen1/strangers for the requested Wholesale Admin desktop refinement in strangerscoffee/StrangersRepo. Normal GitHub CLI device sign-in accepts only georgefarrowgreen1 (292799750), verifies target push access, and removes credentials from the temporary runner when finished.

Source: `9789142969fefc2ed9ff312988c5281b8a69636a` on `feature/wholesale-admin-desktop-refinement`, based on deployed main `c5ea889f2f4fab4b90f325349b7bb94761aea205`. The exact frozen source bundle is verified locally.

Desktop summary metrics become one compact group and section navigation fits its labels. List headings, counts, search, filters and rows form a single panel. Narrow desktop search/filters stack; wider desktop controls share a row. Empty states explain the next step and offer Clear filters for unmatched results. Totals retain aligned columns when an order has no next action. Initial invoice setup sits beside the issued-invoice list on desktop. Phone layouts and existing sheets remain native to Admin.

Changes are limited to four front-end files and design documentation. There is no migration or new service. The source contains no production records or credentials.

The new branch has no allowed prior head (PRIOR=None). Unknown remote work is refused. Push is non-forced; a normal ready PR waits for required Tests before an expected-head squash merge. No direct main push or branch-rule bypass.

Validation: TypeScript and all 167 API/PDF tests pass; all 75 browser tests pass (242 total). Manual local QA passes 80 empty/populated layouts across desktop 1180/1440/1680, phone 393 and iPad 820 in light/dark mode, plus 30 filter-reset flows. Representative editors and long record names were reviewed. Worker dry build, syntax and diff checks pass.
