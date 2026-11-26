// The staff admin workspace for the separate consumer storefront.
window.AdminConsumer = ({ api, html, raw, svg, put, head, openSheet, closeSheet, toast, confirmSheet }) => {
  const endpoint = "/api/admin/consumer";
  const previewUrl = "https://preview.staffstrangerscoffee.com/";
  const tabs = [
    ["overview", "Overview"], ["orders", "Orders"], ["customers", "Customers"], ["catalogue", "Catalogue"],
  ];
  const statuses = [
    ["placed", "Placed", "acc"],
    ["preparing", "Preparing", "warn"],
    ["ready", "Ready", "ok"],
    ["completed", "Completed", ""],
    ["cancelled", "Cancelled", "bad"],
  ];
  const statusById = new Map(statuses.map(([id, label, tone]) => [id, { label, tone }]));
  const readinessStates = new Map([
    ["ready", ["Ready", "ok"]], ["pending", ["Pending", "warn"]],
    ["paused", ["Paused", "warn"]], ["blocked", ["Blocked", "bad"]],
  ]);
  const currency = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
  const dateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" });
  const money = pence => Number.isFinite(pence) ? currency.format(pence / 100) : "—";
  const date = value => value && Number.isFinite(new Date(value).getTime()) ? dateTime.format(new Date(value)) : "—";
  const method = value => ({ delivery: "Delivery", collection: "Collection" })[value] || "—";
  const endpointFor = (area, id) => `${endpoint}/${area}/${encodeURIComponent(id)}`;

  let data, section = "overview", orderFilter = "", message = "", updating = false, generation = 0;
  let queries = {};
  const writes = new Set();
  const find = id => document.getElementById(id);
  const matches = (...values) => {
    const query = (queries[section] || "").trim().toLowerCase();
    return values.some(value => String(value ?? "").toLowerCase().includes(query));
  };

  function storefront() {
    try {
      const url = new URL(data?.previewUrl || previewUrl);
      if (url.protocol === "https:") return url.href;
    } catch { /* The default preview link is always available. */ }
    return previewUrl;
  }

  const badge = (label, tone) => html`<span class="pill ${tone}">${label}</span>`;
  function orderBadge(status) {
    const known = statusById.get(status);
    return known ? badge(known.label, known.tone) : badge("Status unavailable", "");
  }
  const empty = (icon, label) => html`<div class="consumer-empty">${svg(icon)}<p>${label}</p></div>`;
  const heading = (title, note) => html`<div class="consumer-panel-title"><h2>${title}</h2>${note ? html`<p>${note}</p>` : ""}</div>`;

  function navigation() {
    return html`<div class="seg consumer-tabs" id="consumerTabs" role="group" aria-label="Consumer sections">
      ${tabs.map(([id, label]) => html`<button type="button" data-act="consumer-tab" data-id="${id}" aria-controls="consumerPanel" aria-pressed="${String(section === id)}">${label}</button>`)}
    </div>`;
  }

  function overview() {
    const { orders, customers, products, readiness, settings } = data;
    const checkoutEnabled = settings.acceptOrders;
    const summaries = [
      ["orders", "bag", "Recent orders", orders.length],
      ["customers", "people", "Recent profiles", customers.length],
      ["catalogue", "coffee", "Available coffees", products.filter(product => product.available).length],
    ];
    return html`
      <div class="consumer-summary" aria-label="Preview summary">
        ${summaries.map(([id, icon, title, number]) => html`<button class="item glass consumer-stat" type="button" data-act="consumer-tab" data-id="${id}">
          <span class="ic acc">${svg(icon)}</span><span class="consumer-stat-text"><span>${title}</span><b class="num">${number}</b></span><span class="chev">${svg("chev")}</span>
        </button>`)}
      </div>
      <div class="consumer-overview">
        <section class="group glass consumer-card" aria-label="Beta readiness">
          ${heading("Beta readiness", "Storefront services and launch dependencies.")}
          ${readiness.length ? html`<ul class="consumer-list" role="list">
            ${readiness.map(check => {
              const [label, tone] = readinessStates.get(check.state) || ["Needs review", "warn"];
              return html`<li class="item"><span class="tx"><b>${check.label}</b>${check.detail ? html`<span>${check.detail}</span>` : ""}</span>${badge(label, tone)}</li>`;
            })}
          </ul>` : empty("tune", "No readiness checks available.")}
        </section>
        <section class="group glass consumer-card" aria-label="Signed-in checkout">
          ${heading("Signed-in checkout", "Accept or pause recorded demo orders from signed-in customers.")}
          <div class="consumer-checkout">
            ${badge(checkoutEnabled === true ? "Accepting orders" : checkoutEnabled === false ? "Paused" : "Unavailable", checkoutEnabled === true ? "ok" : "warn")}
            <p>Preview orders do not collect payment or trigger fulfilment.</p>
            ${typeof checkoutEnabled === "boolean" ? html`<button class="btn soft" type="button" data-act="consumer-checkout" ${writes.has("checkout") ? raw("disabled") : ""}>${checkoutEnabled ? "Pause checkout" : "Resume checkout"}</button>` : ""}
          </div>
        </section>
      </div>`;
  }

  function searchTools(label, placeholder, hasOrderFilter) {
    return html`<div class="consumer-tools">
      <label class="search">${svg("search")}<input id="consumerSearch" type="search" aria-label="${label}" placeholder="${placeholder}" value="${queries[section] || ""}" maxlength="120"></label>
      ${hasOrderFilter ? html`<label class="field"><select id="consumerOrderFilter" aria-label="Order status">
        <option value="">All statuses</option>
        ${statuses.map(([id, statusLabel]) => html`<option value="${id}" ${id === orderFilter ? raw("selected") : ""}>${statusLabel}</option>`)}
      </select></label>` : ""}
    </div>`;
  }

  function orders() {
    const rows = data.orders.filter(order => (!orderFilter || order.status === orderFilter) && matches(order.reference));
    if (!rows.length) return empty("bag", data.orders.length ? "No orders match these filters." : "No signed-in preview orders yet.");
    return html`<div class="consumer-order-columns" aria-hidden="true"><span>Order</span><span>Fulfilment</span><span>Total</span><span>Status</span></div>
      <ul class="consumer-list" role="list">
      ${rows.map(order => html`<li><button class="item consumer-order" type="button" data-act="consumer-order" data-id="${order.reference}">
        <span class="tx"><b>${order.reference}</b><span>${date(order.createdAt)}</span></span>
        <span class="consumer-method">${method(order.method)}</span>
        <span class="consumer-total num">${money(order.total)}</span>
        <span class="consumer-status">${orderBadge(order.status)}</span><span class="chev">${svg("chev")}</span>
      </button></li>`)}
      </ul>`;
  }

  function customers() {
    const rows = data.customers.filter(customer => matches(customer.name, customer.phone));
    if (!rows.length) return empty("people", data.customers.length ? "No customers match your search." : "No customer profiles saved yet.");
    return html`<ul class="consumer-list" role="list">
      ${rows.map(customer => html`<li class="item consumer-customer">
        <span class="tx"><b>${customer.name || "Name not provided"}</b><span>${customer.phone || "No phone number saved"}</span></span>
        <span class="consumer-meta">${customer.updatedAt ? `Updated ${date(customer.updatedAt)}` : ""}</span>
      </li>`)}
    </ul>`;
  }

  function catalogue() {
    const rows = data.products.filter(product => matches(product.name));
    if (!rows.length) return empty("coffee", data.products.length ? "No coffees match your search." : "No coffees in the preview catalogue yet.");
    return html`<ul class="consumer-list" role="list">
      ${rows.map(product => html`<li class="item consumer-product">
        <span class="tx"><b>${product.name}</b><span>${product.available ? "Available in preview" : "Unavailable in preview"}</span></span>
        <label class="consumer-toggle">
          <input type="checkbox" role="switch" class="switch" id="consumer-product-${product.id}" data-consumer-product="${product.id}"
            aria-label="Availability for ${product.name}" ${product.available ? raw("checked") : ""} ${writes.has(endpointFor("products", product.id)) || updating ? raw("disabled") : ""}>
        </label>
      </li>`)}
    </ul>`;
  }

  const lists = { orders, customers, catalogue };
  const listOptions = {
    orders: ["Orders", "Manage recent signed-in demo orders.", "Search consumer orders", "Search order reference"],
    customers: ["Customers", "Contact details saved by preview customers.", "Search consumer customers", "Search name or phone"],
    catalogue: ["Catalogue", "Choose which coffees are available to order in the preview.", "Search consumer coffees", "Search coffees"],
  };
  function panel() {
    if (!data.connected) return html`<section class="group glass consumer-card consumer-unconnected" aria-label="Storefront connection">
      <span class="ic warn">${svg("warn")}</span>
      <div><h2>Storefront connection unavailable</h2><p>${data.readiness[0]?.detail || "Set up the preview connection to manage demo orders, customer profiles and catalogue availability."}</p></div>
      <button class="btn soft" id="consumerRefresh" type="button" data-act="consumer-refresh">Try again</button>
    </section>`;
    if (section === "overview") return overview();
    const [title, note, label, placeholder] = listOptions[section];
    return html`<section class="group glass consumer-card" aria-label="${title}">
      ${heading(title, note)}
      ${searchTools(label, placeholder, section === "orders")}
      <div id="consumerResults">${lists[section]()}</div>
    </section>`;
  }

  function workspace() {
    return html`
      ${head("Consumer (Preview)", "Manage the separate retail storefront and prepare for beta.", html`<div class="consumer-actions">
        <a class="btn soft" href="${storefront()}" target="_blank" rel="noopener">${svg("external")}Open storefront</a>
        ${data.connected ? html`<button class="btn soft consumer-refresh" id="consumerRefresh" type="button" data-act="consumer-refresh" ${updating || writes.size ? raw("disabled") : ""} aria-label="Refresh consumer preview data">
          ${svg("refresh")}<span>Refresh</span>
        </button>` : ""}
      </div>`)}
      ${data.connected ? html`<div class="consumer-toolbar">${navigation()}</div>` : ""}
      <p class="consumer-message" id="consumerMessage" role="status" ${message ? "" : raw("hidden")}>${message}</p>
      <div id="consumerPanel" aria-busy="${String(updating)}">${panel()}</div>`;
  }

  async function load() {
    const result = await api("GET", endpoint);
    return {
      ...result,
      orders: result.orders || [], customers: result.customers || [], products: result.products || [],
      settings: result.settings || {}, readiness: result.readiness || [],
    };
  }

  async function view() {
    const started = ++generation;
    const result = await load();
    if (started !== generation) return html``;
    data = result;
    message = "";
    updating = false;
    return html`<div class="consumer-workspace" id="consumerWorkspace">${workspace()}</div>`;
  }

  function replaceWorkspace(returnFocus) {
    const root = find("consumerWorkspace");
    if (!root) return;
    put(root, workspace());
    if (returnFocus) find(returnFocus)?.focus({ preventScroll: true });
  }

  function report(text) {
    message = text;
    const status = find("consumerMessage");
    if (!status) return;
    status.hidden = !text;
    status.textContent = text;
  }

  function selectSection(id, opener) {
    if (!tabs.some(([key]) => key === id) || id === section || !data?.connected) return;
    section = id;
    const tabGroup = find("consumerTabs");
    for (const button of tabGroup.querySelectorAll("button")) button.setAttribute("aria-pressed", button.dataset.id === id);
    const panelRoot = find("consumerPanel");
    put(panelRoot, panel());
    SC.reveal(panelRoot, { offset: 5 });
    if (!opener.isConnected) tabGroup.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
  }

  function renderResults() {
    const root = find("consumerResults");
    if (root && lists[section]) put(root, lists[section]());
  }

  async function refresh(opener) {
    if (updating || writes.size) return;
    const started = generation;
    updating = true;
    const refreshButton = find("consumerRefresh");
    refreshButton.disabled = true;
    opener.disabled = true;
    find("consumerPanel").setAttribute("aria-busy", "true");
    try {
      const result = await load();
      if (started !== generation) return;
      data = result;
      updating = false;
      message = "";
      const focused = document.activeElement;
      const restoreFocus = focused === opener || focused === document.body;
      replaceWorkspace(restoreFocus ? refreshButton.id : focused.id);
      if (result.connected) toast("Preview data refreshed.");
    } catch (err) {
      if (started === generation) report(err.message);
    } finally {
      if (started === generation) {
        updating = false;
        refreshButton.disabled = false;
        opener.disabled = false;
        find("consumerPanel")?.setAttribute("aria-busy", "false");
      }
    }
  }

  async function save(key, request, apply) {
    if (updating || writes.has(key)) return false;
    const started = generation;
    const refreshButton = find("consumerRefresh");
    writes.add(key);
    if (refreshButton) refreshButton.disabled = true;
    try {
      await request();
      if (started !== generation) return false;
      apply();
      report("");
      return true;
    } finally {
      writes.delete(key);
      if (refreshButton?.isConnected) refreshButton.disabled = updating || writes.size > 0;
    }
  }

  function openOrder(reference, opener) {
    const order = data?.orders.find(entry => entry.reference === reference);
    if (!order) return;
    const current = statusById.get(order.status);
    const detail = (label, value) => html`<div><dt>${label}</dt><dd>${value}</dd></div>`;
    openSheet(html`<form class="consumer-order-sheet">
      <div class="consumer-order-sheet-head"><div><h2 id="sheetTitle">${order.reference}</h2><p>Preview order</p></div>
        <button class="btn soft consumer-close" type="button" data-sheet="close" aria-label="Close">${svg("x")}</button></div>
      <dl class="consumer-order-detail">
        ${detail("Placed", date(order.createdAt))}
        ${detail("Fulfilment", method(order.method))}
        ${order.cafe?.name ? detail("Collection from", order.cafe.name) : ""}
        ${detail("Order total", money(order.total))}
        ${detail("Current status", orderBadge(order.status))}
      </dl>
      ${Array.isArray(order.lines) && order.lines.length ? html`<div class="consumer-order-coffees"><h3>Coffees</h3>
        <ul class="consumer-list" role="list">${order.lines.map(line => html`<li class="item"><span class="tx"><b>${line.product?.name || line.name}</b><span>${line.size} · ${line.grind}</span></span><span class="num">× ${line.qty}</span></li>`)}</ul>
      </div>` : ""}
      ${current ? html`<label class="field"><span class="fl">Update status</span><select id="consumerOrderStatus">
        ${statuses.map(([id, label]) => html`<option value="${id}" ${id === order.status ? raw("selected") : ""}>${label}</option>`)}
      </select></label>` : ""}
      <p class="err" role="alert" id="consumerOrderError" hidden></p>
      <div class="row"><button class="btn soft" type="button" data-sheet="close">Close</button>${current ? html`<button class="btn" type="submit">Save status</button>` : ""}</div>
    </form>`, async (action, form) => {
      if (action !== "submit") return;
      const status = form.querySelector("select").value;
      if (!statusById.has(status) || status === order.status) { closeSheet(); return; }
      const error = form.querySelector(".err");
      error.hidden = true;
      try {
        const saved = await save(reference, () => api("PATCH", endpointFor("orders", reference), { status }), () => { order.status = status; });
        if (!saved) return;
        const sheetStillOpen = form.isConnected;
        if (sheetStillOpen) closeSheet();
        renderResults();
        if (sheetStillOpen) {
          const orderButton = find("consumerResults")?.querySelector(`[data-id="${CSS.escape(reference)}"]`);
          (orderButton || find("consumerOrderFilter"))?.focus({ preventScroll: true });
        }
        toast("Order status saved.");
      } catch (err) {
        if (!form.isConnected) { report(err.message); return; }
        error.hidden = false;
        error.textContent = err.message;
      }
    }, opener);
  }

  async function checkout(opener) {
    if (typeof data?.settings.acceptOrders !== "boolean") return;
    const acceptOrders = !data.settings.acceptOrders;
    const title = acceptOrders ? "Resume signed-in checkout?" : "Pause signed-in checkout?";
    const text = acceptOrders ? "Signed-in preview customers will be able to save demo orders." : "Signed-in preview customers will be unable to save new demo orders until checkout resumes.";
    if (!await confirmSheet({ title, text, confirm: acceptOrders ? "Resume checkout" : "Pause checkout" })) return;
    if (!opener.isConnected || updating) return;
    opener.disabled = true;
    try {
      const saved = await save("checkout", () => api("PUT", endpoint + "/settings", { acceptOrders }), () => {
        data.settings.acceptOrders = acceptOrders;
        const check = data.readiness.find(item => item.id === "checkout");
        if (check) {
          check.state = acceptOrders ? "ready" : "paused";
          check.detail = acceptOrders ? "The preview accepts test orders." : "Test checkout is paused.";
        }
      });
      if (!saved) return;
      if (section === "overview") {
        const panelRoot = find("consumerPanel");
        if (panelRoot) {
          put(panelRoot, panel());
          panelRoot.querySelector('[data-act="consumer-checkout"]')?.focus({ preventScroll: true });
        }
      }
      toast(acceptOrders ? "Signed-in checkout resumed." : "Signed-in checkout paused.");
    } catch (err) { report(err.message); }
    finally { if (opener.isConnected) opener.disabled = false; }
  }

  async function setAvailability(toggle) {
    const product = data?.products.find(entry => entry.id === toggle.dataset.consumerProduct);
    if (!product) return;
    const available = toggle.checked;
    toggle.checked = product.available;
    const path = endpointFor("products", product.id);
    if (available === product.available || writes.has(path) || updating) return;
    toggle.disabled = true;
    try {
      const saved = await save(path, () => api("PATCH", path, { available }), () => { product.available = available; });
      if (!saved) return;
      const current = find(toggle.id);
      if (current) {
        current.checked = available;
        current.closest("li").querySelector(".tx span").textContent = available ? "Available in preview" : "Unavailable in preview";
      }
      toast(available ? "Coffee made available." : "Coffee marked unavailable.");
    } catch (err) { report(err.message); }
    finally {
      const current = find(toggle.id);
      if (current) current.disabled = false;
    }
  }

  return {
    view,
    clear() {
      generation++;
      data = null;
      section = "overview";
      queries = {};
      orderFilter = "";
      message = "";
      updating = false;
      writes.clear();
    },
    search(value) { queries[section] = value; renderResults(); },
    filterOrders(value) { orderFilter = value; renderResults(); },
    setAvailability,
    async act(name, id, opener) {
      if (name === "consumer-tab") selectSection(id, opener);
      if (name === "consumer-refresh") await refresh(opener);
      if (name === "consumer-order") openOrder(id, opener);
      if (name === "consumer-checkout") await checkout(opener);
    },
  };
};
