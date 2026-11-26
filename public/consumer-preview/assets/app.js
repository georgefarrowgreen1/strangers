import { products, cafes } from './products.js';
import { getServerAccount, setupAccount } from './account.js';
import { clearOrderAttempt, placeAccountOrder } from './beta-orders.js';
import { loadAccount, recordDemoOrder } from './account-store.js';
import { escapeHtml as html } from './html.js';
import { createStore, money, FREE_SHIPPING } from './store.js';
import { checkoutDetails, checkoutDock, checkoutReview, grindLabel, orderTotals, processingMarkup, receiptMarkup, sizeNames } from './checkout.js';

const store = createStore(products);
const signedIn = document.body.hasAttribute('data-retail-signed-in');
const checkoutFields = ['name', 'email', 'phone', 'address', 'town', 'postcode'];
const shelf = document.querySelector('#products');
const coffees = document.querySelector('[data-full-catalogue]')
  ? products
  : products.filter(product => Number.isInteger(product.shelfOrder)).sort((a, b) => a.shelfOrder - b.shelfOrder);
const productById = new Map(products.map(product => [product.id, product]));
const cafeById = new Map(cafes.map(cafe => [cafe.id, cafe]));
const dialog = document.querySelector('#dialog');
const title = document.querySelector('#dialog-title');
const body = document.querySelector('#panel-body');
const dock = document.querySelector('#panel-actions');
const closeButton = document.querySelector('#close-dialog');
const siteMenu = document.querySelector('#mobile-menu');
const menuButton = document.querySelector('#menu-button');
const search = document.querySelector('#search');
const tasteFilter = document.querySelector('#shelf-taste');
const shortCafeNames = { pottergate: 'Pottergate', 'dove-street': 'Dove Street', 'all-saints-green': 'All Saints Green' };
let filter = 'All';
let activeCafe = 'pottergate';
let returnFocus;
let menuCloseSequence = 0;
let dialogCloseSequence = 0;
let method = 'delivery';
let checkoutCafe = 'dove-street';
let productQty = 1;
const finder = { brew: '', taste: '' };
let checkoutDraft = {};
let lastReceipt;
let orderInFlight = false;

function bagCount() {
  const count = store.totals().count;
  document.querySelector('#bag-count').textContent = count;
  document.querySelector('[data-bag]').setAttribute('aria-label', `Cart, ${count} ${count === 1 ? 'item' : 'items'}`);
}

function renderShelf() {
  tasteFilter.value = filter;
  const query = search.value.trim().toLocaleLowerCase('en-GB');
  const shown = coffees.filter(product =>
    (filter === 'All' || product.profile === filter) &&
    [product.name, product.country, product.region, ...product.notes].join(' ').toLocaleLowerCase('en-GB').includes(query),
  );
  document.querySelectorAll('[data-filter]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.filter === filter));
  });
  const grid = shelf;
  if (!shown.length) {
    grid.replaceChildren(document.querySelector('#empty-shelf').content.cloneNode(true));
  } else {
    grid.innerHTML = shown.map(product => `<article class="product">
      <div class="product-image"><img src="${product.image}" width="580" height="410" alt="" loading="lazy"></div>
      <div class="product-info"><p class="origin">${product.country} · ${product.profile}</p><h3>${product.name}</h3><p class="notes">${product.shortCopy}</p>
      <div class="product-actions"><span>${product.available === false ? 'Unavailable' : `From ${money(product.prices['250g'])}`}</span><button type="button" class="button outline product-open" data-product="${product.id}" aria-label="View ${product.name}"><span class="product-open-full">Read more</span><span class="product-open-short">View</span></button></div></div>
    </article>`).join('');
  }
  document.querySelector('#shelf-status').textContent = `${shown.length} ${shown.length === 1 ? 'coffee' : 'coffees'}`;
}

