#!/usr/bin/env pwsh
# Deploy blusanta_zoom_stitch.py to video-stitch-blusanta VM
# Usage: .\deploy-to-vm.ps1

param(
    [string]$File = "blusanta_zoom_stitch.py",
    [switch]$Restart
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 Deploying BluSanta Zoom Stitch to VM..." -ForegroundColor Cyan
Write-Host ""

# Configuration
$VM_NAME = "video-stitch-blusanta"
$VM_ZONE = "us-central1-a"
$VM_PATH = "/home/Dipesh_Goel/blusanta_zoom_stitch.py"
$LOCAL_FILE = Join-Path $PSScriptRoot $File

# Check if local file exists
if (-not (Test-Path $LOCAL_FILE)) {
    Write-Host "❌ Error: File not found: $LOCAL_FILE" -ForegroundColor Red
    exit 1
}

Write-Host "📁 Local file: $LOCAL_FILE" -ForegroundColor Yellow
Write-Host "📤 Uploading to: $VM_NAME`:$VM_PATH" -ForegroundColor Yellow
Write-Host ""

# Create backup on VM
Write-Host "📦 Creating backup on VM..." -ForegroundColor Cyan
gcloud compute ssh $VM_NAME --zone=$VM_ZONE --command="cp $VM_PATH ${VM_PATH}.backup.$(Get-Date -Format 'yyyyMMdd_HHmmss') 2>/dev/null || true"

# Upload file
Write-Host "📤 Uploading file..." -ForegroundColor Cyan
gcloud compute scp $LOCAL_FILE "${VM_NAME}:${VM_PATH}" --zone=$VM_ZONE

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Upload failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Upload successful!" -ForegroundColor Green
Write-Host ""

# Restart PM2 service if requested
if ($Restart) {
    Write-Host "🔄 Restarting PM2 service..." -ForegroundColor Cyan
    gcloud compute ssh $VM_NAME --zone=$VM_ZONE --command="pm2 restart video-stitch"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Service restarted successfully!" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Service restart failed!" -ForegroundColor Yellow
    }
} else {
    Write-Host "ℹ️ Service not restarted. Use -Restart flag to restart PM2." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✨ Deployment complete!" -ForegroundColor Green
