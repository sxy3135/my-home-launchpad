# My Home Windows Folder Helper

Open configured local directories from My Home on Windows 10 or 11.

## Install

1. Extract the entire ZIP.
2. Run `install.cmd`.
3. After installation succeeds, refresh My Home.
4. Enter the actual Windows folder path in a course entry, such as `C:\Courses\Example`.
5. Open the entry and approve the browser's external-application prompt.

The helper registers `myhome-folder` for the current Windows user. It needs no administrator access and runs no background service. Paths must point to existing local directories; cloud files must already be available locally.

Each computer needs its own installation and configured paths. Moving a folder only requires updating its path in My Home.

## Troubleshooting

- Installation fails: keep the error message and check `%LOCALAPPDATA%\MyHomeFolders\install-error.txt`.
- Opening fails: check `%LOCALAPPDATA%\MyHomeFolders\last-launch-error.txt`, the configured path, and browser permission.
- The directory is unavailable: verify that it exists, is accessible to your Windows user, and has finished syncing if stored in a cloud folder.
- Managed computers may restrict scripts or custom protocols. The helper does not change those policies.

The launcher validates paths and opens directories only. It does not execute files or commands. The website cannot confirm whether File Explorer opened successfully.

## Uninstall

Run `uninstall.cmd`. It removes the helper's protocol registration and known helper files, without deleting course folders or browser configuration.
