import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { startEditorFixture, admin, retail, wholesale, editorPath } from "./editor-integration-fixture.mjs";

let fixture, browser;
before(async () => {
  fixture = await startEditorFixture();
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
});
after(async () => { await browser?.close(); await fixture?.stop(); });

async function localBrowser(viewport, signedIn = false) {
  const context = await browser.newContext({viewport, serviceWorkers: "block"});
  if (signedIn) {
    const [name, value] = fixture.cookie.split("=");
    await context.addCookies([{name, value, url: admin, httpOnly: true, secure: true, sameSite: "Lax"}]);
  }
  await context.routeWebSocket("**/*", route => route.close());
  await context.route("**/*", async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin !== retail && !(signedIn && url.origin === admin)) return route.abort("blockedbyclient");
    const response = await fixture.runtime.dispatchFetch(url.href, {
      method: req.method(), headers: await req.allHeaders(),
      ...(req.postDataBuffer() ? {body: req.postDataBuffer()} : {}), redirect: "manual",
    });
    const headers = Object.fromEntries(response.headers);
    delete headers["content-length"];
    delete headers["content-encoding"];
    await route.fulfill({status: response.status, headers, body: Buffer.from(await response.arrayBuffer())});
  });
  return context;
}

async function change(action, body, method = "POST") {
  const response = await fixture.request(admin, editorPath + action, method, body, fixture.cookie);
  assert.ok(response.ok, action + " returned " + response.status + (response.ok ? "" : " " + await response.text()));
  return response.json();
}

test("a retail visitor sees only the published design, and the checkout and product controls survive publishing and restoring", {timeout: 90000}, async () => {
  const initial = await change("", undefined, "GET");
  const bytes = await readFile(new URL("../public/consumer-preview/assets/roastery.webp", import.meta.url));
  const {media} = await change("/media", {name:"Roastery photo.webp", type:"image/webp", data:bytes.toString("base64")});
  const imagePath = "/consumer-media/" + media.id;
  const customPath = "/pages/roastery-visit/";
  const customKey = "custom:roastery-visit";
  const first = structuredClone(initial.draft);
  first.pages.home = {
    theme: "sage", sections: ["w-feature", "hero"],
    widgets: [{id: "w-feature", type: "callout", heading: "Inside the Norwich roastery", body: "Speciality coffee roasted on Dove Street.",
      image:"media:" + media.id, alt:"Coffee roaster"}],
  };
  first.pages[customKey] = {title:"Roastery visit", inNavigation:true, sections:["w-visit"],
    widgets:[{id:"w-visit",type:"callout",heading:"Tasting at Dove Street",body:"Visit the roastery."}]};
  const saved = await change("", {revision: initial.revision, document: first}, "PUT");
  const context = await localBrowser({width: 393, height: 852});
  try {
    const page = await context.newPage();
    await page.goto(retail);
    const feature = page.getByRole("heading", {name: "Inside the Norwich roastery", exact: true});
    assert.equal(await feature.count(), 0);
    assert.equal((await fixture.request(retail, imagePath)).status, 404);
    assert.equal((await fixture.request(retail, customPath)).status, 404);
    for (const origin of [wholesale, retail]) {
      const privateRead = await fixture.request(origin, editorPath, "GET", undefined, fixture.cookie);
      assert.equal(privateRead.status, 404);
    }
    const published = await change("/publish", {revision: saved.revision});
    assert.equal((await fixture.request(retail, imagePath, "HEAD")).status, 200);
    await page.reload();
    await feature.waitFor();
    await page.getByRole("link", {name:"Roastery visit", exact:true}).click();
    await page.getByRole("heading", {name:"Tasting at Dove Street"}).waitFor();
    await page.goto(retail);
    await page.locator("[data-find]:visible").first().click();
    await page.locator("#finder-form").waitFor();
    assert.equal(await page.locator("#finder-form button[type=submit]").isDisabled(), true);
    await page.goto(retail + "/coffee/p/brazil-fazenda-bom-jesus-natural/");
    await page.locator("main h1").filter({hasText: "Bom Jesus"}).waitFor();
    assert.equal(await feature.count(), 0);
    await page.evaluate(() => localStorage.setItem("strangers-coffee-proposal.cart.v1", JSON.stringify([
      {id: "house-blend", size: "250g", grind: "Whole bean", qty: 1},
    ])));
    await page.goto(retail + "/checkout/");
    await page.locator("#retail-checkout-form").waitFor();
    await page.locator('[name="name"]').fill("An example buyer");
    assert.equal(await page.locator('[name="name"]').inputValue(), "An example buyer");
    const next = structuredClone(first);
    next.pages.home.widgets[0].heading = "Second release";
    delete next.pages.home.widgets[0].image;
    delete next.pages[customKey];
    const edited = await change("", {revision: published.revision, document: next}, "PUT");
    assert.equal((await fixture.request(retail, customPath, "HEAD")).status, 200);
    const replaced = await change("/publish", {revision: edited.revision});
    assert.equal((await fixture.request(retail, customPath, "HEAD")).status, 404);
    assert.equal((await fixture.request(retail, imagePath, "HEAD")).status, 404);
    const restored = await change("/restore", {revision: replaced.revision, version: published.publishedRevision});
    await page.goto(retail);
    await page.getByRole("heading", {name: "Second release", exact: true}).waitFor();
    await change("/publish", {revision: restored.revision});
    assert.equal((await fixture.request(retail, customPath, "HEAD")).status, 200);
    assert.equal((await fixture.request(retail, imagePath, "HEAD")).status, 200);
    await page.reload();
    await feature.waitFor();
    assert.equal(await page.getByRole("heading", {name: "Second release", exact: true}).count(), 0);
  } finally {
    await context.close();
  }
});

