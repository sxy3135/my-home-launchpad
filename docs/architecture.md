# Architecture

## Frontend

The application uses native HTML, CSS, and JavaScript. `src/home.html` is a build template. Controllers in `src/frontend/` expose `window.Home*` interfaces.

| Module | Responsibility |
| --- | --- |
| `model.js` | Configuration validation, format conversion, empty defaults, paths, and launch targets |
| `app.js` | Rendering, editing, persistence, undo, import/export, and tab conflict handling |
| `ui.js` | Forms, dialogs, and menus |
| `interactions.js` | Link launching and interaction execution |
| `module-layout.js` | Dragging and module layout |
| `device.js` | Device trust, logout, session checks, and service-worker registration |
| `reader.js` | Reader state and same-origin API requests |
| `search.js`, `theme.js`, `appearance.js`, `clock.js` | Search, color preferences, and time display |

## Languages

The frontend and authentication pages share `src/shared/messages.json`. Language controls update authored UI text. Browser-local language preferences are separate from course configuration. The complete offline page includes the translation code.

## Configuration

The key `my-home-launchpad.config.v1` stores configuration format version 4. Imports accept versions 1–4. Appearance, search, and device trust use separate keys.

Courses, links, modules, and folder paths are browser-local. See [configuration](configuration.md) for settings and export contents.

Invalid configuration retains its raw stored representation for export. Ordinary editing is blocked until valid data is restored. Storage failures and concurrent tab changes must not overwrite existing edits.

## Backend

`worker/index.mjs` serves allowlisted resources and Reader routes. `auth.mjs` manages password setup, recovery, signed cookies, rate limits, and Reader connection settings. `reader.mjs` manages API requests, pagination, webhook updates, cached articles, sync locks, and error state.

D1 stores password hashes, login limits, encrypted Reader credentials, cached articles, and synchronization state. The schema is in `db/schema.ts`; SQL migrations and metadata are in `drizzle/`.

Each deployment has one password and one Reader connection.

## Authentication and offline use

`HOME_SECURITY_KEY` protects password hashes, cookie signatures, and Reader credentials. `HOME_RECOVERY_KEY` independently authorizes initial setup and password resets. Browser writes require a matching Origin; webhooks use a separate shared secret.

The service worker caches app files and checks their SHA-256 digest before installation. Login pages, Reader responses, connection settings, and HTML containing session information are excluded from the cache.

Trusted devices can open local content offline. Devices check session expiry and revocation when they reconnect.

HTTP on localhost and loopback IPs uses a separate local login cookie. HTTPS uses a Secure, HttpOnly cookie with the `__Host-` prefix.

## Build and deployment

`build-static.mjs` generates frontend assets and the Windows helper ZIP. `build-worker.mjs` packages those files into the Worker. Build output is written to `dist/`.

The local Wrangler configuration and ignored remote deployment configuration are separate. Deployment verifies the actual D1 identity and required secrets. Database migrations run as a separate operation. See [deployment](deployment.md) and [operations](operations.md).
