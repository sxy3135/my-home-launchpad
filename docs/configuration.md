# Configuration

## Page settings

Open the gear icon at the bottom of the page.

| Setting | Menu |
| --- | --- |
| Add courses and links | Settings → Organize → module … menu |
| Manage semesters | Settings → Manage semesters |
| Rename, resize, or reorder modules | Settings → Organize |
| Choose automatic or fixed colors | Settings → Appearance |
| Export or import content | Settings → Export configuration / Import configuration |
| Connect Reader | Settings → Connect Reader |
| Install folder helpers | Settings → Windows folder helper / Mac folder setup |

Page settings save automatically in the current browser. Search preferences are saved when you select a search engine.

## Configuration files

| File | Purpose | Create it with |
| --- | --- | --- |
| `.dev.vars` | Local authentication keys | `npm run secrets:local` |
| `wrangler.jsonc` | Local Worker and D1 settings | Included in the project |
| `wrangler.deploy.json` | Your Cloudflare account, Worker, and D1 | `npm run configure:deploy` |
| `examples/demo-config.json` | Sample page content | Import through App Settings |

`.dev.vars` and `wrangler.deploy.json` are ignored by Git. Keep local and deployed keys separate.

## Required secrets

| Name | Purpose | Local value | Deployed value |
| --- | --- | --- | --- |
| `HOME_SECURITY_KEY` | Password hashing, session signatures, and Reader credential encryption | Generated in `.dev.vars` | Set in Cloudflare Secrets |
| `HOME_RECOVERY_KEY` | Initial password setup and password resets | Generated in `.dev.vars` | Set in Cloudflare Secrets |

Each value must encode 32 random bytes as base64url. `npm run secrets:local` generates both local values and preserves an existing file. For deployment, follow [Set secrets](deployment.md#4-set-secrets).

## Import and export

Use Settings → Export configuration to download your courses, links, modules, and folder paths. Use Import configuration to load a JSON file. Import replaces the current page configuration.

Start with [demo-config.json](../examples/demo-config.json) when writing a configuration file. A website entry uses these fields:

```json
{
  "id": "course-website",
  "name": "Course website",
  "url": "https://example.com/course",
  "icon": "school",
  "description": "Course materials"
}
```

IDs must be unique throughout the configuration. The complete file also contains semesters, courses, modules, and a format version; see the example for its structure.

Appearance and search preferences are stored separately from configuration exports. Database backup and password recovery are covered in [operations](operations.md).

## Optional integrations

- [Reader](integrations.md#readwise-reader) — connect your account and configure webhooks.
- [Obsidian](integrations.md#obsidian) — open a note from its Obsidian URL.
- [Windows folders](integrations.md#windows-folders) — install the protocol helper.
- [macOS folders](integrations.md#macos-folders) — create the folder-opening Shortcut.
