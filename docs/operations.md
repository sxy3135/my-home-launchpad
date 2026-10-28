# Operations

## Backups

| Data | Location | Backup |
| --- | --- | --- |
| Courses, links, modules, and folder paths | Browser localStorage | Settings → Export configuration |
| Appearance and search preferences | Browser localStorage | Reapply when changing browsers |
| Password hash, encrypted Reader credentials, and article state | D1 | Export the database |
| Application secrets | Cloudflare Secrets | Save in your password manager |

Configuration exports contain URLs, vault names, and local paths. Store them privately.

To export D1, replace the database name and timestamp:

```sh
mkdir -p private-backups
npm run cf -- d1 export YOUR_D1_NAME --remote --config wrangler.deploy.json --output private-backups/home-YYYYMMDD-HHMMSS.sql
```

Verify the D1 name and UUID in `wrangler.deploy.json` before running the command. Restrict access to the backup directory. Save `HOME_SECURITY_KEY` with your backup records.

## Passwords

Change your password from Settings → Change password. Enter the current password and the new password.

For a reset, open `/password-reset` and enter `HOME_RECOVERY_KEY`. Previous sessions are rejected when devices reconnect.

If the recovery key is lost, generate a replacement and upload it with the [secret command](deployment.md#4-set-secrets). Preserve `HOME_SECURITY_KEY`; existing password hashes and Reader credentials depend on it.

## Restore D1

1. Create a replacement D1 database. Update its name and UUID in `wrangler.deploy.json`.
2. Import a full SQL backup into the empty database:

   ```sh
   npm run cf -- d1 execute YOUR_NEW_D1 --remote --config wrangler.deploy.json --file private-backups/YOUR_BACKUP.sql
   ```

3. Restore the matching `HOME_SECURITY_KEY` in Cloudflare Secrets.
4. Verify the tables, `d1_migrations`, password login, and Reader connection.
5. Deploy the Worker against the restored database.

A data-only SQL backup requires a matching schema before import. Keep applied migration records to prevent rerunning initial migrations.

## Change domains

Export the browser configuration before the change. Sign in on the new domain, import the JSON, and update the Reader webhook URL.
