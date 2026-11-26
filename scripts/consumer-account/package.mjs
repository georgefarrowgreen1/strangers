import { readFile } from 'node:fs/promises';

const readOverlay = name => readFile(new URL(name, import.meta.url), 'utf8');

export async function applyConsumerAccount(files, assetPath) {
  const [access, head, styles, account, overview] = await Promise.all([
    readOverlay('access.html'), readOverlay('account-head.js'),
    readOverlay('account-auth.css'), readOverlay('account.js'), readOverlay('overview.html'),
  ]);
  let accountPage = replaceSection(requiredFile(files, 'account/index.html'), '  <section class="account-access"', '  <div id="account-dashboard"', access);
  accountPage = replaceRequired(accountPage, '<meta charset="utf-8">', `<meta charset="utf-8">\n<script src="${assetPath}account-head.js"></script>`);
  accountPage = replaceSection(accountPage, '      <a id="account-sign-out"', '    </div>\n  </header>', '      <button type="button" class="text-button" id="account-sign-out">Sign out</button>\n');
  accountPage = replaceRequired(accountPage, 'Managed by your ChatGPT account.', 'Verified email for your Strangers account.');
  accountPage = replaceRequired(accountPage, '    <div class="account-title-block">\n      <h1>My account</h1>\n      <p>Track your beta orders and save your details for your next checkout.</p>', `    <div class="account-avatar" id="account-avatar" hidden aria-hidden="true"></div>
    <div class="account-title-block">
      <p class="account-eyebrow" id="account-hero-label" hidden>My account</p>
      <h1 id="account-title">My account</h1>
      <p>Track an order, find a receipt or buy a favourite again.</p>`);
  accountPage = replaceRequired(accountPage, '      <span id="account-session-name"></span>\n', '');
  accountPage = replaceRequired(accountPage, 'aria-controls="account-orders"', 'aria-controls="account-overview"');
  accountPage = replaceSection(accountPage, '    <section class="account-panel" id="account-orders"', '    <section class="account-panel" id="account-details"', overview);
  accountPage = replaceRequired(accountPage, 'Save your contact and delivery preferences for beta checkout.', 'Use these contact and delivery details at checkout.');
  files.set('account/index.html', accountPage);
  files.set('assets/account-head.js', head);
  files.set('assets/account.css', requiredFile(files, 'assets/account.css') + styles);
  files.set('assets/account.js', account);
  files.set('assets/account-store.js', receiptImages(assetPath));
  files.set('assets/app.js', requireCheckoutAccount(requiredFile(files, 'assets/app.js')));
  files.set('assets/checkout.js', updateCheckoutCopy(requiredFile(files, 'assets/checkout.js')));
  files.set('assets/store.js', removeGuestCheckout(requiredFile(files, 'assets/store.js')));
  files.set('assets/beta-orders.js', replaceRequired(requiredFile(files, 'assets/beta-orders.js'),
    "throw new Error('Your session ended. Sign in again to place this order.')",
    "throw Object.assign(new Error('Your session ended. Sign in again to place this order.'), { status: 401 })"));
}

function requiredFile(files, path) {
  const file = files.get(path);
  if (typeof file !== 'string') throw new Error(`Missing reviewed source ${path}.`);
  return file;
}

function replaceRequired(contents, before, after) {
  if (!contents.includes(before)) throw new Error(`Missing reviewed source ${before}.`);
  return contents.replace(before, () => after);
}

function replaceSection(contents, start, end, replacement) {
  const first = contents.indexOf(start);
  const last = contents.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw new Error(`Missing reviewed section ${start}.`);
  return contents.slice(0, first) + replacement + contents.slice(last);
}

function receiptImages(assetPath) {
  return `export function orderImagePath(value) {
  const filename = typeof value === 'string' && value.match(${String.raw`/^\/(?:consumer-preview\/)?assets\/([a-z0-9][a-z0-9._-]*\.(?:webp|png|jpe?g|svg|avif))$/`});
  return filename ? '${assetPath}' + filename[1] : '';
}
`;
}