function renderCafes() {
  const tabs = document.querySelector('#cafe-switch');
  if (!tabs.children.length) {
    tabs.innerHTML = cafes.map(cafe => `<button type="button" data-cafe="${cafe.id}">${shortCafeNames[cafe.id]}</button>`).join('');
  }
  tabs.querySelectorAll('[data-cafe]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.cafe === activeCafe));
  });
  const cafe = cafeById.get(activeCafe);
  document.querySelector('#cafe-detail').innerHTML = `<img class="cafe-image" src="${cafe.image}" alt="${cafe.name}" loading="lazy" width="740" height="470">
    <div class="cafe-copy"><h3>${cafe.name}</h3><p>${cafe.address}</p><p>${cafe.description}</p>
    <div class="cafe-hours"><strong>Opening hours</strong><ul>${cafe.hours.map(time => `<li>${time}</li>`).join('')}</ul></div>
    <a class="button outline" href="${cafe.map}" target="_blank" rel="noopener noreferrer">Get directions</a></div>`;
}

function menuOpen(open, restoreFocus = false) {
  const sequence = ++menuCloseSequence;
  siteMenu.classList.remove('is-closing');
  siteMenu.inert = !open;
  menuButton.setAttribute('aria-expanded', String(open));
  if (open) {
    siteMenu.hidden = false;
    return;
  }
  if (!siteMenu.hidden) {
    siteMenu.classList.add('is-closing');
    setTimeout(() => {
      if (sequence === menuCloseSequence) {
        siteMenu.hidden = true;
        siteMenu.classList.remove('is-closing');
      }
    }, 190);
  }
  if (restoreFocus) menuButton.focus();
}

function showPanel(view, label, markup, opener, actions = '') {
  dialogCloseSequence += 1;
  dialog.classList.remove('is-closing');
  if (!dialog.open) returnFocus = opener ?? document.activeElement;
  if (!siteMenu.inert) {
    returnFocus = menuButton;
    menuOpen(false);
  }
  dialog.dataset.view = view;
  title.textContent = label;
  body.innerHTML = markup;
  dock.innerHTML = actions;
  dock.hidden = !actions;
  body.scrollTop = 0;
  if (!dialog.open) dialog.showModal();
  const focusTarget = body.querySelector('[data-panel-focus], .finder-heading') ?? closeButton;
  focusTarget.focus({ preventScroll: true });
}

function closePanel() {
  if (orderInFlight || !dialog.open || dialog.classList.contains('is-closing')) return;
  checkoutDraft = {};
  const sequence = ++dialogCloseSequence;
  const finish = () => {
    if (sequence !== dialogCloseSequence) return;
    dialog.classList.remove('is-closing');
    dialog.close();
    body.replaceChildren();
    dock.replaceChildren();
    dock.hidden = true;
    if (returnFocus?.isConnected && returnFocus.getClientRects().length) returnFocus.focus({ preventScroll: true });
    else document.querySelector('[data-bag]').focus({ preventScroll: true });
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    finish();
  } else {
    dialog.classList.add('is-closing');
    setTimeout(finish, 190);
  }
}

function quantityMarkup(qty, label, index) {
  const line = index === undefined ? '' : ` data-line="${index}"`;
  return `<div class="qty" role="group" aria-label="Quantity for ${label}">
    <button type="button" data-qty="-1"${line} aria-label="Decrease quantity for ${label}" ${qty === 1 ? 'disabled' : ''}>−</button>
    <output aria-live="polite">${qty}</output><button type="button" data-qty="1"${line} aria-label="Increase quantity for ${label}" ${qty === 99 ? 'disabled' : ''}>+</button></div>`;
}

function resizeQty(group, qty) {
  group.querySelector('output').value = qty;
  const decrease = group.querySelector('[data-qty="-1"]');
  const increase = group.querySelector('[data-qty="1"]');
  decrease.disabled = qty === 1;
  increase.disabled = qty === 99;
  if (document.activeElement === document.body) {
    (qty === 1 ? increase : decrease).focus({ preventScroll: true });
  }
}

