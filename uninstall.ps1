# Sidekick Uninstall for Windows
# Run in PowerShell: .\uninstall.ps1

$TaskName = "SidekickServer"

Write-Host "=== Sidekick Uninstall ===" -ForegroundColor Cyan

# Stop and remove the scheduled task
try {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed scheduled task: $TaskName" -ForegroundColor Green
} catch {
    Write-Host "Task '$TaskName' not found or already removed."
}

Write-Host "Done. You can also remove the extension from chrome://extensions/"
