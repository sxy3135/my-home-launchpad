import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const assets = {};
const aliases = {}, contents = new Map;
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.zip': 'application/zip'
};
const assetNames = /^(index\.html|fast\.html|app-shell\.[a-f0-9]+\.html|sw\.js|device\.js|i18n\.js|style\.css|theme\.js|clock\.js|launchpad\.[a-f0-9]+\.js|third-party-licenses\.txt|my-home-windows-folders\.zip)$/;
for (const filename of await readdir(dist)) {
  if (!assetNames.test(filename)) continue;
  const bytes = await readFile(resolve(dist, filename));
  const extension = filename.slice(filename.lastIndexOf('.'));
  const hash = createHash('sha256').update(bytes).digest('hex');
  const path = '/' + filename, type = mime[extension] || 'application/octet-stream';
  const cache = /^launchpad\./.test(filename) ? 'private, max-age=31536000, immutable' : 'private, no-store';
  const identity = type + ':' + cache + ':' + hash;
  // Compatibility URLs share the same asset object and encoded content.
  if (contents.has(identity)) {
    aliases[path] = contents.get(identity);
    continue;
  }
  contents.set(identity, path);
  assets[path] = {
    type,
    cache,
    etag: '"' + hash + '"', version: hash.slice(0, 12), data: bytes.toString('base64')
  };
}

// Source modules keep single-line imports. Strip only their module declarations, not arbitrary text.
const moduleBody = source => source
  .replace(/^import[^\n]+\n/gm, '')
  .replace(/^export\s+(?=(?:async\s+)?(?:class|function|const|let)\b)/gm, '');
const [shared, messages, auth, reader, entry] = await Promise.all([
  readFile(resolve(root, 'src/shared/i18n.mjs'), 'utf8'),
  readFile(resolve(root, 'src/shared/messages.json'), 'utf8'),
  readFile(resolve(root, 'worker/auth.mjs'), 'utf8'),
  readFile(resolve(root, 'worker/reader.mjs'), 'utf8'),
  readFile(resolve(root, 'worker/index.mjs'), 'utf8')
]);
const bundle = 'const englishMessages = '+JSON.stringify(JSON.parse(messages))+';\n'+moduleBody(shared)+'\n'+moduleBody(auth).replaceAll('__HOME_DEVICE_VERSION__', assets['/device.js'].version).replaceAll('__HOME_I18N_VERSION__', assets['/i18n.js'].version) + '\n' +
  moduleBody(reader) + '\n' +
  moduleBody(entry).replace('const ASSETS = __MY_HOME_ASSETS__;',
    'const ASSETS = ' + JSON.stringify(assets) + ';\n' +
    Object.entries(aliases).map(([path, target]) => `ASSETS[${JSON.stringify(path)}] = ASSETS[${JSON.stringify(target)}];`).join('\n'));

await mkdir(resolve(dist, 'server'), { recursive: true });
await writeFile(resolve(dist, 'server/index.js'), bundle);
const parsed = await import('data:text/javascript;base64,' + Buffer.from(bundle).toString('base64'));
if (typeof parsed.default?.fetch !== 'function') throw Error('Worker fetch missing');
console.log(JSON.stringify({ workerBytes: Buffer.byteLength(bundle), assets: [...Object.keys(assets), ...Object.keys(aliases)], sha256: createHash('sha256').update(bundle).digest('hex') }));
