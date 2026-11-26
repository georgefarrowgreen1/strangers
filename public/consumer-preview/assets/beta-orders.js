const ATTEMPT_KEY = 'strangers-coffee-retail-demo.pending-order.v1';
let attempt;

function savedAttempt() {
  try {
    return JSON.parse(sessionStorage.getItem(ATTEMPT_KEY));
  } catch {
    return null;
  }
}

export async function placeAccountOrder(method, cafe, cart) {
  const lines = cart.map(({ id, size, grind, qty }) => ({ id, size, grind, qty }));
  const order = { method, cafe: method === 'collection' ? cafe : null, lines };
  const signature = JSON.stringify(order);
  const previous = attempt ?? savedAttempt();
  if (previous?.signature === signature && typeof previous.key === 'string') {
    attempt = previous;
  } else {
    attempt = { signature, key: crypto.randomUUID() };
    try {
      sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify(attempt));
    } catch {
      // A retry in this page can still use the same key.
    }
  }

  const response = await fetch('/api/account/orders', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ ...order, idempotencyKey: attempt.key }),
  });
  if (response.status === 401) throw new Error('Your session ended. Sign in again to place this order.');
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.message || 'Checkout is temporarily unavailable. Your cart is ready to retry.');
  }
  const { order: receipt } = await response.json();
  if (!receipt?.reference) throw new Error('We couldn’t confirm your order. Your cart is ready to retry.');
  return receipt;
}

export function clearOrderAttempt() {
  attempt = null;
  try {
    sessionStorage.removeItem(ATTEMPT_KEY);
  } catch {
    // This browser has disabled storage.
  }
}
