import { readFileSync, readdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { run } from "node:test";
import { tap } from "node:test/reporters";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const [suite, ...args] = process.argv.slice(2);
if (suite !== "api" && suite !== "browser") throw new Error("Pass api or browser as the test suite.");

const { values } = parseArgs({ args, options: { shard: { type: "string" }, list: { type: "boolean" } } });
const testDirectory = fileURLToPath(new URL("../test/", import.meta.url));
const timings = JSON.parse(readFileSync(new URL("./test-timings.json", import.meta.url), "utf8"));
const browserFile = file => file.endsWith(".e2e.test.mjs");
// e2e.test.mjs is the legacy standalone walkthrough. The normal browser suite uses *.e2e.test.mjs.
const allFiles = readdirSync(testDirectory).filter(file => file.endsWith(".test.mjs") && file !== "e2e.test.mjs"
  && browserFile(file) === (suite === "browser")).sort();

function shardFiles(files, index, count) {
  const shards = Array.from({ length: count }, () => ({ seconds: 0, files: [] }));
  const estimate = file => timings[suite][file] ?? (suite === "browser" ? 32 : 8);
  // Put the longest files first, then fill the shard with the least work assigned so far.
  for (const file of [...files].sort((a, b) => estimate(b) - estimate(a))) {
    const shard = shards.reduce((lightest, next) => next.seconds < lightest.seconds ? next : lightest);
    shard.files.push(file);
    shard.seconds += estimate(file);
  }
  return shards[index - 1].files;
}

let files = allFiles;
if (values.shard) {
  const match = /^([1-9]\d*)\/([1-9]\d*)$/.exec(values.shard);
  if (!match) throw new Error("Use --shard INDEX/TOTAL with positive integers.");
  const index = Number(match[1]), count = Number(match[2]);
  if (index > count || count > allFiles.length) throw new Error(`Invalid shard ${values.shard} for ${allFiles.length} files.`);
  files = shardFiles(allFiles, index, count);
}
if (!files.length) throw new Error(`The ${suite} test suite contains no files.`);
if (values.list) {
  console.log(files.map(file => `test/${file}`).join("\n"));
  process.exit(0);
}

const execArgv = suite === "api" ? ["--experimental-strip-types", "--no-warnings=ExperimentalWarning"] : [];
const traces = suite === "browser" && process.env.STRANGERS_BROWSER_TRACES;
if (traces) execArgv.push("--import", fileURLToPath(new URL("../test/browser-tracing.mjs", import.meta.url)));

const results = new Map();
let passed = false;
const tests = run({ files: files.map(file => join(testDirectory, file)), concurrency: 2, execArgv });
tests.on("test:summary", ({ file, success, counts, duration_ms: duration }) => {
  if (file) results.set(basename(file), { success, seconds: Math.ceil(duration / 1000) });
  else passed = success && counts.tests > 0;
});
await pipeline(tests, tap, process.stdout, { end: false });
if (traces) {
  await Promise.all([...results].filter(([, result]) => result.success)
    .map(([file]) => rm(join(traces, file), { recursive: true, force: true })));
}
if (values.shard) console.log("Test file timings (seconds)", JSON.stringify(Object.fromEntries(
  [...results].map(([file, result]) => [file, result.seconds]),
)));
if (!passed) process.exitCode = 1;
