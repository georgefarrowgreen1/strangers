import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const reviewedRevision = '65dd7832948df051a2a03a908d17b63f4b9889e9';
const pages = new Set([
  'index.html',
  ...['about', 'account', 'brewguides', 'coffee', 'contact', 'location', 'privacy-policy', 'shipping', 'terms-conditions']
    .map(page => `${page}/index.html`),
]);
const assetPath = '/consumer-preview/assets/';
const legacyScript = 'assets/legacy-orders.js';
const marker = '.branded-retail-package.json';
const isAsset = path => /^assets\/[a-zA-Z0-9_-][a-zA-Z0-9._-]*\.(css|js|svg|webp|woff2|txt)$/.test(path);
const isPublicFile = path => pages.has(path) || isAsset(path);

const { values } = parseArgs({ options: { dist: { type: 'string' }, revision: { type: 'string' } } });
if (!values.dist || !values.revision || !/^[a-f0-9]{7,40}$/.test(values.revision)) {
  throw new Error('Provide the reviewed checkout using --dist <path to dist> --revision <commit SHA>.');
}

const suppliedDist = resolve(values.dist);
const dist = await realpath(suppliedDist);
const sourceRoot = dirname(dist);
const git = args => execFileSync('git', ['-C', sourceRoot, ...args], { encoding: 'utf8' });

if (dist !== suppliedDist || basename(dist) !== 'dist' || git(['rev-parse', '--show-toplevel']).trim() !== sourceRoot) {
  throw new Error('The source must be the dist directory of the reviewed checkout.');
}
const sourceRevision = git(['rev-parse', '--verify', `${values.revision}^{commit}`]).trim();
if (sourceRevision !== reviewedRevision) {
  throw new Error(`Expected the reviewed retail source at ${reviewedRevision}.`);
}

const tracked = new Map();
for (const record of git(['ls-tree', '-rz', sourceRevision, '--', 'dist/']).split('\0').filter(Boolean)) {
  const [metadata, fullPath] = record.split('\t');
  const path = fullPath.slice('dist/'.length);
  if (!isPublicFile(path)) continue;
  const match = metadata.match(/^100(?:644|755) blob ([a-f0-9]+)$/);
  if (!match) throw new Error(`Expected a regular reviewed file at ${fullPath}.`);
  tracked.set(path, match[1]);
}
for (const path of [...pages, 'assets/app.js', 'assets/products.js', 'assets/style.css']) {
  if (!tracked.has(path)) throw new Error(`The reviewed source is missing dist/${path}.`);
}

const hashAlgorithm = git(['rev-parse', '--show-object-format']).trim();
const files = new Map();
for (const [path, hash] of tracked) {
  const file = join(dist, path);
  if (await realpath(file) !== file || !(await lstat(file)).isFile()) {
    throw new Error(`dist/${path} is not a regular checked-in file.`);
  }
  const buffer = await readFile(file);
  const actualHash = createHash(hashAlgorithm).update(`blob ${buffer.length}\0`).update(buffer).digest('hex');
  if (actualHash !== hash) throw new Error(`dist/${path} differs from the reviewed source.`);

  let output = buffer;
  if (/\.(html|css|js)$/.test(path)) {
    output = rewriteAssetPaths(buffer.toString('utf8'));
    if (pages.has(path)) output = addWholesaleNavigation(output, path);
    if (path === 'assets/products.js') output = attachAvailability(output);
    if (path === 'assets/account-store.js') output = attachOrderImageNormalisation(output);
    if (path === 'assets/account.js' || path === 'assets/checkout.js') output = retargetOrderImages(output);
  }
  files.set(path, output);
}
files.set(legacyScript, `if (location.pathname === '/' && location.hash === '#orders') {
  location.replace('/wholesale/#orders');
}
`);

const publicRoot = fileURLToPath(new URL('../public/', import.meta.url)).replace(/\/$/, '');
if (await realpath(publicRoot) !== publicRoot) throw new Error('The public directory must not be a symlink.');
const target = join(publicRoot, 'consumer-preview');
const hasPrevious = await assertGeneratedOutput(target);
const work = await mkdtemp(join(publicRoot, '.consumer-preview-build-'));
const staged = join(work, 'retail');
const backup = join(work, 'previous');
let keepBackup = false;
try {
  for (const [path, contents] of files) {
    const output = join(staged, path);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, contents);
  }
  await writeFile(join(staged, marker), JSON.stringify({
    sourceRevision,
    files: [...files.keys()].sort(),
  }, null, 2) + '\n');

  if (hasPrevious) await rename(target, backup);
  try {
    await rename(staged, target);
  } catch (error) {
    if (hasPrevious) {
      keepBackup = true;
      await rename(backup, target);
      keepBackup = false;
    }
    throw error;
  }
} finally {
  if (!keepBackup) await rm(work, { recursive: true, force: true });
}

console.log(`Packaged ${pages.size} reviewed retail pages and ${files.size - pages.size} assets at public/consumer-preview (${sourceRevision}).`);

