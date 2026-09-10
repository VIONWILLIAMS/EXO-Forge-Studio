# Windows PowerShell 5.1+ / PowerShell 7. No global installation or admin rights.
$SetupArgs = $args
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$version = (Get-Content "$PSScriptRoot/scripts/node-version.txt" -Raw).Trim()
$node = $null
$npmCli = $null
if ($env:EXO_USE_LOCAL_NODE -ne '1') {
    $existing = Get-Command node -ErrorAction SilentlyContinue
    if ($existing) {
        $existingVersion = & $existing.Source --version
        if ($LASTEXITCODE -eq 0 -and [version]$existingVersion.TrimStart('v') -ge [version]'22.13.0') {
            $candidate = Join-Path (Split-Path $existing.Source) 'node_modules/npm/bin/npm-cli.js'
            if (Test-Path $candidate) {
                & $existing.Source $candidate --version *> $null
                if ($LASTEXITCODE -eq 0) { $node = $existing.Source; $npmCli = $candidate }
            }
        }
    }
}
if (-not $node) {
    $architecture = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
    $arch = switch ($architecture) { 'AMD64' { 'x64' }; 'ARM64' { 'arm64' }; default { throw "Unsupported architecture: $architecture" } }
    $name = "node-v$version-win-$arch"
    $runtime = Join-Path $PSScriptRoot ".local/$name"
    $node = Join-Path $runtime 'node.exe'
    $npmCli = Join-Path $runtime 'node_modules/npm/bin/npm-cli.js'
    $usable = $false
    if ((Test-Path $node) -and (Test-Path $npmCli)) {
        & $node $npmCli --version *> $null
        $usable = $LASTEXITCODE -eq 0
    }
    if (-not $usable) {
        $temp = Join-Path $PSScriptRoot ".local/node-download-$([guid]::NewGuid())"
        New-Item -ItemType Directory -Force $temp | Out-Null
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            $archive = "$name.zip"
            $zip = Join-Path $temp $archive
            Write-Host "Installing project-local Node.js $version..."
            $ProgressPreference = 'SilentlyContinue'
            $downloaded = $false
            for ($attempt = 0; $attempt -lt 3; $attempt++) {
                try {
                    Invoke-WebRequest -UseBasicParsing -TimeoutSec 600 "https://nodejs.org/dist/v$version/$archive" -OutFile $zip
                    $downloaded = $true
                    break
                } catch { if ($attempt -eq 2) { throw }; Start-Sleep -Seconds 2 }
            }
            if (-not $downloaded) { throw 'Node download failed.' }
            $line = Get-Content "$PSScriptRoot/scripts/node-sha256.txt" | Where-Object { ($_ -split '\s+')[-1] -eq $archive }
            $expected = ($line -split '\s+')[0]
            if (-not $expected -or (Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
                throw 'Node archive checksum mismatch; download was not installed.'
            }
            Expand-Archive -LiteralPath $zip -DestinationPath $temp
            if (Test-Path $runtime) { Remove-Item -Recurse -Force $runtime }
            Move-Item (Join-Path $temp $name) $runtime
        } finally { if (Test-Path $temp) { Remove-Item -Recurse -Force $temp } }
    }
}
$env:EXO_NPM_CLI = $npmCli
$env:PATH = "$(Split-Path $node)$([IO.Path]::PathSeparator)$env:PATH"
& $node "$PSScriptRoot/scripts/setup.mjs" @SetupArgs
exit $LASTEXITCODE