for (const [size, viewport] of [["desktop", {width: 1440, height: 1000}], ["mobile", {width: 393, height: 852}]]) {
  test(`admin editor can select and edit the actual canvas, save it and protect unsaved changes on ${size}`, {timeout: 90000}, async () => {
    const context = await localBrowser(viewport, true);
    const page = await context.newPage();
    try {
      page.setDefaultTimeout(12000);
      await page.goto(admin + "/#consumer/editor");
      const scopes = page.getByRole("combobox", {name: "Storefront page or surface"});
      await scopes.selectOption("about");
      const canvas = page.frameLocator('iframe[title^="Editable storefront preview"]');
      const heading = canvas.locator("main h1").first();
      await heading.click();
      const selected = page.getByRole("combobox", {name:"Page content", exact:true});
      const fieldText = await selected.locator("option:checked").textContent();
      assert.notEqual(await selected.inputValue(), "");
      const editor = page.getByRole("textbox", {name: fieldText, exact: true});
      const value = size === "desktop" ? "Roasting in Norwich" : "Our Norwich roastery";
      await editor.fill(value);
      await heading.filter({hasText: value}).waitFor();
      assert.equal(await page.locator('iframe[title^="Editable storefront preview"]').getAttribute("sandbox"), "allow-same-origin");
      assert.equal(await canvas.locator("script").count(), 0);
      const switcher = page.locator("#consumerSection");
      if (await switcher.isVisible()) await switcher.selectOption("orders");
      else await page.locator('#consumerTabs [data-id="orders"]').click();
      const confirmation = page.locator("#sheet");
      await confirmation.getByRole("button", {name: "Cancel", exact: true}).click();
      assert.equal(await editor.inputValue(), value);
      await page.getByRole("button", {name:"Save draft", exact: true}).click();
      await page.getByText("Draft saved. You can return to it before publishing.", {exact:true}).waitFor();
      const shopper = await context.newPage();
      await shopper.goto(retail + "/about/");
      assert.notEqual(await shopper.locator("main h1").first().textContent(), value);
      await page.bringToFront();
      await page.getByRole("button", {name:"Publish", exact: true}).click();
      await Promise.all([
        page.waitForResponse(response => response.url() === admin + editorPath + "/publish" && response.status() === 200),
        confirmation.getByRole("button", {name: "Publish storefront", exact: true}).click(),
      ]);
      await shopper.reload();
      await shopper.getByRole("heading", {name:value, exact:true}).waitFor();
      await page.bringToFront();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 1, "Editor overflows the " + size + " viewport by " + overflow + " px");
      if (process.env.CONSUMER_SCREENSHOT_DIR) {
        await scopes.selectOption("home");
        await canvas.locator("main h1").waitFor();
        await page.evaluate(() => window.scrollTo(0, 0));
        await mkdir(process.env.CONSUMER_SCREENSHOT_DIR, {recursive:true});
        await page.screenshot({path:process.env.CONSUMER_SCREENSHOT_DIR + "/site-editor-" + size + ".png"});
        if (size === "mobile") {
          await page.getByRole("button", {name:"Design", exact:true}).click();
          const tools = page.getByRole("region", {name:"Page inspector"});
          await tools.evaluate(el => el.scrollIntoView({block:"start", behavior:"instant"}));
          await page.screenshot({path:process.env.CONSUMER_SCREENSHOT_DIR + "/site-editor-mobile-design.png"});
        }
      }
    } finally {
      await context.close();
    }
  });
}

