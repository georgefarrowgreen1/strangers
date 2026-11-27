# Strangers release publisher

Publishes staff and Admin passkey sign-in to `strangerscoffee/StrangersRepo`. The bundle contains the two reviewed commits through `534e48e446ec1b2ff691a8f6865606723e50b8d0` on production base `19ceb614672a28968a7d509b4297a46068ab2ac9`.

The existing GitHub workflow opens a pull request from `codex/staff-admin-passkeys` into `main`, waits for the Tests workflow, and squash merges for Cloudflare deployment.
