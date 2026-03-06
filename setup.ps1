# Sidekick Setup for Windows
# Run in PowerShell: .\setup.ps1

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ServerDir = Join-Path $ScriptDir "terminal-server"
$TaskName = "SidekickServer"

Write-Host "=== Sidekick Setup ===" -ForegroundColor Cyan
Write-Host ""

# 1. Install dependencies
Write-Host "[1/4] Installing dependencies..."
Push-Location $ScriptDir
npm install --silent
Pop-Location
Push-Location $ServerDir
npm install --silent
Pop-Location

# 2. Build extension
Write-Host "[2/4] Building extension..."
Push-Location $ScriptDir
npm run build --silent
Pop-Location

# 3. Install background service (Windows Task Scheduler)
Write-Host "[3/4] Installing background server..."

$NodePath = (Get-Command node).Source
$ServerScript = Join-Path $ServerDir "server.js"

# Remove existing task if present
schtasks /Delete /TN $TaskName /F 2>$null

# Create a scheduled task that runs at logon and restarts on failure
$Action = New-ScheduledTaskAction -Execute $NodePath -Argument "`"$ServerScript`"" -WorkingDirectory $ServerDir
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Sidekick terminal server" -Force | Out-Null

# Start it now
Start-ScheduledTask -TaskName $TaskName
Write-Host "  Server installed as Windows Scheduled Task: $TaskName"

# 4. Done
Write-Host "[4/4] Done!" -ForegroundColor Green
Write-Host ""
Write-Host "=== Next Steps ===" -ForegroundColor Cyan
Write-Host "1. Open chrome://extensions/"
Write-Host "2. Enable Developer mode"
Write-Host "3. Click 'Load unpacked' -> select: $ScriptDir\dist\"
Write-Host "4. Click the extension icon to open the side panel"
Write-Host ""
Write-Host "The server runs automatically in the background."
Write-Host "To uninstall: .\uninstall.ps1"
