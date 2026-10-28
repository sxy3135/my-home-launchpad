import assert from 'node:assert/strict';
import {readFile, readdir, access} from 'node:fs/promises';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = name => readFile(resolve(root, name), 'utf8');
const pkg = JSON.parse(await read('package.json'));
const lock = JSON.parse(await read('package-lock.json'));
assert.equal(lock.version, pkg.version);
assert.deepEqual(lock.packages[''].devDependencies, pkg.devDependencies);
const worker = await read('dist/server/index.js');
const assets = [
  ...Object.keys(JSON.parse(worker.match(/const ASSETS = (\{[^\n]+\});/)[1])),
  ...[...worker.matchAll(/^ASSETS\[("[^"]+")\] = ASSETS\[/gm)].map(match => JSON.parse(match[1]))
];
for (const path of ['/my-home-windows-folders.zip', '/third-party-licenses.txt', '/style.css', '/device.js', '/sw.js']) assert(assets.includes(path), 'Missing release asset: '+path);
const zip = await readFile(resolve(root,'dist/my-home-windows-folders.zip'));
assert.equal(zip.subarray(0, 2).toString(), 'PK');
const outputName = /^(index\.html|fast\.html|app-shell\.[a-f0-9]+\.html|sw\.js|device\.js|style\.css|theme\.js|clock\.js|launchpad\.[a-f0-9]+\.js|third-party-licenses\.txt|my-home-windows-folders\.zip|server)$/;
for (const name of await readdir(resolve(root,'dist'))) assert(outputName.test(name), 'Unexpected build output: '+name);
assert(!/__MY_HOME_[A-Z_]+__|__HOME_DEVICE_VERSION__/.test(worker), 'Unresolved Worker build placeholder');
for (const name of ['README.md','LICENSE','docs/deployment.md','docs/operations.md','docs/development.md','docs/configuration.md','examples/demo-config.json']) await access(resolve(root,name));
console.log('Release checks passed: core assets, Windows helper, output names, lockfile, and documentation.');
