# Deploy BluSanta Zoom Stitching to video-stitch-blusanta VM
# PowerShell deployment script

$VM_NAME = "video-stitch-blusanta"
$ZONE = "us-central1-a"
$SCRIPT_NAME = "blusanta_zoom_stitch.py"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "BluSanta Zoom Stitching Deployment" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check if script exists
if (-not (Test-Path $SCRIPT_NAME)) {
    Write-Host "❌ Error: $SCRIPT_NAME not found in current directory" -ForegroundColor Red
    exit 1
}

Write-Host "📦 Copying $SCRIPT_NAME to VM $VM_NAME..." -ForegroundColor Yellow
gcloud compute scp $SCRIPT_NAME "${VM_NAME}:~/zoom_stitch.py" --zone=$ZONE

Write-Host ""
Write-Host "🔧 Setting up Python environment on VM..." -ForegroundColor Yellow

$setupCommand = @'
bash -lc "
    set -e
    echo \"=== Installing dependencies ===\"
    
    # Create virtual environment if it doesn't exist
    if [ ! -d ~/venv-stitch ]; then
        python3 -m venv ~/venv-stitch
        echo \"✅ Created virtual environment\"
    fi
    
    # Activate and install packages
    source ~/venv-stitch/bin/activate
    pip install --upgrade pip
    pip install requests
    
    echo \"✅ Dependencies installed\"
    
    # Verify ffmpeg
    if ! command -v ffmpeg &> /dev/null; then
        echo \"⚠️ Warning: ffmpeg not found, attempting install...\"
        sudo apt-get update
        sudo apt-get install -y ffmpeg
    fi
    
    ffmpeg -version | head -n 1
    echo \"✅ ffmpeg verified\"
    
    # Verify gsutil
    if ! command -v gsutil &> /dev/null; then
        echo \"❌ Error: gsutil not found\"
        exit 1
    fi
    
    gsutil version | head -n 1
    echo \"✅ gsutil verified\"
    
    echo \"\"
    echo \"=== Deployment Summary ===\"
    echo \"Script: ~/zoom_stitch.py\"
    echo \"Venv: ~/venv-stitch\"
    echo \"Python: $(python --version)\"
    echo \"\"
"
'@

gcloud compute ssh $VM_NAME --zone=$ZONE --command=$setupCommand

Write-Host ""
Write-Host "✅ Deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "To test the deployment, run:" -ForegroundColor Cyan
Write-Host "  gcloud compute ssh $VM_NAME --zone=$ZONE" -ForegroundColor White
Write-Host "  source ~/venv-stitch/bin/activate" -ForegroundColor White
Write-Host "  python ~/zoom_stitch.py" -ForegroundColor White
Write-Host ""
