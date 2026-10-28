# Deployment

Requires Node.js 24 with npm and a Cloudflare account.

## First deployment

```sh
npm ci
npm run setup:deploy
```

The setup wizard will:

1. Open Cloudflare login if needed.
2. Ask which account to use when you have more than one.
3. Ask for a new Worker name and confirm the resources to create.
4. Create D1 and save its binding in `wrangler.deploy.json`.
5. Apply migrations, generate two private keys, and publish the Worker.

Choose a name that is not used by an existing Worker. Setup refuses to replace existing Workers.

Open the URL printed by Wrangler. Copy `HOME_RECOVERY_KEY` from `.wrangler/deploy-secrets.json` into the password setup form, then choose a password. The login page includes an English / Simplified Chinese selector.

## Deployment keys

Setup saves generated keys in `.wrangler/deploy-secrets.json` and uploads them as Cloudflare Secrets. This file is ignored by Git. Save the values in your password manager.

| Key | Purpose |
| --- | --- |
| `HOME_SECURITY_KEY` | Password hashing, sessions, and Reader credential encryption |
| `HOME_RECOVERY_KEY` | Initial password setup and resets |

Keep the original `HOME_SECURITY_KEY` with your database backups. Setup retries reuse saved keys.

## Updates

```sh
npm run deploy
```

Deployment builds the app and checks the database identity and required secrets. When an update adds migrations, [back up D1](operations.md#backups) and run `npm run db:migrate:remote` first.

## Manual setup

To use a database you created yourself, copy your Account ID and D1 UUID from Cloudflare:

```sh
npm run cf -- login
npm run cf -- d1 create my-home-db
npm run configure:deploy -- --account YOUR_ACCOUNT_ID --worker my-home --database my-home-db --database-id YOUR_D1_UUID
npm run db:migrate:remote
```

Generate two different keys with this command, run separately for each key:

```sh
node -p "require('node:crypto').randomBytes(32).toString('base64url')"
```

Save them in your password manager and enter them at the CLI prompts:

```sh
npm run cf -- secret put HOME_SECURITY_KEY --config wrangler.deploy.json
npm run cf -- secret put HOME_RECOVERY_KEY --config wrangler.deploy.json
npm run deploy
```

## Troubleshooting

| Problem | Action |
| --- | --- |
| Worker already exists | Choose a new name. Use `npm run deploy` for an instance already configured in this project. |
| Account access cannot be verified | Run `npm run cf -- login` and check your selected account. |
| Setup stopped | Check the reported command. Configuration and keys are preserved for retry. If database creation succeeded but its binding was not saved, complete the manual configuration using that database's UUID. |
| Saved deployment keys exist without configuration | Restore their matching `wrangler.deploy.json` before continuing. |
| Login unavailable | Check the DB binding, migrations, and both secrets. |
| Recovery key rejected | Use `.wrangler/deploy-secrets.json` for deployment or `.dev.vars` for local development. |

When changing domains, export the browser configuration, import it on the new domain, and update the Reader webhook URL.
