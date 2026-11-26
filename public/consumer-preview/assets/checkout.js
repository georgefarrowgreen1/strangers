import { orderImagePath } from './account-store.js';
import { escapeHtml as html } from './html.js';
import { money } from './store.js';
import { tampingMarkup } from './checkout-motion.js';

export const sizeNames = { '250g': '250 g', '500g': '500 g', '1kg': '1 kg' };
export const grindLabel = grind => grind === 'Whole bean' ? 'Beans' : grind;

export function orderTotals({ subtotal, shipping, total }, method) {
  return `<dl class="totals">
    <div><dt>Subtotal</dt><dd>${money(subtotal)}</dd></div>
    <div><dt>${method === 'collection' ? 'Collection' : 'Royal Mail Tracked 48'}</dt><dd>${shipping ? money(shipping) : 'Free'}</dd></div>
    <div class="grand-total"><dt>Total</dt><dd>${money(total)}</dd></div>
  </dl>`;
}

function stepProgress(step) {
  return `<ol class="checkout-steps" aria-label="Checkout progress">
    <li ${step === 'details' ? 'aria-current="step"' : 'class="is-complete"'}>Details</li>
    <li${step === 'review' ? ' aria-current="step"' : ''}>Review</li>
  </ol>`;
}

function lineItems(lines) {
  return `<ul class="checkout-line-list">${lines.map(line => `<li>
    <img src="${html(orderImagePath(line.product.image) || '/consumer-preview/assets/mark.svg')}" alt="" width="48" height="48">
    <div><strong>${html(line.product.name)}</strong><small>${sizeNames[line.size]} · ${html(grindLabel(line.grind))} · Qty ${line.qty}</small></div>
    <span>${money(line.qty * line.unitPrice)}</span>
  </li>`).join('')}</ul>`;
}

function summary(lines, pricing, method, preview = false) {
  return `<aside class="checkout-summary${preview ? ' checkout-summary-preview' : ''}" aria-label="Order summary">
    <h4>Order summary</h4>
    ${lineItems(lines)}
    <div id="checkout-totals">${orderTotals(pricing, method)}</div>
  </aside>`;
}

function field(name, label, options = '') {
  return `<div class="field"><label for="checkout-${name}">${label}</label><input id="checkout-${name}" name="${name}" ${options}></div>`;
}

function methodChoice(value, label, detail, method) {
  return `<label class="checkout-option">
    <input type="radio" name="method" value="${value}"${method === value ? ' checked' : ''}>
    <strong>${label}</strong><small>${detail}</small>
  </label>`;
}

export function checkoutDetails({ cafes, method, lines, pricing }) {
  const collecting = method === 'collection';
  return `<div class="checkout-shell">
    ${stepProgress('details')}
    <div class="checkout-stage">
      <form class="checkout" id="checkout-form" autocomplete="off">
        <div class="checkout-layout">
          <div class="checkout-fields">
            <div class="checkout-step-intro">
              <h3 class="checkout-heading" tabindex="-1" data-panel-focus>Delivery and contact</h3>
              <p>Demo checkout · No payment taken</p>
              <button class="text-button" type="button" data-sample>Use sample details</button>
            </div>
            <fieldset class="checkout-method">
              <legend>How would you like your coffee?</legend>
              <div class="checkout-methods">
                ${methodChoice('delivery', 'UK delivery', 'Royal Mail Tracked 48', method)}
                ${methodChoice('collection', 'Collection', 'Pick up in Norwich', method)}
              </div>
            </fieldset>
            <fieldset class="checkout-group checkout-address" id="checkout-address"${collecting ? ' hidden disabled' : ''}>
              <legend>Delivery address</legend>
              ${field('address', 'Street address', 'required maxlength="160"')}
              <div class="two-fields">
                ${field('town', 'Town or city', 'required maxlength="80"')}
                ${field('postcode', 'UK postcode', 'required maxlength="8" autocapitalize="characters" pattern="(?:[Gg][Ii][Rr]|[A-Za-z]{1,2}[0-9][0-9A-Za-z]?)[ ]?[0-9][A-Za-z]{2}"')}
              </div>
            </fieldset>
            <fieldset class="checkout-group checkout-collection" id="checkout-collection"${collecting ? '' : ' hidden disabled'}>
              <legend>Collection location</legend>
              <div class="field">
                <label class="sr-only" for="collection-cafe">Choose a café</label>
                <select name="cafe" id="collection-cafe">${cafes.map(cafe => `<option value="${html(cafe.id)}">${html(cafe.name)}</option>`).join('')}</select>
              </div>
              <p id="collection-address" class="checkout-note"></p>
            </fieldset>
            <fieldset class="checkout-group">
              <legend>Contact details</legend>
              ${field('name', 'Full name', 'required maxlength="120"')}
              ${field('email', 'Email address', String.raw`type="email" required maxlength="254" autocapitalize="none" pattern="[^\s@]+@[^\s@]+\.[^\s@]+"`)}
              ${field('phone', 'Phone number (optional)', 'type="tel" maxlength="32" inputmode="tel"')}
            </fieldset>
          </div>
          ${summary(lines, pricing, method, true)}
        </div>
      </form>
    </div>
  </div>`;
}

