# Integrations

## Readwise Reader

Open `/reader-setup.html` on your My Home site and sign in. Follow the Token link, sign in to Readwise, copy your token, and save it in the protected My Home form.

Return to the reading module and refresh the list. An unconfigured connection shows a disconnected state. If the token is rejected, check that it was copied completely and remains valid. Failed requests preserve the last cached list.

For webhook updates:

1. Add an endpoint in the Readwise Webhooks settings using the `/api/reader/webhook` URL shown on the My Home connection page.
2. Run Test Endpoint, create the notification, and save its verification secret in My Home.
3. Subscribe to the supported created, moved-to-Inbox, archived, moved-to-Later, shortlisted, finished, and tags-updated events.
4. Save or move a test article and confirm the list updates.

Update the webhook URL after changing domains.

## Obsidian

Copy an Obsidian URL for a note and paste the `obsidian://open?...` address into an entry. The device needs Obsidian, the referenced vault, and the note. Approve the browser's external-application prompt when you want to open it.

For the macOS course batch action, configure a GPT website and an Obsidian note in the course entries.

## Windows folders

1. Download the Windows folder helper from My Home Settings and extract the entire ZIP.
2. Run `install.cmd`. After a successful installation, refresh My Home. The helper registers the current user's `myhome-folder` protocol.
3. Enter an existing Windows folder path, such as `C:\Courses\Example`, in the course entry.
4. Open the entry and approve the browser's external-application prompt. The selected folder should open in File Explorer.
5. If it fails, check the directory, cloud-file availability, browser permission, and the [helper troubleshooting guide](../windows-folders/README.md).

Run `uninstall.cmd` to remove the helper. Install it separately on each computer.

## macOS folders

1. Open the macOS folder instructions in My Home Settings and copy the supplied script.
2. In the Shortcuts app, create a shortcut named exactly `My Home 打开资料`.
3. Add Run Shell Script, choose `/bin/bash`, use Shortcut Input, and pass input as arguments. Paste the script without interpolating the path into it.
4. Enable script execution in Shortcuts settings if prompted.
5. Enter an existing absolute Finder folder path in My Home, open the entry, and approve the shortcut and folder access prompts. Finder should open the directory.
6. If it fails, check the shortcut name, argument handling, browser permission, path, and local cloud-file availability.
