# Deployment

Deploy one Worker and one D1 database in your Cloudflare account.

**Requirements:** Node.js 24 with npm, Python 3, and a Cloudflare account.

## 1. Install and log in

```sh
npm ci
npm run build
npm run cf -- login
```

Complete the Cloudflare authorization in your browser. Copy your Account ID from the Cloudflare account overview.

## 2. Create a database

```sh
npm run cf -- d1 create my-home-db
```

Copy the database UUID from the command output.

## 3. Configure the Worker

Replace `YOUR_ACCOUNT_ID` and `YOUR_D1_UUID`:

```sh
npm run configure:deploy -- --account YOUR_ACCOUNT_ID --worker my-home --database my-home-db --database-id YOUR_D1_UUID
npm run db:migrate:remote
```

| Option | Value |
| --- | --- |
| `--account` | Your Cloudflare Account ID |
| `--worker` | Worker name; `my-home` in this guide |
| `--database` | D1 name; `my-home-db` in this guide |
| `--database-id` | UUID returned by `d1 create` |

The configuration command creates `wrangler.deploy.json`. To change an existing target, edit that file. The migration command verifies the database identity before applying SQL migrations.

## 4. Set secrets

Generate a key:

```sh
node -p "require('node:crypto').randomBytes(32).toString('base64url')"
```

Run it twice to create two different values. Save them in your password manager, then paste each value into its CLI prompt:

```sh
npm run cf -- secret put HOME_SECURITY_KEY --config wrangler.deploy.json
npm run cf -- secret put HOME_RECOVERY_KEY --config wrangler.deploy.json
```

If Wrangler offers to create the Worker, confirm the configured name.

| Secret | Used for |
| --- | --- |
| `HOME_SECURITY_KEY` | Password hashing, sessions, and Reader credential encryption |
| `HOME_RECOVERY_KEY` | Initial password setup and resets |

Keep `HOME_SECURITY_KEY` with your database backups; restoring encrypted data requires the same key.

## 5. Publish

```sh
npm run deploy
```

Open the workers.dev URL printed by Wrangler. Enter `HOME_RECOVERY_KEY` in the setup form and choose a password.

Deployment checks the database identity and required secrets before publishing. Apply database migrations separately with `npm run db:migrate:remote`.

## Update

```sh
npm run build
npm run deploy
```

When an update adds migrations, [back up D1](operations.md#backups) and run `npm run db:migrate:remote` before deployment.

When changing domains, export your browser configuration, import it on the new domain, and update the Reader webhook URL.

## Troubleshooting

| Problem | Check |
| --- | --- |
| Python executable not found | Install Python 3. Use `python3` on macOS/Linux or `python` on Windows; `PYTHON` can specify another executable. |
| Remote configuration missing | Run `npm run configure:deploy` with the four options above. |
| Database identity mismatch | Match the D1 name and UUID in `wrangler.deploy.json` to the database you created. |
| Required secrets missing | Upload both secrets with `--config wrangler.deploy.json`. |
| Login unavailable | Check that migrations and secrets are configured for this Worker and D1. |
| Recovery key rejected | Use this deployment's `HOME_RECOVERY_KEY`. |
