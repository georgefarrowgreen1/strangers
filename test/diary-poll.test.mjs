import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

test("a diary subscription added during a poll gets its first snapshot immediately", async () => {
  const timers = new Map();
  function runTimer(delay) {
    assert.equal(timers.size, 1);
    const [[id, timer]] = timers;
    assert.equal(timer.delay, delay, "new subscriptions must not wait for the idle poll");
    timers.delete(id);
    return timer.callback();
  }

  let beginPoll, releasePoll, polls = 0;
  const started = new Promise(resolve => { beginPoll = resolve; });
  const held = new Promise(resolve => { releasePoll = resolve; });
  const browser = {
    SC: {
      startSession: async () => ({ user: { id: "fixture", name: "Admin", role: "admin" } }),
      ensureSession: async () => true,
      recheckOnPageshow() {},
      live: () => ({ open: () => true }),
    },
    localStorage: { getItem: () => null, removeItem() {}, setItem() {} },
    document: { addEventListener() {}, hidden: false },
    addEventListener() {},
    Headers,
    setTimeout(callback, delay) {
      const id = Symbol("timer");
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: id => timers.delete(id),
    async fetch(path, init) {
      assert.equal(path, "/api/db/poll");
      const { queries } = JSON.parse(init.body);
      if (++polls === 1) {
        assert.equal(queries.length, 1);
        beginPoll();
        await held;
      }
      return Response.json({ seq: 1, results: Object.fromEntries(queries.map(({ key, kind }) => [key,
        kind === "summary" ? { ver: 1, summary: {} } : { ver: 1, exists: true, data: { opening: ["Hands washed"] } },
      ])) });
    },
  };
  browser.window = browser;
  runInNewContext(readFileSync(new URL("../public/claude-shim.js", import.meta.url), "utf8"), browser);
  const db = await browser.claude.use("db");
  db.summary("2026-11-25", "2026-11-26").onSnapshot(() => {});
  const first = runTimer(0);
  await started;

  let settings;
  db.doc("settings/main").onSnapshot(snapshot => { settings = snapshot.data(); });
  releasePoll();
  await first;
  await runTimer(0);
  assert.equal(settings?.opening[0], "Hands washed");
});
