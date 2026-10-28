$ErrorActionPreference = 'Stop'
try {
    $destination = Join-Path $env:LOCALAPPDATA 'MyHomeFolders'
    $protocol = 'HKCU:\Software\Classes\myhome-folder'
    $commandPath = $protocol + '\shell\open\command'
    $expectedCommands = @(
        ('"' + (Join-Path $destination 'MyHomeFolders-v3.exe') + '" "%1"'),
        ('"' + (Join-Path $destination 'MyHomeFolders-v2.exe') + '" "%1"'),
        ('"' + (Join-Path $destination 'MyHomeFolders.exe') + '" "%1"')
    )
    if (Test-Path -LiteralPath $protocol) {
        if (-not (Test-Path -LiteralPath $commandPath) -or
            $expectedCommands -notcontains (Get-Item -LiteralPath $commandPath).GetValue('')) {
            throw 'This protocol is not owned by this helper. Nothing was removed.'
        }
        Remove-Item -LiteralPath $protocol -Recurse -Force
    }
    # Delete only known helper files, never any course directory.
    foreach ($name in @('MyHomeFolders-v3.exe', 'MyHomeFolders-v2.exe', 'MyHomeFolders.exe', 'folders.json', 'folders.json.bak', 'install-error.txt', 'last-launch-error.txt')) {
        $file = Join-Path $destination $name
        if (Test-Path -LiteralPath $file -PathType Leaf) { Remove-Item -LiteralPath $file -Force }
    }
    if ((Test-Path -LiteralPath $destination) -and @(Get-ChildItem -LiteralPath $destination -Force).Count -eq 0) {
        Remove-Item -LiteralPath $destination -Force
    }
    Write-Host 'Removed. Course folders and website configuration were not changed.'
} catch {
    Write-Host ('UNINSTALL FAILED: ' + $_.Exception.Message)
    exit 1
}
