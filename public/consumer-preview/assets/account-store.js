const PROFILE_KEY = 'strangers-coffee-retail-demo.profile.v1';
export const ORDERS_KEY = 'strangers-coffee-retail-demo.orders.v1';
const MAX_ORDERS = 30;
const BAG_SIZES = new Set(['250g', '500g', '1kg']);

export function loadAccount(storage = browserStorage()) {
  return {
    profile: normaliseProfile(read(storage, PROFILE_KEY)),
    orders: readOrders(storage),
  };
}

export function saveAccountProfile(profile, storage = browserStorage()) {
  return write(storage, PROFILE_KEY, normaliseProfile(profile));
}

export function recordDemoOrder(order, storage = browserStorage()) {
  const entry = normaliseOrder(order, order?.createdAt ?? new Date().toISOString());
  if (!entry) return false;

  const orders = readOrders(storage);
  if (orders.some(previous => previous.reference === entry.reference)) return true;

  return write(storage, ORDERS_KEY, [entry, ...orders].sort(newestFirst).slice(0, MAX_ORDERS));
}

function browserStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function read(storage, key) {
  try {
    return JSON.parse(storage?.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

function write(storage, key, value) {
  try {
    if (!storage) return false;
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function shortText(value, length) {
  return typeof value === 'string' ? value.trim().slice(0, length) : '';
}

function isSlug(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,99}$/.test(value);
}

function normaliseProfile(profile) {
  return {
    name: shortText(profile?.name, 120),
    email: shortText(profile?.email, 254),
    phone: shortText(profile?.phone, 32),
    address: shortText(profile?.address, 160),
    town: shortText(profile?.town, 80),
    postcode: shortText(profile?.postcode, 8),
    method: profile?.method === 'collection' ? 'collection' : 'delivery',
    cafe: isSlug(profile?.cafe) ? profile.cafe : 'dove-street',
  };
}

function readOrders(storage) {
  const saved = read(storage, ORDERS_KEY);
  if (!Array.isArray(saved)) return [];

  const unique = new Map();
  for (const candidate of saved) {
    const order = normaliseOrder(candidate, candidate?.createdAt);
    if (order && !unique.has(order.reference)) unique.set(order.reference, order);
  }
  return [...unique.values()].sort(newestFirst).slice(0, MAX_ORDERS);
}

function newestFirst(first, second) {
  return second.createdAt.localeCompare(first.createdAt);
}

function normaliseOrder(order, createdAt) {
  if (!order || typeof order.reference !== 'string' || !/^SC-[A-F0-9]{8}$/.test(order.reference)) return null;
  if (typeof createdAt !== 'string') return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.valueOf()) || !['delivery', 'collection'].includes(order.method)) return null;
  if (!Array.isArray(order.lines) || !order.lines.length) return null;

  const lines = order.lines.map(normaliseLine);
  if (lines.some(line => !line)) return null;

  const { subtotal, shipping, total } = order.pricing ?? {};
  if (![subtotal, shipping, total].every(isMoney) || subtotal + shipping !== total) return null;
  if (lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0) !== subtotal) return null;

  const cafe = order.method === 'collection' ? normaliseCafe(order.cafe) : null;
  if (order.method === 'collection' && (!cafe || shipping !== 0)) return null;

  return {
    reference: order.reference,
    createdAt: date.toISOString(),
    method: order.method,
    cafe,
    pricing: { subtotal, shipping, total },
    lines,
  };
}

function isMoney(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function normaliseLine(line) {
  if (!line || !isSlug(line.id) || !BAG_SIZES.has(line.size) || !isMoney(line.unitPrice)) return null;
  if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > 99) return null;

  const grind = shortText(line.grind, 80);
  const name = shortText(line.product?.name, 180);
  const image = orderImagePath(line.product?.image);
  if (!grind || !name || !image) return null;

  return { id: line.id, size: line.size, grind, qty: line.qty, unitPrice: line.unitPrice, product: { id: line.id, name, image } };
}

function normaliseCafe(cafe) {
  if (!isSlug(cafe?.id)) return null;
  const name = shortText(cafe.name, 120);
  const address = shortText(cafe.address, 180);
  return name && address ? { id: cafe.id, name, address } : null;
}

export function orderImagePath(value) {
  const filename = typeof value === 'string' && value.match(/^\/(?:consumer-preview\/)?assets\/([a-z0-9][a-z0-9._-]*\.(?:webp|png|jpe?g|svg|avif))$/);
  return filename ? '/consumer-preview/assets/' + filename[1] : '';
}