function rewriteAssetPaths(contents) {
  // The reviewed pages use quoted asset URLs. Also support the unquoted CSS url() form.
  return contents.replace(/(["'\x60]|\burl\(\s*)\/assets\//g, (_match, prefix) => prefix + assetPath);
}

function addWholesaleNavigation(html, path) {
  const footerStart = html.indexOf('<footer class="site-footer">');
  const exploreStart = html.indexOf('<nav aria-labelledby="footer-explore">', footerStart);
  const exploreEnd = html.indexOf('</nav>', exploreStart);
  if (footerStart < 0 || exploreStart < 0 || exploreEnd < 0 || exploreEnd >= html.indexOf('</footer>', footerStart)) {
    throw new Error(`Could not find the reviewed footer navigation in ${path}.`);
  }
  const linked = html.slice(0, exploreEnd) + '<a href="/wholesale/">Wholesale</a>' + html.slice(exploreEnd);
  if (path !== 'index.html') return linked;

  const charset = '<meta charset="utf-8">';
  if (!linked.includes(charset)) throw new Error('Could not place the early legacy navigation script.');
  return linked.replace(charset, `${charset}\n<script src="${assetPath}legacy-orders.js"></script>`);
}

function attachAvailability(contents) {
  const generated = contents.match(/^export const products = (\[[\s\S]+?\]);\nexport const cafes = (\[[\s\S]+\]);\s*$/);
  if (!generated) throw new Error('Expected the reviewed catalogue module to contain two JSON arrays.');
  const products = JSON.parse(generated[1]);
  const cafes = JSON.parse(generated[2]);
  const ids = new Set(products.map(product => product?.id));
  if (!products.length || ids.size !== products.length ||
      [...ids].some(id => typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(id))) {
    throw new Error('The reviewed catalogue must have unique normalised product IDs.');
  }

  return `const catalogue = ${JSON.stringify(products, null, 2)};
export const cafes = ${JSON.stringify(cafes, null, 2)};

async function loadUnavailable() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1250);
  try {
    const response = await fetch('/consumer-auth/availability', {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) return new Set();
    const data = await response.json();
    if (!Array.isArray(data?.unavailable)) return new Set();
    return new Set(data.unavailable.filter(id => typeof id === 'string').map(id => id.trim().toLowerCase()));
  } catch {
    return new Set();
  } finally {
    clearTimeout(timer);
  }
}

const unavailable = await loadUnavailable();
export const products = catalogue.map(product =>
  unavailable.has(product.id) ? { ...product, available: false } : product
);
`;
}


function attachOrderImageNormalisation(contents) {
  const reviewed = String.raw`  const image = line.product?.image;
  if (!grind || !name || typeof image !== 'string' || !/^\/assets\/[a-z0-9][a-z0-9._-]*\.(webp|png|jpe?g|svg|avif)$/.test(image)) return null;`;
  const name = `export function orderImagePath(value) {
  const filename = typeof value === 'string' && value.match(${String.raw`/^\/(?:consumer-preview\/)?assets\/([a-z0-9][a-z0-9._-]*\.(?:webp|png|jpe?g|svg|avif))$/`});
  return filename ? '${assetPath}' + filename[1] : '';
}`;
  if (!contents.includes(reviewed)) throw new Error('Could not find the reviewed receipt image validation.');
  return contents.replace(reviewed, `  const image = orderImagePath(line.product?.image);
  if (!grind || !name || !image) return null;`) + '\n' + name + '\n';
}

function retargetOrderImages(contents) {
  const reviewed = 'html(line.product.image)';
  if (!contents.includes(reviewed)) throw new Error('Could not find the reviewed order image markup.');
  return "import { orderImagePath } from './account-store.js';\n" +
    contents.replaceAll(reviewed, `html(orderImagePath(line.product.image) || '${assetPath}mark.svg')`);
}

async function assertGeneratedOutput(directory) {
  const stat = await lstat(directory).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!stat) return false;
  if (!stat.isDirectory()) throw new Error('Refusing to replace an output path that is not a directory.');

  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  if (entries.some(entry => !entry.isFile() && !entry.isDirectory())) {
    throw new Error('Refusing to replace a retail output directory containing a symlink or special file.');
  }

  const entryPath = entry => relative(directory, join(entry.parentPath, entry.name)).split(sep).join('/');
  const existing = entries.filter(entry => entry.isFile()).map(entryPath);
  if (!existing.includes(marker)) throw new Error('Refusing to replace an output directory without a packaging marker.');

  const previous = JSON.parse(await readFile(join(directory, marker), 'utf8'));
  if (!/^[a-f0-9]{40}$/.test(previous?.sourceRevision) || !Array.isArray(previous?.files) ||
      previous.files.some(path => typeof path !== 'string' || !isPublicFile(path))) {
    throw new Error('Refusing to replace an output directory with an invalid packaging marker.');
  }
  const listed = new Set([marker, ...previous.files]);
  const directories = new Set(previous.files.map(dirname));
  if (existing.some(path => !listed.has(path)) || entries.some(entry => entry.isDirectory() && !directories.has(entryPath(entry)))) {
    throw new Error('Refusing to replace an output directory containing entries outside the packaging marker.');
  }
  return true;
}
