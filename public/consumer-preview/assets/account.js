import { orderImagePath } from './account-store.js';
import { loadAccount, ORDERS_KEY, saveAccountProfile } from './account-store.js';
import { grindLabel, orderTotals, sizeNames } from './checkout.js';
import { escapeHtml as html } from './html.js';
import { money } from './store.js';

const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Europe/London' });
const profileFields = ['name', 'phone', 'address', 'town', 'postcode', 'method', 'cafe'];

const statusLabels = {
  placed: 'Placed', preparing: 'Preparing', ready: 'Ready', completed: 'Completed', cancelled: 'Cancelled',
};

function orderMarkup(order) {
  const { reference, createdAt, method, cafe, pricing, lines } = order;
  const label = method === 'collection' ? 'Collection' : 'UK delivery';
  return `<li class="account-order">
    <details class="account-order-record">
      <summary class="account-order-summary">
        <span class="account-order-copy">
          <strong>${html(reference)}</strong>
          <small><time datetime="${html(createdAt)}">${dateFormat.format(new Date(createdAt))}</time> · ${label}</small>
        </span>
        <span class="account-order-price"><strong>${money(pricing.total)}</strong><small>${html(statusLabels[order.status] ?? 'Demo order')}</small></span>
      </summary>
      <div class="account-order-body">
        ${cafe ? `<p class="account-order-destination">Collection at ${html(cafe.name)}<br>${html(cafe.address)}</p>` : ''}
        <ul class="account-order-lines">${lines.map(line => `<li>
          <img src="${html(orderImagePath(line.product.image) || '/consumer-preview/assets/mark.svg')}" alt="" width="48" height="48" loading="lazy">
          <div><strong>${html(line.product.name)}</strong><small>${sizeNames[line.size]} · ${html(grindLabel(line.grind))} · Qty ${line.qty}</small></div>
          <span>${money(line.unitPrice * line.qty)}</span>
        </li>`).join('')}</ul>
        ${orderTotals(pricing, method)}
        <button type="button" class="button outline account-reorder" data-account-reorder="${html(reference)}" aria-label="Add coffees from ${html(reference)} to cart">Add to cart again</button>
        <p class="account-notice" role="status"></p>
      </div>
    </details>
  </li>`;
}

async function accountRequest(options = {}) {
  let response;
  try {
    response = await fetch('/api/account', {
      cache: 'no-store',
      credentials: 'same-origin',
      ...options,
      headers: { Accept: 'application/json', ...(options.headers ?? {}) },
    });
  } catch {
    throw new Error('We couldn’t reach your account. Try again.');
  }
  if (response.status === 401) return null;
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Your account is temporarily unavailable. Try again.');
  }
  return body;
}

export function getServerAccount() {
  return accountRequest();
}

