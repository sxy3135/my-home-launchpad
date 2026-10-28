# All installer strings are ASCII to avoid encoding and smart-quote errors.
$ErrorActionPreference = 'Stop'
$destination = Join-Path $env:LOCALAPPDATA 'MyHomeFolders'
$stagedExe = $null
try {
    $compilers = @(
        (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
        (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
    )
    $compiler = $compilers | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $compiler) { throw 'Windows .NET Framework compiler is unavailable. Installation did not change the protocol.' }
    $source = Join-Path $PSScriptRoot 'launcher.cs'
    if (-not (Test-Path -LiteralPath $source)) { throw 'Fully extract the ZIP before running install.cmd.' }
    [void](New-Item -ItemType Directory -Force -Path $destination)
    $exe = Join-Path $destination 'MyHomeFolders-v3.exe'
    $stagedExe = Join-Path $destination ([Guid]::NewGuid().ToString('N') + '.exe')
    & $compiler /nologo /target:winexe /utf8output /reference:System.Windows.Forms.dll ('/out:' + $stagedExe) $source
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $stagedExe)) { throw 'Launcher compilation failed. Installation did not change the protocol.' }
    $check = Start-Process -FilePath $stagedExe -ArgumentList '--self-test' -Wait -PassThru
    if ($check.ExitCode -ne 0) { throw 'The launcher self-test failed. Installation did not change the protocol.' }
    Move-Item -LiteralPath $stagedExe -Destination $exe -Force
    $stagedExe = $null
    $protocol = 'HKCU:\Software\Classes\myhome-folder'
    $commandPath = $protocol + '\shell\open\command'
    $expectedCommand = '"' + $exe + '" "%1"'
    [void](New-Item -Path $commandPath -Force)
    Set-Item -Path $protocol -Value 'URL:My Home local folders'
    [void](New-ItemProperty -Path $protocol -Name 'URL Protocol' -Value '' -PropertyType String -Force)
    Set-Item -Path $commandPath -Value $expectedCommand
    if ((Get-Item -LiteralPath $commandPath).GetValue('') -ne $expectedCommand -or
        $null -eq (Get-Item -LiteralPath $protocol).GetValue('URL Protocol')) { throw 'Protocol registration verification failed.' }
    Start-Process -FilePath $exe -ArgumentList '--installed' -Wait
    Write-Host 'Installed successfully. No administrator access or background service is needed.'
} catch {
    $errorText = $_.Exception.Message
    Write-Host ('INSTALLATION FAILED: ' + $errorText)
    if (Test-Path -LiteralPath $destination) {
        $errorText | Set-Content -LiteralPath (Join-Path $destination 'install-error.txt') -Encoding UTF8
    }
    exit 1
} finally {
    if ($stagedExe -and (Test-Path -LiteralPath $stagedExe)) { Remove-Item -LiteralPath $stagedExe -Force -ErrorAction SilentlyContinue }
}
