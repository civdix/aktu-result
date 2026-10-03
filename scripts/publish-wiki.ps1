# PowerShell script to clone and push the Wiki files directly to GitHub Wiki
param(
    [string]$PatToken = ""
)

$RepoOwner = "civdix"
$RepoName = "aktu-result"
$WikiDir = Join-Path $PSScriptRoot "..\docs\wiki"
$TempDir = Join-Path $env:TEMP "aktu-result-wiki"

Write-Host "=== Publishing AKTU Result Wiki to GitHub ===" -ForegroundColor Cyan

if (Test-Path $TempDir) {
    Remove-Item -Path $TempDir -Recurse -Force
}

$AuthPart = if ($PatToken) { "$PatToken@" } else { "" }
$WikiUrl = "https://${AuthPart}github.com/$RepoOwner/$RepoName.wiki.git"

Write-Host "Cloning wiki repository from $RepoUrl..." -ForegroundColor Yellow
try {
    git clone $WikiUrl $TempDir
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Notice: If this is the first time, go to https://github.com/$RepoOwner/$RepoName/wiki in your browser and click 'Create the first page' once to initialize the wiki repository." -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "Failed to clone wiki. Ensure the wiki is initialized on GitHub." -ForegroundColor Red
    exit 1
}

Write-Host "Copying markdown documentation from docs/wiki to wiki repo..." -ForegroundColor Green
Copy-Item -Path "$WikiDir\*" -Destination $TempDir -Force

Push-Location $TempDir
try {
    git add .
    git commit -m "docs: publish complete AKTU portal wiki documentation"
    git push origin master
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✨ Wiki successfully published to https://github.com/$RepoOwner/$RepoName/wiki!" -ForegroundColor Green
    }
} finally {
    Pop-Location
    Remove-Item -Path $TempDir -Recurse -Force
}