function showProduct(id, opener, { grind: suggestedGrind = 'Whole bean', fromFinder = false } = {}) {
  const product = productById.get(id);
  if (!product) return;
  productQty = 1;
  const details = [product.region, product.process].filter(Boolean);
  showPanel('product', product.name, `<div class="product-detail">
    <div class="detail-media"><img src="${product.image}" width="580" height="580" alt="${product.name} packaging artwork"></div>
    <div class="detail-copy">${fromFinder ? '<button class="text-button finder-product-back" type="button" data-finder-back="match">Back to my match</button>' : ''}<p class="eyebrow">${product.country} · ${product.profile}</p>
    <p class="detail-notes">${product.shortCopy}</p>
    <p class="detail-story">${product.story ? `${product.story} ` : ''}<a href="${product.url}" target="_blank" rel="noopener noreferrer">Read more on the live shop</a></p>
    ${details.length ? `<p class="detail-origin">${details.join(' · ')}</p>` : ''}
    ${product.available === false ? '<p class="detail-origin">This coffee is currently unavailable.</p>' : ''}
    <form class="detail-form" id="product-form" data-id="${id}"${product.available === false ? ' hidden' : ''}>
      <fieldset><legend>Weight</legend><div class="choices">${Object.entries(product.prices).map(([size]) =>
        `<label class="choice"><input type="radio" name="size" value="${size}" ${size === '250g' ? 'checked' : ''}>${sizeNames[size]}</label>`).join('')}</div></fieldset>
      <div class="field"><label for="grind">Grind</label><select id="grind" name="grind">${product.grinds.map(grind =>
        `<option value="${grind}" ${grind === suggestedGrind ? 'selected' : ''}>${grindLabel(grind)}</option>`).join('')}</select></div>
      <div class="form-submit">${quantityMarkup(productQty, product.name)}<button class="button" id="add-to-bag" type="submit">Add to cart · ${money(product.prices['250g'])}</button></div>
      <p class="form-error" id="product-error" role="alert" hidden>You can add up to 99 bags of each size and grind.</p>
    </form></div></div>`, opener);
}

function updateProductPrice(form) {
  const product = productById.get(form.dataset.id);
  document.querySelector('#add-to-bag').textContent = `Add to cart · ${money(product.prices[form.elements.size.value] * productQty)}`;
  document.querySelector('#product-error').hidden = true;
}

const brews = [
  { value: 'Espresso / Fine', label: 'Espresso', detail: 'Espresso machine', icon: 'espresso' },
  { value: 'Filter / Medium', label: 'Filter', detail: 'Pour-over or drip', icon: 'filter' },
  { value: 'Cafetiere / Coarse', label: 'Cafetière', detail: 'French press', icon: 'press' },
  { value: 'Moka Pot / Fine', label: 'Moka pot', detail: 'Stovetop brewer', icon: 'moka' },
  { value: 'Whole bean', label: 'Whole bean', detail: 'I grind my own', icon: 'beans' },
];

const tastes = [
  { value: 'Chocolatey', label: 'Chocolate & nuts', detail: 'Rounded and familiar', tone: 'chocolate' },
  { value: 'Fruity', label: 'Bright & fruity', detail: 'Juicy berry and fruit notes', tone: 'fruit' },
  { value: 'Decaf', label: 'Decaf', detail: 'Sugar cane process', tone: 'decaf' },
];

const brewIcons = {
  espresso: '<path d="M3 5h15v6H3zM5 11v6m13-9h3m-7 3v3m-5 2h8v2a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3ZM3 21h18"/>',
  filter: '<path d="M4 4h16l-5 9H9L4 4Zm3 9h10M10 16l-3 5h10l-3-5M10 7l2 4m3-4-2 4"/>',
  press: '<path d="M8 3h8m-4 0v9M6 8h12v10a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V8Zm12 2h2a2 2 0 0 1 0 4h-2M6 14h12"/>',
  moka: '<path d="M7 4h10l3 7H4l3-7Zm0-1h10m-5 0V1m-8 10 2 10h12l2-10M20 8h2v7h-3M9 13l-1 5m7-5 1 5"/>',
  beans: '<ellipse cx="12" cy="12" rx="6" ry="9" transform="rotate(36 12 12)"/><path d="M15 4.6C9 8 14.8 12.4 9 19.4"/>',
};

const recommendations = {
  Chocolatey: {
    'Espresso / Fine': 'roasters-blend',
    'Moka Pot / Fine': 'roasters-blend',
    default: 'bom-jesus',
  },
  Fruity: {
    'Espresso / Fine': 'anserma',
    'Cafetiere / Coarse': 'anserma',
    'Moka Pot / Fine': 'anserma',
    default: 'rocko',
  },
  Decaf: { default: 'decaf' },
};

