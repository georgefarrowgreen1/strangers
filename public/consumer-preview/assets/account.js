import { orderImagePath } from './account-store.js';
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
      signal: AbortSignal.timeout(10000),
      ...options,
      headers: { Accept: 'application/json', ...(options.headers ?? {}) },
    });
  } catch {
    throw new Error('We couldn’t reach your account. Try again.');
  }
  if (response.status === 401) return null;
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) {
    throw new Error(typeof body?.message === 'string' ? body.message : 'Your account is temporarily unavailable. Try again.');
  }
  return body;
}

export function getServerAccount() {
  return accountRequest();
}


const passwordMin = 12;
const authModes = {
  login: {
    heading: 'Sign in to My account',
    copy: 'Use your email and password to view orders and saved details.',
    fields: ['email', 'password'],
    submit: 'Sign in',
    links: ['register', 'forgot'],
  },
  register: {
    heading: 'Create your account',
    copy: 'Enter your email and we’ll send a link to set up your Strangers account.',
    fields: ['email'],
    submit: 'Send setup link',
    links: ['login'],
  },
  forgot: {
    heading: 'Reset your password',
    copy: 'Enter the email you use for your Strangers account.',
    fields: ['email'],
    submit: 'Send reset link',
    links: ['login'],
  },
  setup: {
    heading: 'Set up your account',
    copy: 'Add your name and choose a password for your Strangers account.',
    fields: ['name', 'password'],
    submit: 'Set up account',
    links: ['register', 'login'],
  },
  reset: {
    heading: 'Choose a new password',
    copy: 'Enter the new password you’d like to use for your Strangers account.',
    fields: ['password'],
    submit: 'Save password',
    links: ['forgot', 'login'],
  },
};
const modeLabels = { login: 'Back to sign in', register: 'Create an account', forgot: 'Forgot password?' };

function authField(name, mode) {
  if (name === 'email') {
    return '<div class="field"><label for="account-auth-email">Email address</label><input id="account-auth-email" name="email" type="email" inputmode="email" autocomplete="username" autocapitalize="none" maxlength="254" required></div>';
  }
  if (name === 'name') {
    return '<div class="field"><label for="account-auth-name">Full name</label><input id="account-auth-name" name="name" autocomplete="name" maxlength="120" required></div>';
  }
  const newPassword = mode === 'setup' || mode === 'reset';
  return `<div class="field">
    <label for="account-auth-password">${newPassword ? 'New password' : 'Password'}</label>
    <div class="account-password-field">
      <input id="account-auth-password" name="password" type="password" autocomplete="${newPassword ? 'new-password' : 'current-password'}" maxlength="128"${newPassword ? ` minlength="${passwordMin}" aria-describedby="account-password-hint"` : ''} required>
      <button type="button" data-account-show-password aria-label="Show password" aria-pressed="false">Show</button>
    </div>
    ${newPassword ? `<p class="account-password-hint" id="account-password-hint">Use at least ${passwordMin} characters.</p>` : ''}
  </div>`;
}

async function authRequest(action, values) {
  let response;
  try {
    response = await fetch('/consumer-auth/' + action, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'error',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify(values),
    });
  } catch {
    throw new Error('We couldn’t reach your account. Try again.');
  }

  const body = await response.json().catch(() => null);
  const accepted = action === 'register' || action === 'forgot'
    ? body?.accepted === true
    : body?.signedIn === (action !== 'logout');
  if (!response.ok || !accepted) {
    throw new Error(body?.message || 'We couldn’t complete that request. Try again.');
  }
}

