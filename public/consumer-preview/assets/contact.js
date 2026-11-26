const form = document.querySelector('#contact-form');
const fields = form.querySelector('fieldset');
const status = document.querySelector('#contact-status');
const order = new URL(location.href).searchParams.get('order');
const orderReference = /^SC-[A-F0-9]{8}$/.test(order ?? '') ? order : null;
if (orderReference) form.elements.subject.value = `Help with order ${orderReference}`;
let attempt;

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (fields.disabled || !form.reportValidity()) return;
  const details = Object.fromEntries([...new FormData(form)].map(([name, value]) => [name, value.trim()]));
  if (orderReference) details.orderReference = orderReference;
  const snapshot = JSON.stringify(details);
  if (attempt?.snapshot !== snapshot) attempt = { snapshot, key: crypto.randomUUID() };
  fields.disabled = true;
  form.setAttribute('aria-busy', 'true');
  status.hidden = false;
  status.textContent = 'Sending your message…';
  try {
    const response = await fetch('/api/retail/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ ...details, idempotencyKey: attempt.key }),
      signal: AbortSignal.timeout(12_000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'We could not send your message. Try again shortly.');
    if (!/^HELP-[A-F0-9]{8}$/.test(result.reference ?? '')) throw new Error();
    form.reset();
    attempt = null;
    status.textContent = `Your message was sent to the retail team. Keep reference ${result.reference}.`;
  } catch (error) {
    status.textContent = error.name === 'Error' && error.message ? error.message :
      'We couldn’t confirm that your message was sent. Try again to check.';
  } finally {
    form.removeAttribute('aria-busy');
    fields.disabled = false;
  }
});
fields.disabled = false;
