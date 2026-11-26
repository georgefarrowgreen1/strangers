// Loaded by the CI browser runner in each test process. Keep the trace from the original failure.
import { basename, join } from "node:path";
import { chromium } from "playwright";

const directory = join(process.env.STRANGERS_BROWSER_TRACES, basename(process.argv[1]));
const launch = chromium.launch.bind(chromium);
let traceNumber = 0;
const warn = error => console.warn(`Could not record browser trace: ${error.message}`);

chromium.launch = async options => {
  const browser = await launch(options);
  const saveTraces = new Map();
  browser.on("context", context => {
    const path = join(directory, `context-${++traceNumber}.zip`);
    const recording = context.tracing.start({ snapshots: true, sources: false });
    recording.catch(warn);

    let saved;
    const save = () => saved ??= recording.then(() => context.tracing.stop({ path }), () => {}).catch(warn);
    saveTraces.set(context, save);
    context.once("close", () => saveTraces.delete(context));

    const close = context.close.bind(context);
    context.close = async closeOptions => {
      await save();
      return close(closeOptions);
    };
  });

  const close = browser.close.bind(browser);
  browser.close = async closeOptions => {
    await Promise.all([...saveTraces.values()].map(save => save()));
    return close(closeOptions);
  };
  return browser;
};
