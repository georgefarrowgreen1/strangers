# Strangers forecasting deployment publisher

This release publishes `feat/forecast-backtesting` to `strangerscoffee/StrangersRepo` through the existing encrypted `STRANGERS_DEPLOY_TOKEN` Actions secret. It verifies the expected collaborator and write access, checks the frozen bundle and destination branch, creates a ready pull request and waits for the full required Tests workflow before a saved-user squash merge. Cloudflare then deploys main.

Source: `a80a57326fb37d0525cb811ca13940df6770b4c8`
Base: `9ebb83c5a0d8807ee99e505b9637dbdcd09a5d08`
Title: Improve forecast selection and historical validation

The source compares six bounded forecasting methods using existing history, fixes date alignment, reconciles coffee predictions with totals and reports historical test error. Existing records, import cutover and roast-plan rules are unchanged. No migration, dependency, configuration, external service or secret change is needed.

Local validation: 361 API/maths tests plus typecheck passed. Two focused Insights browser journeys and phone/iPad light/dark layout review passed. The full local browser suite was attempted, then interrupted after Chromium Target crashed and process EAGAIN errors before pages opened. It is not claimed to have passed. The complete normal API/browser workflow on GitHub must succeed before merge. Publisher safeguard tests: 14 passed.

After merge, verify the exact main commit's Cloudflare production build, then run the forecasting release read-only HTTP and browser scripts. Protected admin assets and APIs must remain protected. Do not place production orders, send emails or alter customer data during verification.

The saved-user merge identity, frozen source/destination checks, secret redaction and narrowly defined single test-fixture retry safeguards remain unchanged. No retry is permitted for application assertions or generic browser failures.