test("an admin can build a custom page from a template, reopen its draft and remove the page in the editor", {timeout: 90000}, async () => {
  const context = await localBrowser({width:1440, height:1000}, true);
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    await page.goto(admin + "/#consumer/editor");
    const selector = page.getByRole("combobox", {name:"Storefront page or surface"});
    const canvas = page.frameLocator('iframe[title^="Editable storefront preview"]');
    await page.getByRole("button", {name:"Add page", exact:true}).click();
    await page.getByLabel("Page name", {exact:true}).fill("Weekend roastery");
    await page.getByLabel("Include in the storefront footer").check();
    await page.getByRole("button", {name:"Create page", exact:true}).click();
    await canvas.getByRole("heading", {name:"Weekend roastery", exact:true}).waitFor();
    assert.equal(await selector.inputValue(), "custom:weekend-roastery");
    await page.getByRole("button", {name:"Design", exact:true}).click();
    await page.getByRole("combobox", {name:/^Page theme/}).selectOption("espresso");
    await page.getByRole("combobox", {name:/^Template/}).selectOption("visit");
    await page.getByRole("button", {name:"Insert template", exact:true}).click();
    await canvas.getByRole("heading", {name:"Come in for a coffee"}).waitFor();
    await page.getByRole("button", {name:"Photos", exact:true}).click();
    const bytes = await readFile(new URL("../public/consumer-preview/assets/pottergate.webp", import.meta.url));
    const [upload] = await Promise.all([
      page.waitForResponse(response => response.url() === admin + editorPath + "/media" && response.request().method() === "POST"),
      page.getByLabel("Upload a photo", {exact:true}).setInputFiles({name:"Pottergate morning.webp", mimeType:"image/webp", buffer:bytes}),
    ]);
    const {media} = await upload.json();
    await page.getByRole("button", {name:"Use photo · " + media.name, exact:true}).click();
    await canvas.locator('img[src$="/media/' + media.id + '"]').waitFor();
    await page.getByRole("button", {name:"Save draft", exact:true}).click();
    await page.getByText("Draft saved. You can return to it before publishing.", {exact:true}).waitFor();
    assert.equal((await fixture.request(retail, "/pages/weekend-roastery/")).status, 404);
    await page.reload();
    await selector.selectOption("custom:weekend-roastery");
    await canvas.getByRole("heading", {name:"Come in for a coffee"}).waitFor();
    await canvas.locator('img[src$="/media/' + media.id + '"]').waitFor();
    assert.equal(await canvas.locator("html").getAttribute("data-consumer-theme"), "espresso");
    await page.getByRole("button", {name:"Remove page", exact:true}).click();
    await page.locator("#sheet").getByRole("button", {name:"Remove page", exact:true}).click();
    assert.equal(await selector.inputValue(), "home");
    await page.getByRole("button", {name:"Save draft", exact:true}).click();
    await page.getByText("Draft saved. You can return to it before publishing.", {exact:true}).waitFor();
    await page.reload();
    await selector.waitFor();
    assert.equal(await selector.locator('option[value="custom:weekend-roastery"]').count(), 0);
    await page.getByRole("button", {name:"Photos", exact:true}).click();
    await page.getByRole("button", {name:"Delete " + media.name, exact:true}).click();
    await page.locator("#sheet").getByRole("button", {name:"Delete photo", exact:true}).click();
    await page.getByText("Photo deleted from the library.", {exact:true}).waitFor();
  } finally {
    await context.close();
  }
});
