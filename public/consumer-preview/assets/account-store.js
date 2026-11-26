export function orderImagePath(value) {
  const filename = typeof value === 'string' && value.match(/^\/(?:consumer-preview\/)?assets\/([a-z0-9][a-z0-9._-]*\.(?:webp|png|jpe?g|svg|avif))$/);
  return filename ? '/consumer-preview/assets/' + filename[1] : '';
}
