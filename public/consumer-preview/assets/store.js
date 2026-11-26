export const SHIPPING = 350;
export const FREE_SHIPPING = 4500;

const CART_KEY = 'strangers-coffee-proposal.cart.v1';
const MAX_QUANTITY = 99;
const LIGHT_SHIPPING = 300;
const BAG_GRAMS = { '250g': 250, '500g': 500, '1kg': 1000 };
const currency = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
});

export function money(amountInPence) {
  return currency.format(amountInPence / 100);
}

export function createStore(products, storage = browserStorage()) {
  const catalogue = new Map(products.map(product => [product.id, product]));
  const lines = new Map();

  function variant(id, size, grind) {
    const product = catalogue.get(id);
    if (!product || !Object.hasOwn(product.prices, size) || !product.grinds.includes(grind)) {
      return null;
    }
    const unitPrice = product.prices[size];
    if (!Number.isSafeInteger(unitPrice) || unitPrice < 0) return null;

    return { id, size, grind, unitPrice, product, key: JSON.stringify([id, size, grind]) };
  }

  function cart() {
    return [...lines.values()].map(line => ({ ...line }));
  }

  function persist() {
    const selectedVariants = cart().map(({ id, size, grind, qty }) => ({ id, size, grind, qty }));
    try {
      storage?.setItem(CART_KEY, JSON.stringify(selectedVariants));
    } catch {
      // The proposal remains functional when browser storage is unavailable.
    }
  }

  function restore() {
    let saved;
    try {
      saved = JSON.parse(storage?.getItem(CART_KEY) ?? '[]');
    } catch {
      return;
    }
    if (!Array.isArray(saved)) return;

    for (const selection of saved) {
      if (!selection || !validQuantity(selection.qty)) continue;
      const line = variant(selection.id, selection.size, selection.grind);
      if (!line) continue;
      const existing = lines.get(line.key)?.qty ?? 0;
      lines.set(line.key, { ...line, qty: Math.min(existing + selection.qty, MAX_QUANTITY) });
    }
  }

  function add(id, size, grind, qty = 1) {
    const line = variant(id, size, grind);
    if (!line || line.product.available === false || !validQuantity(qty)) return false;
    const nextQuantity = (lines.get(line.key)?.qty ?? 0) + qty;
    if (!validQuantity(nextQuantity)) return false;

    lines.set(line.key, { ...line, qty: nextQuantity });
    persist();
    return true;
  }

  function remove(key) {
    if (!lines.delete(key)) return false;
    persist();
    return true;
  }

  function setQty(key, qty) {
    const line = lines.get(key);
    if (!line) return false;
    if (qty === 0) return remove(key);
    if (!validQuantity(qty)) return false;

    line.qty = qty;
    persist();
    return true;
  }

  function clear() {
    lines.clear();
    persist();
  }

  function totals(method = 'delivery') {
    let subtotal = 0;
    let count = 0;
    let grams = 0;
    for (const { qty, unitPrice, size } of lines.values()) {
      subtotal += qty * unitPrice;
      count += qty;
      grams += qty * (BAG_GRAMS[size] ?? 500);
    }

    let shipping = 0;
    if (count && method !== 'collection' && subtotal <= FREE_SHIPPING) {
      shipping = grams < 500 ? LIGHT_SHIPPING : SHIPPING;
    }
    return { subtotal, shipping, total: subtotal + shipping, count };
  }

  function placeOrder({ method, name, email } = {}) {
    if (!['delivery', 'collection'].includes(method)) return null;
    if (typeof name !== 'string' || !name.trim() || typeof email !== 'string') return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return null;
    }
    const { total, count } = totals(method);
    if (!count) return null;

    const order = { reference: orderReference(), total, count, method };
    clear();
    return order;
  }

  restore();
  return { cart, add, setQty, remove, clear, totals, placeOrder };
}

function browserStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function validQuantity(qty) {
  return Number.isInteger(qty) && qty >= 1 && qty <= MAX_QUANTITY;
}

function orderReference() {
  const [id] = globalThis.crypto.getRandomValues(new Uint32Array(1));
  return `SC-${id.toString(16).padStart(8, '0').toUpperCase()}`;
}