export function setupAccount(root, reorder) {
  const access = root.querySelector('#account-access');
  const accessStatus = root.querySelector('#account-access-status');
  const signIn = root.querySelector('#account-sign-in');
  const recovery = root.querySelector('#account-recovery');
  const retry = root.querySelector('#account-retry');
  const browserDemo = root.querySelector('#account-browser-demo');
  const dashboard = root.querySelector('#account-dashboard');
  const dashboardStatus = root.querySelector('#account-dashboard-status');
  const session = root.querySelector('#account-session');
  const sessionName = root.querySelector('#account-session-name');
  const signOut = root.querySelector('#account-sign-out');
  const leaveDemo = root.querySelector('#account-leave-demo');
  const detailsCopy = root.querySelector('#account-details-copy');
  const orderHistory = root.querySelector('#account-order-history');
  const form = root.querySelector('#account-profile');
  const emailNote = root.querySelector('#account-email-note');
  const controls = [...form.querySelectorAll('fieldset, button[type=submit]')];
  const saveStatus = root.querySelector('#account-save-status');
  const cafeField = root.querySelector('#account-cafe-field');
  const details = root.querySelector('#account-details');
  const orders = root.querySelector('#account-orders');
  const tabs = [...root.querySelectorAll('[data-account-tab]')];
  let currentOrders = [];
  let mode = 'access';
  let currentEmail = null;
  let loadSequence = 0;
  let saving = false;

  function showAccess(state, message) {
    mode = 'access';
    currentEmail = null;
    currentOrders = [];
    orderHistory.replaceChildren();
    form.reset();
    saveStatus.textContent = '';
    dashboardStatus.textContent = '';
    controls.forEach(control => { control.disabled = true; });
    dashboard.hidden = true;
    session.hidden = true;
    sessionName.textContent = '';
    access.hidden = false;
    accessStatus.textContent = message;
    signIn.hidden = state !== 'signed-out';
    recovery.hidden = state !== 'signed-out';
    browserDemo.hidden = state !== 'signed-out';
    retry.hidden = state !== 'error';
    access.querySelector('h2').textContent = state === 'signed-out' ? 'Sign in to My account' : 'Your Strangers account';
  }

  function syncCafeField() {
    cafeField.hidden = form.elements.method.value !== 'collection';
    form.elements.cafe.disabled = cafeField.hidden;
  }

  function fillProfile(profile, email) {
    for (const name of profileFields) form.elements[name].value = profile[name] ?? '';
    form.elements.email.value = email;
    if (!form.elements.method.value) form.elements.method.value = 'delivery';
    if (!form.elements.cafe.value) form.elements.cafe.selectedIndex = 0;
    syncCafeField();
  }

  function renderOrders() {
    orderHistory.innerHTML = currentOrders.length
      ? `<ul class="account-order-list">${currentOrders.map(orderMarkup).join('')}</ul>`
      : `<div class="account-empty"><h3>No demo orders yet</h3>
          <p>Your coffee orders will appear here after checkout.</p>
          <a href="/coffee/" class="button">Shop coffee</a></div>`;
  }

  function showDashboard(name) {
    const guest = mode === 'guest';
    sessionName.textContent = name;
    signOut.hidden = guest;
    leaveDemo.hidden = !guest;
    detailsCopy.textContent = guest
      ? 'Save the details you’d like filled in at demo checkout on this browser.'
      : 'Save your contact and delivery preferences for beta checkout.';
    form.elements.email.readOnly = !guest;
    emailNote.hidden = guest;
    dashboardStatus.textContent = '';
    renderOrders();
    controls.forEach(control => { control.disabled = saving; });
    access.hidden = true;
    dashboard.hidden = false;
    session.hidden = false;
  }

  async function refreshOrders() {
    if (mode === 'guest') {
      currentOrders = loadAccount().orders;
      renderOrders();
      return;
    }
    const sequence = ++loadSequence;
    try {
      const account = await getServerAccount();
      if (sequence !== loadSequence) return;
      if (!account) {
        showAccess('signed-out', 'Sign in to keep track of orders and use saved details at checkout.');
        return;
      }
      if (!account.identity?.email || !account.profile || !Array.isArray(account.orders)) {
        throw new Error('Your account is temporarily unavailable. Try again.');
      }
      const email = account.identity.email;
      if (currentEmail !== email) fillProfile(account.profile, email);
      mode = 'server';
      currentEmail = email;
      currentOrders = account.orders;
      showDashboard(account.identity.name || email);
    } catch (error) {
      if (sequence !== loadSequence) return;
      if (mode === 'server') {
        dashboardStatus.textContent = 'Your orders couldn’t be refreshed. Reload the page to try again.';
      } else {
        showAccess('error', error.message);
      }
    }
  }

  function switchTab(tab) {
    const showingDetails = tab === 'details';
    details.hidden = !showingDetails;
    orders.hidden = showingDetails;
    for (const button of tabs) {
      button.setAttribute('aria-pressed', String(button.dataset.accountTab === tab));
    }
  }

  function syncTab() {
    switchTab(window.location.hash === '#details' ? 'details' : 'orders');
  }

  for (const button of tabs) {
    button.addEventListener('click', () => {
      const tab = button.dataset.accountTab;
      if (window.location.hash !== `#${tab}`) window.history.pushState(null, '', `#${tab}`);
      switchTab(tab);
    });
  }
  window.addEventListener('popstate', syncTab);
  window.addEventListener('hashchange', syncTab);
  syncTab();

  retry.addEventListener('click', () => {
    showAccess('loading', 'Loading your account…');
    void refreshOrders();
  });

  browserDemo.addEventListener('click', () => {
    if (browserDemo.hidden) return;
    loadSequence += 1;
    const account = loadAccount();
    mode = 'guest';
    fillProfile(account.profile, account.profile.email ?? '');
    currentOrders = account.orders;
    showDashboard('Browser demo account');
    (details.hidden ? orders : details).querySelector('h2').focus({ preventScroll: true });
  });

  window.addEventListener('storage', event => {
    if (mode === 'guest' && (event.key === ORDERS_KEY || event.key === null)) void refreshOrders();
  });

  form.elements.method.addEventListener('change', syncCafeField);
  form.addEventListener('input', event => {
    saveStatus.textContent = '';
    if (event.target === form.elements.phone) form.elements.phone.setCustomValidity('');
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving || mode === 'access') return;
    const activeMode = mode;
    const email = currentEmail;
    const fields = activeMode === 'guest' ? [...profileFields, 'email'] : profileFields;
    const values = Object.fromEntries(fields.map(name => [name, form.elements[name].value.trim()]));
    if (values.phone && (!/^\+?[0-9 ().-]+$/.test(values.phone) || !/^\d{7,15}$/.test(values.phone.replace(/\D/g, '')))) {
      form.elements.phone.setCustomValidity('Enter a phone number with 7 to 15 digits.');
      form.elements.phone.reportValidity();
      return;
    }
    const postcode = values.postcode.toUpperCase().replace(/ /g, '');
    values.postcode = postcode ? `${postcode.slice(0, -3)} ${postcode.slice(-3)}` : '';
    saving = true;
    saveStatus.textContent = 'Saving details…';
    saveStatus.classList.remove('account-save-error');
    controls.forEach(control => { control.disabled = true; });

    try {
      if (activeMode === 'guest') {
        if (!saveAccountProfile(values)) throw new Error('Details couldn’t be saved. Check your browser storage settings.');
        const profile = loadAccount().profile;
        fillProfile(profile, profile.email ?? '');
        saveStatus.textContent = 'Details saved on this browser.';
        return;
      }
      const result = await accountRequest({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (mode !== activeMode || currentEmail !== email) return;
      if (!result) {
        showAccess('signed-out', 'Sign in again to update your account details.');
        access.querySelector('h2').focus({ preventScroll: true });
        return;
      }
      if (!result.profile) throw new Error('Your details couldn’t be saved. Try again.');
      fillProfile(result.profile, email);
      saveStatus.textContent = 'Account details saved.';
    } catch (error) {
      if (mode === activeMode && currentEmail === email) {
        saveStatus.textContent = error.message;
        saveStatus.classList.add('account-save-error');
      }
    } finally {
      saving = false;
      if (mode === activeMode && currentEmail === email) controls.forEach(control => { control.disabled = false; });
    }
  });

  orderHistory.addEventListener('click', event => {
    const button = event.target.closest('[data-account-reorder]');
    if (!button) return;
    const order = currentOrders.find(record => record.reference === button.dataset.accountReorder);
    if (!order) return;
    const added = reorder(order, button);
    button.closest('.account-order-body').querySelector('.account-notice').textContent =
      added === 0 ? 'These coffees or quantities are unavailable to add to your cart.' : '';
  });

  void refreshOrders();
  return refreshOrders;
}
