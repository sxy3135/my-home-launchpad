# My Home

A self-hosted start page for courses, bookmarks, notes, and local folders.

[Quick start](#quick-start) · [Configuration](docs/configuration.md) · [Deployment](docs/deployment.md) · [Development](docs/development.md)

Built with vanilla JavaScript, Cloudflare Workers, and D1. Each deployment serves one user. The app interface is in Simplified Chinese.

## Features

- Organize courses, semesters, bookmarks, and resizable modules.
- Search Google, Bing, Baidu, or Readwise Reader.
- Open Obsidian notes and Windows/macOS folders.
- Show the latest three Reader Inbox articles.
- Use password login, configuration import/export, and offline access on trusted devices.

## Quick start

Install **Node.js 24 with npm** and **Python 3**, then run these commands from the project directory:

```sh
npm ci
npm run build
npm run secrets:local
npm run db:migrate:local
npm run dev
```

Open **http://localhost:8787** and finish the password setup:

1. Open `.dev.vars` in your editor and copy `HOME_RECOVERY_KEY`.
2. Enter the recovery key and your new password in the setup form.
3. Open Settings using the gear icon and select Organize to add courses and links.

To try sample content, import [demo-config.json](examples/demo-config.json) from Settings → Import configuration. Export existing content before importing.

Rebuild after source changes, then refresh the browser. Stop the server with Ctrl+C.

## Configuration

| Configure | Where | Setup |
| --- | --- | --- |
| Courses, links, layout, and colors | App Settings | [Page settings](docs/configuration.md#page-settings) |
| Local login keys | `.dev.vars` | `npm run secrets:local` |
| Worker and D1 | `wrangler.deploy.json` | [Deployment guide](docs/deployment.md) |
| Deployment login keys | Cloudflare Secrets | [Set secrets](docs/deployment.md#4-set-secrets) |
| Reader, Obsidian, and folder helpers | App Settings | [Integrations](docs/integrations.md) |

Courses and links are saved in each browser. Export your configuration before switching browsers or domains. [Backup instructions](docs/operations.md#backups).

## Documentation

- [Configuration](docs/configuration.md) — settings, files, and required values.
- [Deployment](docs/deployment.md) — publish to your Cloudflare account.
- [Development](docs/development.md) — source files, commands, and naming.
- [Architecture](docs/architecture.md) — frontend, API, database, and offline behavior.
- [Contributing](CONTRIBUTING.md) — submit changes and report issues.

## License

[MIT](LICENSE). [Third-party licenses](public/third-party-licenses.txt).
