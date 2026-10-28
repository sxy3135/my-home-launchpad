# Development

Run the [quick start](../README.md#quick-start) first.

## Source files

| Change | Files |
| --- | --- |
| Page structure and styling | [home.html](../src/home.html), [style.css](../src/frontend/style.css) |
| Courses, links, editing, and storage | [app.js](../src/frontend/app.js), [model.js](../src/frontend/model.js), [ui.js](../src/frontend/ui.js) |
| Click, keyboard, and drag behavior | [interactions.js](../src/frontend/interactions.js), [module-layout.js](../src/frontend/module-layout.js) |
| Translation catalog and language controls | `src/shared/messages.json`, `src/shared/i18n.mjs`, `src/frontend/i18n.js` |
| Search, colors, and time | [search.js](../src/frontend/search.js), [theme.js](../src/frontend/theme.js), [appearance.js](../src/frontend/appearance.js), [clock.js](../src/frontend/clock.js) |
| Login and device trust | [auth.mjs](../worker/auth.mjs), [device.js](../src/frontend/device.js) |
| Reader | [reader.mjs](../worker/reader.mjs), [reader.js](../src/frontend/reader.js) |
| HTTP routes | [index.mjs](../worker/index.mjs) |
| Offline cache | [service-worker.js](../src/service-worker.js) |
| Database schema and migrations | [schema.ts](../db/schema.ts), `drizzle/` |
| Build and deployment | `scripts/`, `wrangler.jsonc` |
| Folder helpers | `windows-folders/`, `mac-folders/` |

See [architecture](architecture.md) for data flow and authentication.

## Commands

| Command | Purpose |
| --- | --- |
| `npm start` | Prepare local keys and D1, build, and start the Worker |
| `npm run setup` | Prepare local development without starting the server |
| `npm run setup:deploy` | Configure and deploy a new Cloudflare instance |
| `npm run dev` | Start the Worker after preparing the environment |
| `npm run build` | Generate frontend assets, the Windows helper ZIP, and the Worker |
| `npm test` | Run core tests |
| `npm run test:worker` | Run workerd/D1 tests using a temporary local database |
| `npm run check:release` | Check generated assets, filenames, metadata, and required docs |
| `npm run deploy:check` | Build a deployment package without uploading it |
| `npm run db:migrate:local` | Apply migrations to local D1 |

Rebuild after source changes and refresh the browser. The build does not watch files.

Tests in `tests/` cover the UI and backend. Shared fixtures are in `tests/fixtures/`; runtime tests are in `tests/integration/`. Bash fixtures require macOS/Linux or WSL. Runtime tests need permission to listen on localhost.

## File names

Use lowercase kebab-case for source files and directories. Keep standard entry points (`README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `LICENSE`) and tool-defined names (`package-lock.json`, `wrangler.jsonc`, `drizzle.config.ts`, migration files).

Name tests `*.test.cjs` or `*.test.mjs`. Update imports, build inputs, and documentation links when renaming files.

## Build output

`dist/` contains generated HTML, JavaScript, styles, license notices, and `my-home-windows-folders.zip`. Edit the source and regenerate it with `npm run build`.

The Windows ZIP contains `install.cmd`, `install.ps1`, `launcher.cs`, `README.md`, `uninstall.cmd`, and `uninstall.ps1`. The build uses Node.js and its standard library. Installer scripts use ASCII; the packaged C# source uses UTF-8 with a BOM.

## Checks

For documentation changes, check facts and links. For source changes, rebuild and run the affected tests. CI runs installation, build, core tests, runtime tests, and release checks on Linux.

## Translations

Add English equivalents for authored Chinese messages in `src/shared/messages.json`. Runtime labels use `HomeI18n.t`; static HTML is marked during the build. Language controls update marked text and UI controllers. User content is rendered separately.

The language preference uses `myhome.language.v1` in localStorage and a same-named cookie for server pages. It contains only the selected language.