export function checkoutReview({ details, cafe, method, lines, pricing }) {
  const address = cafe ? [cafe.name, cafe.address] : [details.address, details.town, details.postcode];
  return `<div class="checkout-shell">
    ${stepProgress('review')}
    <div class="checkout-stage">
      <div class="checkout-step-intro">
        <h3 class="checkout-heading" tabindex="-1" data-panel-focus>Review your order</h3>
        <p>Check your details before placing the demo order.</p>
      </div>
      <div class="checkout-review-layout">
        <div class="checkout-fields">
          <section class="checkout-review-card">
            <h4>${cafe ? 'Collection' : 'UK delivery'}</h4>
            <address>${address.map(html).join('<br>')}</address>
          </section>
          <section class="checkout-review-card">
            <h4>Contact details</h4>
            <p>${html(details.name)}<br>${html(details.email)}${details.phone ? `<br>${html(details.phone)}` : ''}</p>
          </section>
        </div>
        ${summary(lines, pricing, method)}
      </div>
      <p class="form-error" id="checkout-error" role="alert" hidden>Your order couldn’t be placed. Check your details and try again.</p>
    </div>
  </div>`;
}

export function checkoutDock(pricing, review = false) {
  const back = review ? 'data-checkout-edit' : 'data-open-bag';
  const action = review ? 'type="button" data-place-order' : 'type="submit" form="checkout-form"';
  return `<div class="checkout-dock">
    <button type="button" class="text-button checkout-back" ${back}>${review ? 'Edit details' : 'Back to cart'}</button>
    <div class="checkout-dock-action">
      <span class="checkout-dock-total"><small>Total</small><strong data-checkout-total aria-live="polite">${money(pricing.total)}</strong></span>
      <button class="button" ${action}>${review ? 'Place demo order' : 'Review order'}</button>
    </div>
  </div>`;
}

export function processingMarkup(sending = false) {
  return `<div class="checkout-processing">
    ${tampingMarkup()}
    <h3 class="checkout-heading" tabindex="-1" data-panel-focus>${sending ? 'Placing your demo order' : 'Preparing your receipt'}</h3>
    <p>${sending ? 'Saving this order to your account.' : 'Your demo order has been placed.'}</p>
  </div>`;
}

export function receiptMarkup(order) {
  const { reference, method, lines, pricing, cafe } = order;
  return `<div class="checkout-receipt">
    <div class="checkout-receipt-hero">
      <div class="receipt-mark" aria-hidden="true">✓</div>
      <h3 class="checkout-heading" tabindex="-1" data-panel-focus>Demo order complete.</h3>
      <p>This preview won’t charge you or send an order.</p>
      <p class="checkout-receipt-reference"><span>Reference</span><strong>${html(reference)}</strong></p>
    </div>
    <div class="checkout-receipt-meta">
      <section class="checkout-receipt-items">
        <h4>Your coffee</h4>${lineItems(lines)}
      </section>
      <section class="checkout-receipt-total">
        <h4>${cafe ? 'Collection' : 'UK delivery'}</h4>
        <p>${cafe ? `${html(cafe.name)}<br>${html(cafe.address)}` : 'Royal Mail Tracked 48'}</p>
        ${orderTotals(pricing, method)}
      </section>
    </div>
  </div>`;
}
