// Set RETAIL_SERVICE_ROOT to a built checkout of the consumer order service.
// The two Workers run locally with separate databases and their real signing keys.
import assert from "node:assert/strict";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { chromium } from "playwright";
import { admin, openLocalBrowser, retail, startEditorFixture, wholesale } from "./editor-integration-fixture.mjs";

const serviceRoot = process.env.RETAIL_SERVICE_ROOT;
const endpoint = "/api/admin/consumer/products";
const serviceName = "retail-order-service";
const screenshots = process.env.CONSUMER_SCREENSHOT_DIR;

describe("consumer product management through both local Workers", {
  skip: serviceRoot ? false : "Set RETAIL_SERVICE_ROOT to the built consumer order service checkout",
}, () => {
  let fixture, browser, db;
  before(async () => {
    const bundle = await readFile(join(serviceRoot, "dist/server/index.js"), "utf8");
    fixture = await startEditorFixture({ assetsDirectory:process.env.STRANGERS_TEST_ASSETS_DIRECTORY, retailWorker: {
      config: {
        name: serviceName, compatibilityDate: "2026-10-01",
        manifest: { mainModule: "service.mjs", modules: { "service.mjs": { type:"esm", contents:bundle } } },
        env: { DB: { type:"d1", name:"retail-orders" }, RETAIL_BRANDED_ONLY: { type:"text", value:"1" } },
      },
      dev: { outboundService: { type:"worker", worker:"consumer-editor-integration" } },
    } });
    db = await fixture.runtime.getD1Database("DB", serviceName);
    const migrations = join(serviceRoot, "src/db");
    for (const file of (await readdir(migrations)).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
      const sql = await readFile(join(migrations, file), "utf8");
      for (const statement of sql.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean)) {
        await db.prepare(statement).run();
      }
    }
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {});
    if (screenshots) await mkdir(screenshots, { recursive:true });
  });
  after(async () => { await browser?.close(); await fixture?.stop(); });

  test("only a signed-in admin on the admin domain can change the catalogue", async () => {
    const response = await fixture.request(admin, "/api/admin/consumer", "GET", undefined, fixture.cookie);
    assert.equal((await response.json()).connected, true, "a correctly signed admin request reaches the separate service");
    assert.equal((await fixture.request(admin, endpoint)).status, 401);
    assert.equal((await fixture.request(retail, endpoint, "POST", {name:"Example"}, fixture.cookie)).status, 404);
    assert.equal((await fixture.request(wholesale, endpoint, "POST", {name:"Example"}, fixture.cookie)).status, 404);
    assert.equal((await fixture.request(admin, endpoint, "POST", {name:"Example"}, fixture.cookie, {origin:retail})).status, 403);
  });
  async function capture(page, filename) {
    const width = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(width <= 1, filename + " overflows by " + width + "px");
    if (screenshots) {
      await page.evaluate(async () => {
        const visible = [...document.querySelectorAll("#consumerProducts img")].filter(image => {
          const box = image.getBoundingClientRect();
          return box.bottom > 0 && box.top < innerHeight;
        });
        await Promise.all(visible.map(async image => {
          await image.decode();
          if (!image.naturalWidth) throw new Error("A product image is missing");
        }));
        await Promise.allSettled(document.getAnimations().filter(animation =>
          animation.effect?.getComputedTiming().endTime < 2000).map(animation => animation.finished));
      });
      await page.screenshot({path:join(screenshots, filename + ".png"), animations:"disabled"});
    }
  }

  for (const [device, viewport] of [["desktop", {width:1440,height:1000}], ["mobile", {width:393,height:852}]]) {
    test("an admin can add, amend and remove a purchasable product on " + device, {timeout:120000}, async () => {
      const context = await openLocalBrowser(fixture, browser, viewport, true);
      const name = device === "desktop" ? "Dove Street Espresso" : "Pottergate Espresso";
      const amended = name + " Reserve";
      const price = "14.50";
      const fileName = device === "desktop" ? "roastery.webp" : "pottergate.webp";
      const errors = [];
      try {
        const page = await context.newPage();
        const shopper = await context.newPage();
        for (const item of [page, shopper]) {
          item.setDefaultTimeout(10000);
          item.on("pageerror", error => errors.push(error.message));
        }
        await page.goto(admin + "/#consumer/products");
        await page.getByRole("button", {name:"Add product", exact:true}).waitFor();
        await page.getByRole("button", {name:/Edit Brazil Fazenda Bom Jesus Natural/}).waitFor();
        await capture(page, "products-" + device);
        await page.getByRole("button", {name:"Add product", exact:true}).click();
        await page.getByLabel("Product name", {exact:true}).fill(name);
        await page.getByLabel("Tasting notes", {exact:true}).fill("Cocoa, almond, stone fruit");
        await page.getByLabel("Short description", {exact:true}).fill("Roasted in Norwich for espresso.");
        await page.getByLabel("Price for 250g", {exact:true}).fill(price);
        await page.getByLabel(/upload.*photo/i).setInputFiles(new URL("../public/consumer-preview/assets/" + fileName, import.meta.url).pathname);
        await page.getByRole("button", {name:"Create product", exact:true}).click();
        await page.getByRole("button", {name:"Edit " + name, exact:true}).waitFor();

        await shopper.goto(retail + "/coffee/");
        await shopper.locator("#search").fill(name);
        const heading = shopper.getByRole("heading", {name, exact:true});
        await heading.waitFor();
        await shopper.getByRole("link", {name:"View " + name, exact:true}).click();
        await shopper.getByRole("heading", {name, level:1}).waitFor();
        const productUrl = shopper.url();
        assert.ok(productUrl.startsWith(retail + "/coffee/"));
        const photo = new URL(await shopper.locator("[data-gallery-main]").getAttribute("src"), retail).pathname;
        assert.match(photo, /^\/consumer-product-media\/[a-f0-9]{64}$/);
        assert.equal((await fixture.request(retail, photo)).status, 200);
        await shopper.getByRole("button", {name:"Add to cart", exact:true}).click();
        const cartLine = shopper.locator(".cart-line");
        await cartLine.getByText(name, {exact:true}).waitFor();
        await shopper.getByRole("link", {name:"Checkout", exact:true}).click();
        await shopper.getByRole("button", {name:"Fill sample details", exact:true}).click();
        await shopper.getByRole("button", {name:"Review order", exact:true}).click();
        const [placed] = await Promise.all([
          shopper.waitForResponse(r => new URL(r.url()).pathname === "/api/retail/orders" && r.request().method() === "POST"),
          shopper.getByRole("button", {name:"Place test order", exact:true}).click(),
        ]);
        const result = await placed.json();
        assert.ok(placed.ok(), JSON.stringify(result));
        assert.equal(result.order.lines[0].product.name, name);
        assert.equal(result.order.pricing.subtotal, 1450);
        const stored = () => db.prepare("SELECT order_json FROM retail_account_orders WHERE reference=?").bind(result.order.reference).first("order_json");
        const receipt = await stored();
        assert.ok(receipt);
        await shopper.locator(".retail-checkout-reference").filter({hasText:result.order.reference}).waitFor();
        await shopper.goto(productUrl);
        await shopper.getByRole("button", {name:"Add to cart", exact:true}).click();
        await shopper.getByRole("link", {name:"Checkout", exact:true}).click();
        await shopper.getByRole("button", {name:"Fill sample details", exact:true}).click();
        await shopper.getByRole("button", {name:"Review order", exact:true}).click();

        await page.getByRole("button", {name:"Edit " + name, exact:true}).click();
        await page.getByLabel("Product name", {exact:true}).fill(amended);
        await page.getByLabel("Price for 250g", {exact:true}).fill("16.75");
        await page.evaluate(() => window.scrollTo({top:0, behavior:"instant"}));
        await capture(page, "product-edit-" + device);
        await page.getByRole("button", {name:"Save changes", exact:true}).click();
        await page.getByRole("button", {name:"Edit " + amended, exact:true}).waitFor();
        const [rejected] = await Promise.all([
          shopper.waitForResponse(r => new URL(r.url()).pathname === "/api/retail/orders" && r.request().method() === "POST"),
          shopper.getByRole("button", {name:"Place test order", exact:true}).click(),
        ]);
        assert.equal(rejected.status(), 409);
        assert.equal((await rejected.json()).error, "price_changed");
        await shopper.getByText(/a price has changed/i).waitFor();
        const summary = shopper.getByRole("button", {name:/order summary/i});
        if (await summary.isVisible()) await summary.click();
        await shopper.getByText("£16.75", {exact:true}).first().waitFor();
        await shopper.goto(productUrl);
        await shopper.getByRole("heading", {name:amended, level:1}).waitFor();
        await shopper.getByText("£16.75", {exact:true}).first().waitFor();

        await page.getByRole("button", {name:"Edit " + amended, exact:true}).click();
        await page.getByRole("button", {name:"Remove product", exact:true}).click();
        await page.locator("#sheet").getByRole("button", {name:"Remove product", exact:true}).click();
        await page.getByRole("button", {name:"Edit " + amended, exact:true}).waitFor({state:"detached"});
        await page.getByLabel("Product status", {exact:true}).selectOption({label:"Removed"});
        await page.getByRole("button", {name:"View " + amended, exact:true}).waitFor();

        const direct = await fixture.request(retail, new URL(productUrl).pathname);
        assert.equal(direct.status, 404);
        assert.equal((await fixture.request(retail, photo)).status, 404);
        assert.equal((await fixture.request(admin, "/api/admin/consumer/product-photos/" + photo.split("/").pop(), "GET", undefined, fixture.cookie)).status, 200);
        const historic = await fixture.request(retail, "/api/retail/orders/" + result.order.reference, "POST", {token:result.claimToken}, undefined, {"x-retail-profile-session":"guest"});
        assert.equal(historic.status, 200);
        assert.deepEqual((await historic.json()).order.lines, result.order.lines);
        const checkout = {...placed.request().postDataJSON(), idempotencyKey:crypto.randomUUID()};
        checkout.lines = checkout.lines.map(line => ({...line, expectedUnitPrice:1675}));
        const archivedOrder = await fixture.request(retail, "/api/retail/orders", "POST", checkout, undefined, {"x-retail-profile-session":"guest"});
        assert.ok([400, 409].includes(archivedOrder.status));
        const current = await (await fixture.request(retail, "/api/retail/products")).json();
        assert.equal(current.products.some(product => product.name === amended), false);
        assert.equal(await stored(), receipt, "the original order line name and price survive product edits and removal");
        await page.getByRole("button", {name:"View " + amended, exact:true}).click();
        await page.getByRole("button", {name:"Restore product", exact:true}).click();
        await page.locator("#sheet").getByRole("button", {name:"Restore product", exact:true}).click();
        await page.getByRole("button", {name:"Edit " + amended, exact:true}).waitFor();
        assert.equal((await fixture.request(retail, new URL(productUrl).pathname)).status, 200);
        assert.equal((await fixture.request(retail, photo)).status, 200);
        assert.deepEqual(errors, []);
      } finally {
        await context.close();
      }
    });
  }
});
