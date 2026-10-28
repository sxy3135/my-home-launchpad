import { readFile, writeFile, readdir, unlink, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { minify } from 'terser';
import {annotateMarkup} from '../src/shared/i18n.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frontend = resolve(root, 'src/frontend');
const dist = resolve(root, 'dist');
const options = { compress: { passes: 1 }, mangle: true, format: { comments: false } };
const sha = text => createHash('sha256').update(text).digest('hex');
const hash = text => sha(text).slice(0, 12);
const readFrontend = name => readFile(resolve(frontend, name), 'utf8');
const inline = text => text.replace(/<\/script/gi, '<\\/script');
const escapeHtml = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

await mkdir(dist, { recursive: true });
const stripImports=source=>source.replace(/^import[^\n]+\n/gm,'').replace(/^export\s+/gm,'');
const i18nSource='(function(){const englishMessages='+JSON.stringify(JSON.parse(await readFile(resolve(root,'src/shared/messages.json'),'utf8')))+';'+stripImports(await readFile(resolve(root,'src/shared/i18n.mjs'),'utf8'))+'\n'+stripImports(await readFrontend('i18n.js'))+'})();';
const i18n=await minify(i18nSource,options);
if(!i18n.code)throw Error('Empty language bootstrap');
await writeFile(resolve(dist,'i18n.js'),i18n.code+'\n');


// These standalone assets also serve the server-rendered login and Reader settings pages.
for (const name of ['style.css', 'theme.js', 'device.js', 'clock.js']) {
  await copyFile(resolve(frontend, name), resolve(dist, name));
}
await copyFile(resolve(root, 'public/third-party-licenses.txt'), resolve(dist, 'third-party-licenses.txt'));

// Dependency order is explicit. Personal controllers run only after the synchronous device gate.
const inputs = ['icons.js', 'model.js', 'ui.js', 'interactions.js', 'module-layout.js', 'app.js', 'clock.js', 'search.js', 'reader.js', 'appearance.js'];
const combined = (await Promise.all(inputs.map(readFrontend))).join('\n;\n');
const result = await minify('if(window.HomeDevice?.unlocked){\n' + combined + '\n}', options);
if (!result.code) throw Error('Empty production bundle');
const bundle = '/* MY HOME. Licenses: third-party-licenses.txt. */\n' + result.code + '\n';
const filename = 'launchpad.' + hash(bundle) + '.js';
const output = resolve(dist, filename);
await writeFile(output, bundle);
const checked = spawnSync(process.execPath, ['--check', output], { encoding: 'utf8' });
if (checked.status !== 0) throw Error('Bundle syntax check failed: ' + checked.stderr);

// One self-contained program keeps local startup independent of extra font, icon or script requests.
const [css, theme, device, script, source] = await Promise.all([
  readFrontend('style.css'),
  readFrontend('theme.js').then(code => minify(code, options)),
  readFrontend('device.js').then(code => minify(code, options)),
  readFile(resolve(root, 'mac-folders/open-folder.sh'), 'utf8'),
  readFile(resolve(root, 'src/home.html'), 'utf8')
]);
if (!theme.code || !device.code) throw Error('Empty startup bootstrap');
if (!source.includes('<!-- home-head -->') || !source.includes('<!-- home-program -->')) {
  throw Error('Missing home template anchors');
}
const html = annotateMarkup(source)
  .replace('<!-- mac-folder-script -->', () => escapeHtml(script))
  .replace('<!-- home-head -->', () => `<script>${inline(i18n.code+";"+theme.code)}</script>\n  <script>${inline(device.code)}</script>\n  <style>${css}</style>`)
  .replace('<!-- home-program -->', () => `<script data-home-bundle="${filename}">${inline(bundle)}</script>`);
const version = hash(html);
const program = 'app-shell.' + version + '.html';
for (const name of ['index.html', 'fast.html', program]) await writeFile(resolve(dist, name), html);

// Formatting the authored worker must not change its versioned, complete-program caching policy.
const swSource = (await readFile(resolve(root, 'src/service-worker.js'), 'utf8'))
  .replace('__HOME_PROGRAM_VERSION__', JSON.stringify(version))
  .replace('__HOME_PROGRAM_URL__', JSON.stringify('/' + program))
  .replace('__HOME_PROGRAM_DIGEST__', JSON.stringify(sha(html)));
const sw = await minify(swSource, { compress: false, mangle: false, format: { comments: false } });
if (!sw.code) throw Error('Empty service worker');
await writeFile(resolve(dist, 'sw.js'), sw.code + '\n');

// Remove superseded hashed frontend assets.
for (const name of await readdir(dist)) {
  if ((/^launchpad\.[a-f0-9]+\.js$/.test(name) && name !== filename) ||
      (/^app-shell\.[a-f0-9]+\.html$/.test(name) && name !== program)) {
    await unlink(resolve(dist, name));
  }
}
console.log(JSON.stringify({ script: filename, scriptBytes: Buffer.byteLength(bundle), program, programBytes: Buffer.byteLength(html), initialProgramRequests: 1, precacheFiles: 1 }));
await (await import('./package-windows-folders.mjs')).packageWindowsFolders(root);
await import('./build-worker.mjs');
