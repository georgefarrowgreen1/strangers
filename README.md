# Strangers release publisher

Source commit `7f582462eb4372494b44d1ee60a8e480544f4cc7` based on `ba67d601ff97c4248b1eb84fb064b618618c1176` via `codex/branded-retail-preview`.

Publishes the consumer storefront at the preview hostname through GitHub and the existing Cloudflare Workers Build. The workflow verifies deployment identity and waits for GitHub Tests before merging.