function removeGuestCheckout(store) {
  store = replaceSection(store, '  function placeOrder(', '  restore();', '');
  store = replaceRequired(store, 'clear, totals, placeOrder };', 'clear, totals };');
  const reference = store.indexOf('\nfunction orderReference() {');
  if (reference < 0) throw new Error('Missing the reviewed guest order reference generator.');
  return store.slice(0, reference);
}

function requireCheckoutAccount(app) {
  app = replaceRequired(app, "import { loadAccount, recordDemoOrder } from './account-store.js';\n", '');
  app = replaceRequired(app, '    useCheckoutProfile(loadAccount().profile);\n', '');
  app = replaceRequired(app, '    if (signedIn) {\n      loadCheckoutProfile();\n      return;\n    }', '    void loadCheckoutProfile();\n    return;');
  app = replaceRequired(app, 'function showCheckout() {', `function showCheckoutSignIn() {
  showPanel('checkout', 'Checkout', '<div class="drawer-content"><p>Sign in to place a test order. Your coffees will stay in your cart.</p><div class="drawer-actions"><a class="button" href="/account/?return_to=%2Fcoffee%2F">Sign in</a><button class="button outline" type="button" data-open-bag>Back to cart</button></div></div>');
}

function showCheckout() {`);
  app = replaceRequired(app, '  if (!lines.length) return showBag();\n  if (!Object.keys(checkoutDraft).length)', '  if (!lines.length) return showBag();\n  if (!signedIn) return showCheckoutSignIn();\n  if (!Object.keys(checkoutDraft).length)');
  app = replaceSection(app, '    if (!account) {', '    showCheckout();', `    if (!account) {
      showCheckoutSignIn();
      return;
    }
    useCheckoutProfile({ ...account.profile, email: account.identity.email });
`);
  app = replaceRequired(app, '  method = preferredMethod;', "  method = preferredMethod === 'collection' ? 'collection' : 'delivery';");
  app = replaceRequired(app, '    showCheckoutReview(error?.name', `    if (error?.status === 401) {
      checkoutDraft = {};
      showCheckoutSignIn();
      return;
    }
    showCheckoutReview(error?.name`);
  app = replaceSection(app, 'function placeDemo() {', "menuButton.addEventListener('click'", `function placeOrder() {
  if (orderInFlight || dialog.dataset.view !== 'checkout-review') return;
  if (!signedIn) return showCheckoutSignIn();
  void submitSignedOrder(store.cart());
}

`);
  app = replaceRequired(app, 'placeDemo();', 'placeOrder();');
  app = replaceSection(app, '  } else if (action.sample !== undefined) {', '  } else if (action.keepShopping', '');
  app = replaceRequired(app, 'Demo checkout</button>', 'Checkout</button>');
  return replaceRequired(app, 'View last demo receipt', 'View last test receipt');
}

function updateCheckoutCopy(checkout) {
  checkout = replaceRequired(checkout, '<p>Demo checkout · No payment taken</p>\n              <button class="text-button" type="button" data-sample>Use sample details</button>', '<p>Test checkout. No payment or delivery.</p>\n              <p>Update your saved details in <a href="/account/#details">My account</a>.</p>');
  checkout = replaceRequired(checkout, "'Email address', String.raw`type=\"email\" required", "'Account email address', String.raw`type=\"email\" readonly");
  checkout = replaceRequired(checkout, 'Check your details before placing the demo order.', 'Review your coffee, delivery and contact details. This order is for testing only.');
  checkout = replaceRequired(checkout, 'Place demo order', 'Place test order');
  checkout = replaceRequired(checkout, 'Placing your demo order', 'Placing your test order');
  checkout = replaceRequired(checkout, 'Your demo order has been placed.', 'Your test order has been placed.');
  checkout = replaceRequired(checkout, 'Demo order complete.', 'Test order complete.');
  return replaceRequired(checkout, 'This preview won’t charge you or send an order.', 'Your test order is saved in My account. No payment was taken and no coffee will be sent.');
}
