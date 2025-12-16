#!/bin/bash
# Deploy BluSanta Zoom Stitching to video-stitch-blusanta VM

set -e

VM_NAME="video-stitch-blusanta"
ZONE="us-central1-a"
SCRIPT_NAME="blusanta_zoom_stitch.py"

echo "=========================================="
echo "BluSanta Zoom Stitching Deployment"
echo "=========================================="
echo ""

# Check if script exists
if [ ! -f "$SCRIPT_NAME" ]; then
    echo "❌ Error: $SCRIPT_NAME not found in current directory"
    exit 1
fi

echo "📦 Copying $SCRIPT_NAME to VM $VM_NAME..."
gcloud compute scp "$SCRIPT_NAME" "${VM_NAME}:~/zoom_stitch.py" --zone="$ZONE"

echo ""
echo "🔧 Setting up Python environment on VM..."
gcloud compute ssh "$VM_NAME" --zone="$ZONE" --command='bash -lc "
    set -e
    echo \"=== Installing dependencies ===\"
    
    # Create virtual environment if it doesn'\''t exist
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
    echo \"Python: \$(python --version)\"
    echo \"\"
"'

echo ""
echo "✅ Deployment complete!"
echo ""
echo "To test the deployment, run:"
echo "  gcloud compute ssh $VM_NAME --zone=$ZONE"
echo "  source ~/venv-stitch/bin/activate"
echo "  python ~/zoom_stitch.py"
echo ""