const finderReasons = {
  'bom-jesus': 'A rounded Brazil with chocolate, hazelnut and praline. A good fit if you like a familiar, nutty cup.',
  'roasters-blend': 'A more developed roast with dark chocolate and cinder toffee. It suits a concentrated brew.',
  anserma: 'Cherry and liqueur chocolate give this Colombian natural the character of Black Forest gateau.',
  rocko: 'Blueberry and strawberry are up front, with chocolate underneath. A good fit if you like a fruit-forward cup.',
  decaf: 'Sugar cane decaffeination gives you a cup with dark chocolate, hazelnut and a little orange.',
};

function radioChoices(name, values, selected) {
  return values.map(([value, label]) => `<label class="choice"><input type="radio" name="${name}" value="${value}" ${value === selected ? 'checked' : ''}>${label}</label>`).join('');
}

function finderOptions(name, options) {
  return options.map(({ value, label, detail, icon, tone = 'brew' }) => `<label class="finder-option" data-tone="${tone}">
    <input type="radio" name="${name}" value="${value}" required ${value === finder[name] ? 'checked' : ''}>
    <span class="finder-option-icon" aria-hidden="true">${icon ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">${brewIcons[icon]}</svg>` : ''}</span>
    <span class="finder-option-copy"><strong>${label}</strong><small>${detail}</small></span>
    <span class="finder-tick" aria-hidden="true"></span>
  </label>`).join('');
}

function finderProgress(step) {
  const labels = { brew: 'Brew', taste: 'Taste', match: 'Match' };
  const stages = Object.entries(labels);
  const current = stages.findIndex(([key]) => key === step);
  return `<div class="finder-progress" aria-label="Progress">${stages.map(([key, label], index) =>
    `<span ${index < current ? 'class="is-complete"' : ''} ${key === step ? 'aria-current="step"' : ''}><span><b aria-hidden="true">${String(index + 1).padStart(2, '0')}</b> ${label}</span></span>`).join('')}</div>`;
}

function finderMarkup(step) {
  const brew = step === 'brew';
  const isMatch = step === 'match';
  const product = isMatch ? getFinderMatch() : null;
  const image = isMatch ? product.image : brew ? '/consumer-preview/assets/finder-brew.webp' : '/consumer-preview/assets/finder-taste.webp';
  const heading = isMatch ? product.name : brew ? 'How do you brew?' : 'What are you in the mood for?';
  const intro = brew ? 'We’ll suggest the right grind for your setup.' : 'Pick the flavours you’d like in your cup.';

  return `<div class="finder"><div class="finder-stage" data-step="${step}">
    <div class="finder-visual ${isMatch ? 'finder-visual-match' : ''}">
      <img src="${image}" alt="${isMatch ? product.name + ' coffee artwork' : ''}" width="620" height="420">
      ${isMatch ? '' : `<span class="finder-visual-caption">${brew ? 'Strangers Coffee Roasters' : 'Speciality coffee · 100% arabica'}</span>`}
    </div>
    <div class="finder-content">
      ${finderProgress(step)}
      <h3 class="finder-heading" id="finder-heading" tabindex="-1" autofocus>${heading}</h3>
      ${isMatch ? finderMatchMarkup(product) : `<p class="finder-intro">${intro}</p>
        <form class="finder-form" id="finder-form" data-step="${step}">
          <fieldset aria-labelledby="finder-heading">
            <div class="finder-options ${brew ? 'finder-brews' : 'finder-tastes'}">${finderOptions(step, brew ? brews : tastes)}</div>
          </fieldset>
          <div class="finder-actions">
            ${brew ? '' : '<button class="button outline finder-back" type="button" data-finder-back="brew">Back</button>'}
            <button class="button primary finder-next" type="submit" ${finder[step] ? '' : 'disabled'}>${brew ? 'Continue to taste' : 'Find my match'}</button>
          </div>
        </form>`}
    </div>
  </div></div>`;
}

function getFinderMatch() {
  const options = recommendations[finder.taste];
  const match = productById.get(options[finder.brew] ?? options.default);
  if (match.available !== false) return match;
  return products.find(product => product.profile === finder.taste && product.available !== false) ?? match;
}

function finderMatchMarkup(product) {
  return `<div id="finder-result" class="finder-match-summary">
    <p class="finder-origin">${product.country} · ${product.process}</p>
    <ul class="finder-notes" aria-label="Tasting notes">${product.notes.map(note => `<li>${note}</li>`).join('')}</ul>
    <p class="finder-reason">${finderReasons[product.id] ?? product.shortCopy}</p>
    <div class="finder-grind"><strong>Your grind</strong><span>${grindLabel(finder.brew)}</span></div>
    <div class="finder-actions">
      <button class="button outline finder-back" type="button" data-finder-back="brew">Change answers</button>
      <button class="button primary finder-next" type="button" data-match="${product.id}">Choose coffee · from ${money(product.prices['250g'])}</button>
    </div>
  </div>`;
}

function showFinder(opener) {
  showPanel('finder', 'Find my coffee', finderMarkup('brew'), opener);
}

function moveFinder(step) {
  showPanel('finder', 'Find my coffee', finderMarkup(step));
}

function updateFinder(form) {
  const step = form.dataset.step;
  const option = (step === 'brew' ? brews : tastes).find(({ value }) => value === form.elements[step].value);
  if (!option) return false;
  finder[step] = option.value;
  form.querySelector('.finder-next').disabled = false;
  return true;
}

function bagMarkup(message) {
  const cart = store.cart();
  if (!cart.length) {
    return `<div class="empty-bag"><h3>Your cart is empty.</h3><p>Start with one of the coffees on the shelf.</p>
      <div class="drawer-actions"><button type="button" class="button" data-keep-shopping>Browse coffee</button>
      ${lastReceipt ? '<button type="button" class="button outline" data-last-receipt>View last demo receipt</button>' : ''}</div></div>`;
  }
  const { subtotal, shipping } = store.totals('delivery');
  const remaining = Math.max(0, FREE_SHIPPING - subtotal);
  const progress = shipping
    ? remaining ? `Spend over ${money(remaining)} more for free UK delivery.` : 'Add another coffee for free UK delivery.'
    : 'You’ve unlocked free UK delivery.';
  return `<div class="drawer-content">
    ${message ? `<p role="status" class="checkout-note">${html(message)}</p>` : ''}
    <div class="shipping-progress" aria-live="polite"><span>${progress}</span><progress aria-label="Progress towards free UK delivery" max="${FREE_SHIPPING + 1}" value="${Math.min(subtotal, FREE_SHIPPING + 1)}"></progress></div>
    <ul>${cart.map((line, index) => `<li class="cart-line"><img src="${line.product.image}" alt="" width="64" height="64">
      <div><h3>${line.product.name}</h3><p>${sizeNames[line.size]} · ${grindLabel(line.grind)}</p>
      <div class="cart-controls">${quantityMarkup(line.qty, [line.product.name, sizeNames[line.size], line.grind].join(', '), index)}<button type="button" class="remove" data-remove="${index}" aria-label="Remove ${line.product.name}, ${sizeNames[line.size]}, ${line.grind}">Remove</button><span class="line-price">${money(line.unitPrice * line.qty)}</span></div></div></li>`).join('')}</ul>
    <div aria-live="polite">${orderTotals(store.totals('delivery'), 'delivery')}</div>
    <div class="drawer-actions"><button class="button" type="button" data-checkout>Demo checkout</button><button class="button outline" type="button" data-keep-shopping>Keep shopping</button></div>
  </div>`;
}

function showBag(opener, message) {
  showPanel('bag', 'Your cart', bagMarkup(message), opener);
}

function updateBag(focusSelector) {
  const offset = body.scrollTop;
  body.innerHTML = bagMarkup();
  body.scrollTop = offset;
  const nextFocus = body.querySelector(focusSelector + ':not(:disabled)') ?? body.querySelector('[data-checkout],[data-keep-shopping]') ?? closeButton;
  nextFocus.focus({ preventScroll: true });
}

function reorderAccountOrder(order, opener) {
  if (dialog.open) return;
  let added = 0;
  let skipped = false;
  for (const line of order.lines) {
    if (store.add(line.id, line.size, line.grind, line.qty)) added += line.qty;
    else skipped = true;
  }
  if (!added) return 0;
  bagCount();
  const count = `${added} ${added === 1 ? 'bag' : 'bags'} added at current prices.`;
  showBag(opener, skipped ? `${count} Some coffees or quantities were unavailable.` : count);
  return added;
}

function useCheckoutProfile(profile) {
  const { method: preferredMethod, cafe, ...details } = profile;
  method = preferredMethod;
  checkoutCafe = cafeById.has(cafe) ? cafe : 'dove-street';
  checkoutDraft = Object.fromEntries(checkoutFields.map(name => [name, details[name] ?? '']));
}

function showCheckout() {
  const lines = store.cart();
  if (!lines.length) return showBag();
  if (!Object.keys(checkoutDraft).length) {
    if (signedIn) {
      loadCheckoutProfile();
      return;
    }
    useCheckoutProfile(loadAccount().profile);
  }
  const pricing = store.totals(method);
  showPanel('checkout', 'Checkout', checkoutDetails({ cafes, method, lines, pricing }), undefined, checkoutDock(pricing));
  const form = document.querySelector('#checkout-form');
  for (const [name, value] of Object.entries(checkoutDraft)) form.elements[name].value = value;
  form.elements.cafe.value = checkoutCafe;
  updateCheckout(form);
}

async function loadCheckoutProfile() {
  showPanel('checkout', 'Checkout', '<div class="drawer-content" id="checkout-loading" role="status">Loading saved details…</div>');
  const loading = body.querySelector('#checkout-loading');
  const isCurrent = () => loading.isConnected && dialog.open && !dialog.classList.contains('is-closing');
  try {
    const account = await getServerAccount();
    if (!isCurrent()) return;
    if (!account) {
      showPanel('checkout', 'Checkout', '<div class="drawer-content"><p>Your session ended. Sign in again to continue.</p><a class="button" href="/signin-with-chatgpt?return_to=%2Fcoffee%2F" target="_top">Sign in</a></div>');
      return;
    }
    useCheckoutProfile(account.profile);
    showCheckout();
  } catch {
    if (isCurrent()) showPanel('checkout', 'Checkout', '<div class="drawer-content"><p>Saved details are temporarily unavailable.</p><button type="button" class="button" data-checkout>Try again</button></div>');
  }
}

function updateCheckout(form) {
  method = form.elements.method.value;
  checkoutCafe = form.elements.cafe.value;
  const collecting = method === 'collection';
  const address = form.querySelector('#checkout-address');
  const collection = form.querySelector('#checkout-collection');
  address.hidden = address.disabled = collecting;
  collection.hidden = collection.disabled = !collecting;
  form.querySelector('#collection-address').textContent = cafeById.get(checkoutCafe).address;

  const pricing = store.totals(method);
  form.querySelector('#checkout-totals').innerHTML = orderTotals(pricing, method);
  dock.querySelector('[data-checkout-total]').textContent = money(pricing.total);
}

function stashCheckout(form) {
  if (!form) return;
  checkoutDraft = Object.fromEntries(checkoutFields.map(name => [name, form.elements[name].value]));
}

function reviewCheckout(form) {
  for (const name of checkoutFields) {
    form.elements[name].value = form.elements[name].value.trim();
  }
  if (!form.reportValidity()) return;
  stashCheckout(form);
  if (method === 'delivery') {
    const postcode = checkoutDraft.postcode.toUpperCase().replace(/ /g, '');
    checkoutDraft.postcode = `${postcode.slice(0, -3)} ${postcode.slice(-3)}`;
  }

  showCheckoutReview();
}

function showCheckoutReview(error) {
  const lines = store.cart();
  if (!lines.length) return showBag();
  const cafe = method === 'collection' ? cafeById.get(checkoutCafe) : null;
  const pricing = store.totals(method);
  showPanel('checkout-review', 'Checkout', checkoutReview({ details: checkoutDraft, cafe, method, lines, pricing }),
    undefined, checkoutDock(pricing, true));
  if (error) {
    const message = body.querySelector('#checkout-error');
    message.textContent = error;
    message.hidden = false;
  }
}

function showReceipt(order) {
  if (!order) return;
  const ordersLink = order.historySaved ? '<a class="text-button" href="/account/#orders" data-view-orders>View orders</a>' : '';
  showPanel('receipt', 'Order preview', receiptMarkup(order), undefined,
    `<div class="checkout-dock receipt-dock">${ordersLink}<button type="button" class="button" data-keep-shopping>Continue shopping</button></div>`);
}

function beginProcessing(saving = false) {
  showPanel('checkout-processing', 'Checkout', processingMarkup(saving));
  const tamper = body.querySelector('.coffee-tamping__tamper');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return { tamper, done: Promise.resolve() };
  const done = new Promise(resolve => {
    const finish = () => {
      clearTimeout(fallback);
      resolve();
    };
    const fallback = setTimeout(finish, 950);
    tamper.addEventListener('animationend', event => {
      if (event.animationName === 'checkout-tamp-stroke') finish();
    });
  });
  return { tamper, done };
}

function finishOrder(order, transition) {
  lastReceipt = order;
  checkoutDraft = {};
  bagCount();
  refreshAccountOrders?.();
  if (!transition && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    showReceipt(order);
    return;
  }

  const { tamper, done } = transition ?? beginProcessing();
  done.then(() => {
    if (tamper.isConnected && dialog.open && !dialog.classList.contains('is-closing')) showReceipt(order);
  });
}

async function submitSignedOrder(lines) {
  orderInFlight = true;
  const transition = beginProcessing(true);
  closeButton.disabled = true;
  try {
    const order = await placeAccountOrder(method, checkoutCafe, lines);
    store.clear();
    clearOrderAttempt();
    finishOrder({ ...order, historySaved: true }, transition);
  } catch (error) {
    showCheckoutReview(error?.name === 'TimeoutError'
      ? 'That took too long. Try again to confirm the same order.'
      : error.message || 'Checkout is temporarily unavailable. Your cart is ready to retry.');
  } finally {
    orderInFlight = false;
    closeButton.disabled = false;
  }
}

function placeDemo() {
  if (orderInFlight || dialog.dataset.view !== 'checkout-review') return;
  const lines = store.cart();
  if (signedIn) {
    submitSignedOrder(lines);
    return;
  }
  const pricing = store.totals(method);
  const result = store.placeOrder({ method, name: checkoutDraft.name, email: checkoutDraft.email });
  if (!result) {
    body.querySelector('#checkout-error').hidden = false;
    return;
  }

  const cafe = result.method === 'collection' ? cafeById.get(checkoutCafe) : null;
  const order = { ...result, lines, pricing, cafe, createdAt: new Date().toISOString() };
  order.historySaved = recordDemoOrder(order);
  finishOrder(order);
}

menuButton.addEventListener('click', () => menuOpen(siteMenu.inert));
closeButton.addEventListener('click', closePanel);
dialog.addEventListener('cancel', event => {
  event.preventDefault();
  closePanel();
});
let backdropPress = false;
dialog.addEventListener('pointerdown', event => { backdropPress = event.target === dialog; });
dialog.addEventListener('click', event => { if (backdropPress && event.target === dialog) closePanel(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !siteMenu.inert) menuOpen(false, true);
});
search?.addEventListener('input', renderShelf);
tasteFilter?.addEventListener('change', () => {
  filter = tasteFilter.value;
  renderShelf();
});

document.addEventListener('click', event => {
  const control = event.target.closest('button,a');
  if (!control || control.disabled || (dialog.classList.contains('is-closing') && dialog.contains(control))) return;
  const action = control.dataset;
  if (action.find !== undefined) showFinder(control);
  else if (action.bag !== undefined) showBag(control);
  else if (action.filter !== undefined) {
    filter = action.filter;
    renderShelf();
  } else if (action.reset !== undefined) {
    filter = 'All';
    search.value = '';
    renderShelf();
    search.focus();
  } else if (action.cafe) {
    activeCafe = action.cafe;
    renderCafes();
  } else if (action.product) showProduct(action.product, control);
  else if (action.finderBack !== undefined) moveFinder(action.finderBack);
  else if (action.match) showProduct(action.match, control, { grind: finder.brew, fromFinder: true });
  else if (action.checkout !== undefined || action.checkoutEdit !== undefined) showCheckout();
  else if (action.placeOrder !== undefined) placeDemo();
  else if (action.lastReceipt !== undefined) showReceipt(lastReceipt);
  else if (action.viewOrders !== undefined && accountPage) closePanel();
  else if (action.openBag !== undefined) {
    stashCheckout(document.querySelector('#checkout-form'));
    showBag();
  } else if (action.sample !== undefined) {
    const form = document.querySelector('#checkout-form');
    const sample = { name: 'Alex Taylor', email: 'alex@example.com', address: '10 Dove Street', town: 'Norwich', postcode: 'NR2 1DE' };
    for (const [name, value] of Object.entries(sample)) form.elements[name].value = value;
  } else if (action.keepShopping !== undefined) {
    if (!shelf) {
      window.location.assign('/coffee/#shelf-title');
      return;
    }
    returnFocus = document.querySelector('#shelf-title');
    closePanel();
    document.querySelector('#coffee').scrollIntoView();
  } else if (action.remove !== undefined) {
    const line = store.cart()[Number(action.remove)];
    if (line && store.remove(line.key)) {
      bagCount();
      updateBag(`[data-remove="${Math.min(Number(action.remove), store.cart().length - 1)}"]`);
    }
  } else if (action.qty) {
    const delta = Number(action.qty);
    if (action.line === undefined) {
      productQty += delta;
      resizeQty(control.closest('.qty'), productQty);
      updateProductPrice(document.querySelector('#product-form'));
    } else {
      const line = store.cart()[Number(action.line)];
      if (line && store.setQty(line.key, line.qty + delta)) {
        bagCount();
        updateBag(`[data-line="${action.line}"][data-qty="${line.qty + delta === 1 ? 1 : delta}"]`);
      }
    }
  }
  if (siteMenu.contains(control) && control.matches('a')) menuOpen(false, true);
});

body.addEventListener('change', event => {
  const form = event.target.form;
  if (form?.id === 'product-form') updateProductPrice(form);
  if (form?.id === 'finder-form') updateFinder(form);
  if (form?.id === 'checkout-form' && ['method', 'cafe'].includes(event.target.name)) updateCheckout(form);
});

body.addEventListener('submit', event => {
  event.preventDefault();
  if (dialog.classList.contains('is-closing')) return;
  const form = event.target;
  if (form.id === 'finder-form' && updateFinder(form)) {
    moveFinder(form.dataset.step === 'brew' ? 'taste' : 'match');
  }
  if (form.id === 'product-form') {
    const product = productById.get(form.dataset.id);
    if (store.add(product.id, form.elements.size.value, form.elements.grind.value, productQty)) {
      bagCount();
      showBag(undefined, `${product.name} added to your cart.`);
    } else {
      document.querySelector('#product-error').hidden = false;
    }
  }
  if (form.id === 'checkout-form') reviewCheckout(form);
});

bagCount();
if (shelf) renderShelf();
if (document.querySelector('#cafe-detail')) renderCafes();
const accountPage = document.querySelector('#account-page');
const refreshAccountOrders = accountPage ? setupAccount(accountPage, reorderAccountOrder) : null;

const contactForm = document.querySelector('#contact-form');
if (contactForm) {
  const contactStatus = document.querySelector('#contact-status');
  contactForm.addEventListener('submit', event => {
    event.preventDefault();
    contactForm.reset();
    contactStatus.hidden = false;
    contactStatus.textContent = 'Preview complete. Your message stayed in this browser.';
  });
  contactForm.querySelector('fieldset').disabled = false;
}

const espressoVideo = document.querySelector('[data-espresso-video]');
if (espressoVideo && /^[A-Za-z0-9_-]{11}$/.test(espressoVideo.dataset.espressoVideo)) {
  const play = espressoVideo.querySelector('[data-play-espresso]');
  play.hidden = false;
  play.addEventListener('click', () => {
    const frame = document.createElement('iframe');
    frame.src = `https://www.youtube-nocookie.com/embed/${espressoVideo.dataset.espressoVideo}?autoplay=1`;
    frame.title = 'Espresso brew guide';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    play.replaceWith(frame);
    frame.focus();
  }, { once: true });
}