export function setupAccount(root, reorder) {
  const access = root.querySelector('#account-access');
  const accessTitle = root.querySelector('#account-access-title');
  const accessCopy = root.querySelector('#account-access-copy');
  const accessStatus = root.querySelector('#account-access-status');
  const retry = root.querySelector('#account-retry');
  const authPanel = root.querySelector('#account-auth');
  const authForm = root.querySelector('#account-auth-form');
  const authFields = root.querySelector('#account-auth-fields');
  const authSubmit = root.querySelector('#account-auth-submit');
  const authStatus = root.querySelector('#account-auth-status');
  const authLinks = root.querySelector('#account-auth-links');
  const dashboard = root.querySelector('#account-dashboard');
  const dashboardStatus = root.querySelector('#account-dashboard-status');
  const session = root.querySelector('#account-session');
  const sessionName = root.querySelector('#account-session-name');
  const signOut = root.querySelector('#account-sign-out');
  const orderHistory = root.querySelector('#account-order-history');
  const form = root.querySelector('#account-profile');
  const controls = [...form.querySelectorAll('fieldset, button[type=submit]')];
  const saveStatus = root.querySelector('#account-save-status');
  const cafeField = root.querySelector('#account-cafe-field');
  const details = root.querySelector('#account-details');
  const orders = root.querySelector('#account-orders');
  const tabs = [...root.querySelectorAll('[data-account-tab]')];
  const url = new URL(window.location.href);
  const requestedMode = url.searchParams.get('mode');
  const returnPath = url.searchParams.get('return_to') === '/coffee/' ? '/coffee/' : '/account/';
  let token;
  if (requestedMode === 'setup' || requestedMode === 'reset') {
    token = window.takeStrangersAccountLink?.() ?? new URLSearchParams(url.hash.slice(1)).get('token');
    if (url.hash) window.history.replaceState(window.history.state, '', url.pathname + url.search);
  }

  let currentOrders = [];
  let currentEmail = null;
  let loadSequence = 0;
  let saving = false;
  let authPending = false;
  let authMode = null;

  function setAuthLinks(modes) {
    authLinks.replaceChildren(...modes.map(mode => {
      const link = document.createElement('a');
      const query = new URLSearchParams({ mode });
      if (returnPath === '/coffee/') query.set('return_to', returnPath);
      link.href = '/account/?' + query;
      link.textContent = modeLabels[mode];
      return link;
    }));
  }

  function showAccess() {
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
    authPanel.hidden = true;
    retry.hidden = true;
  }

  function showAuth(mode, message = '') {
    showAccess();
    authMode = mode;
    const config = authModes[mode];
    const linked = mode === 'setup' || mode === 'reset';
    const missingToken = linked && !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(token ?? '');

    authPanel.hidden = false;
    accessTitle.textContent = missingToken ? 'Request a new link' : config.heading;
    accessCopy.textContent = missingToken ? 'This email link is incomplete or has already been opened.' : config.copy;
    accessStatus.textContent = message;
    authStatus.textContent = '';
    authStatus.classList.remove('account-save-error');
    authForm.hidden = missingToken;
    authForm.action = '/consumer-auth/' + mode;
    authFields.innerHTML = missingToken ? '' : config.fields.map(name => authField(name, mode)).join('');
    authFields.disabled = false;
    authSubmit.disabled = false;
    authSubmit.textContent = config.submit;
    setAuthLinks(missingToken ? [mode === 'setup' ? 'register' : 'forgot', 'login'] : config.links);
  }

  function showMailNotice(mode) {
    authFields.replaceChildren();
    authForm.hidden = true;
    accessTitle.textContent = 'Check your email';
    accessCopy.textContent = mode === 'register'
      ? 'If this address can be used to create an account, we’ll send a setup link.'
      : 'If there’s an account for this address, we’ll send a reset link.';
    accessStatus.textContent = '';
    setAuthLinks(['login']);
    accessTitle.focus({ preventScroll: true });
  }

  authForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (authPending || authForm.hidden || !authMode) return;
    const mode = authMode;
    const values = Object.fromEntries(authModes[mode].fields.map(name => {
      const value = authForm.elements[name].value;
      return [name, name === 'password' ? value : value.trim()];
    }));
    if (mode === 'setup' || mode === 'reset') values.token = token;

    authPending = true;
    authFields.disabled = true;
    authSubmit.disabled = true;
    authStatus.classList.remove('account-save-error');
    authStatus.textContent = mode === 'register' || mode === 'forgot' ? 'Sending your link…' : 'Please wait…';
    let navigating = false;
    try {
      await authRequest(mode, values);
      authForm.reset();
      if (mode === 'register' || mode === 'forgot') {
        showMailNotice(mode);
        return;
      }
      token = null;
      window.location.replace(returnPath);
      navigating = true;
    } catch (error) {
      authStatus.textContent = error.message;
      authStatus.classList.add('account-save-error');
    } finally {
      if (!navigating) {
        authPending = false;
        authFields.disabled = false;
        authSubmit.disabled = false;
      }
    }
  });

  authForm.addEventListener('click', event => {
    const toggle = event.target.closest('[data-account-show-password]');
    if (!toggle) return;
    const password = authForm.elements.password;
    const visible = password.type === 'password';
    password.type = visible ? 'text' : 'password';
    toggle.textContent = visible ? 'Hide' : 'Show';
    toggle.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
    toggle.setAttribute('aria-pressed', String(visible));
  });

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

  function showDashboard(name) {
    sessionName.textContent = name;
    dashboardStatus.textContent = '';
    orderHistory.innerHTML = currentOrders.length
      ? `<ul class="account-order-list">${currentOrders.map(orderMarkup).join('')}</ul>`
      : '<div class="account-empty"><h3>No orders yet</h3><p>Your coffee orders will appear here after checkout.</p><a href="/coffee/" class="button">Shop coffee</a></div>';
    controls.forEach(control => { control.disabled = saving; });
    access.hidden = true;
    dashboard.hidden = false;
    session.hidden = false;
  }

  async function refreshOrders() {
    const sequence = ++loadSequence;
    try {
      const account = await getServerAccount();
      if (sequence !== loadSequence) return;
      if (!account) {
        showAuth('login');
        return;
      }
      if (!account.identity?.email || !account.profile || !Array.isArray(account.orders)) {
        throw new Error('Your account is temporarily unavailable. Try again.');
      }
      const email = account.identity.email;
      if (currentEmail !== email) fillProfile(account.profile, email);
      currentEmail = email;
      currentOrders = account.orders;
      showDashboard(account.profile.name || account.identity.name || email);
    } catch (error) {
      if (sequence !== loadSequence) return;
      if (currentEmail) {
        dashboardStatus.textContent = 'Your orders couldn’t be refreshed. Reload the page to try again.';
      } else {
        showAccess();
        accessTitle.textContent = 'Your Strangers account';
        accessStatus.textContent = error.message;
        retry.hidden = false;
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
    showAccess();
    accessStatus.textContent = 'Loading your account…';
    void refreshOrders();
  });

  signOut.addEventListener('click', async () => {
    if (signOut.disabled) return;
    signOut.disabled = true;
    try {
      await authRequest('logout', {});
      loadSequence += 1;
      showAuth('login');
      window.location.replace('/account/');
    } catch (error) {
      const status = details.hidden ? dashboardStatus : saveStatus;
      status.textContent = error.message;
      signOut.disabled = false;
    }
  });

  form.elements.method.addEventListener('change', syncCafeField);
  form.addEventListener('input', event => {
    saveStatus.textContent = '';
    if (event.target === form.elements.phone) form.elements.phone.setCustomValidity('');
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving || !currentEmail) return;
    const email = currentEmail;
    const values = Object.fromEntries(profileFields.map(name => [name, form.elements[name].value.trim()]));
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
      const result = await accountRequest({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (currentEmail !== email) return;
      if (!result) {
        showAuth('login', 'Sign in again to update your account details.');
        accessTitle.focus({ preventScroll: true });
        return;
      }
      if (!result.profile) throw new Error('Your details couldn’t be saved. Try again.');
      fillProfile(result.profile, email);
      sessionName.textContent = result.profile.name || email;
      saveStatus.textContent = 'Account details saved.';
    } catch (error) {
      if (currentEmail === email) {
        saveStatus.textContent = error.message;
        saveStatus.classList.add('account-save-error');
      }
    } finally {
      saving = false;
      if (currentEmail === email) controls.forEach(control => { control.disabled = false; });
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

  if (Object.hasOwn(authModes, requestedMode)) {
    showAuth(requestedMode);
    accessTitle.focus({ preventScroll: true });
  } else {
    void refreshOrders();
  }
  return () => { if (currentEmail) void refreshOrders(); };
}
