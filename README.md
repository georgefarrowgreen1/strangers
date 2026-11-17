# Strangers Admin asset recovery publisher

Source: `226ca1213d7616554dccf4e174d68867d8470f48`
Base: `350ae7e70a6294697f12169daa3ba04ec52e5df5`
Branch: `fix/admin-asset-loading-2026-11-17`

Publishes the frozen Admin asset recovery fix using the existing encrypted saved-user access. Identity/write permission, destination and exact-head guards, normal complete Tests and saved-user squash merge remain required. Existing narrow CI fixture retry safeguards are unchanged; application assertions and browser failures are never bypassed.

All 405 local API/unit tests and 313 browser tests passed. Phone/iPad light/dark visual checks cover recovered core and stylesheet failures. Pages, APIs, source snapshots, private images and all non-code records remain protected. Data-free code loads independently of account storage; the ordered bootstrap stops cascading execution and retries network loads once.

No new secret, migration, dependency, service or DNS change. Verify merged tree, Cloudflare build and live read-only resource/auth checks. Do not submit production mail, Slack messages or orders.
