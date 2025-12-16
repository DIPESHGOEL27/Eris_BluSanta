#!/bin/bash
# ============================================
# Upload BluSanta Constant Videos to GCS
# ============================================
# 
# This script uploads the constant/placeholder videos to GCS bucket
# for use in video stitching.
#
# Usage:
#   chmod +x upload-constant-videos.sh
#   ./upload-constant-videos.sh
# ============================================

# Configuration
BUCKET="blusanta-campaign-videos"
VIDEOS_DIR="./videos"
TARGET_PATH="blusanta/constant-videos/english"

echo "============================================"
echo "🎅 BluSanta Constant Videos Upload"
echo "============================================"
echo ""
echo "Bucket: gs://${BUCKET}"
echo "Target Path: ${TARGET_PATH}"
echo "Source: ${VIDEOS_DIR}"
echo ""

# Check if gsutil is available
if ! command -v gsutil &> /dev/null; then
    echo "❌ gsutil not found. Please install Google Cloud SDK"
    exit 1
fi

# Create bucket if it doesn't exist
echo "📦 Creating bucket (if not exists)..."
gsutil mb -l us-central1 gs://${BUCKET} 2>/dev/null || echo "Bucket already exists"

# Upload videos
echo ""
echo "📤 Uploading constant videos..."

# The 9-part video sequence
declare -a VIDEOS=(
    "1_Const_Intro.mp4"
    "2_Doctor_Placeholder.mp4"
    "3_Const_Question_1.mp4"
    "4_Blusanta_Noding.mp4"
    "5_Const_Question_2.mp4"
    "6_Blusanta_Noding.mp4"
    "7_Const_Blusanta_Thank you.mp4"
    "8_Doctor_Plc_Blusanta_Thank you.mp4"
    "9_Const_outro_Blusanta_Thank you.mp4"
)

for VIDEO in "${VIDEOS[@]}"; do
    if [ -f "${VIDEOS_DIR}/${VIDEO}" ]; then
        echo "  Uploading: ${VIDEO}"
        gsutil cp "${VIDEOS_DIR}/${VIDEO}" "gs://${BUCKET}/${TARGET_PATH}/${VIDEO}"
    else
        echo "  ⚠️ Not found: ${VIDEO}"
    fi
done

# Also upload any additional sample videos
echo ""
echo "📤 Uploading sample videos (if present)..."
for file in "${VIDEOS_DIR}"/*.mp4; do
    if [ -f "$file" ]; then
        filename=$(basename "$file")
        # Skip if already uploaded
        case "$filename" in
            1_Const_Intro.mp4|2_Doctor_Placeholder.mp4|3_Const_Question_1.mp4|4_Blusanta_Noding.mp4|5_Const_Question_2.mp4|6_Blusanta_Noding.mp4|"7_Const_Blusanta_Thank you.mp4"|"8_Doctor_Plc_Blusanta_Thank you.mp4"|"9_Const_outro_Blusanta_Thank you.mp4")
                continue
                ;;
            *)
                echo "  Uploading: ${filename}"
                gsutil cp "$file" "gs://${BUCKET}/${TARGET_PATH}/samples/${filename}"
                ;;
        esac
    fi
done

# Create required folders
echo ""
echo "📁 Creating folder structure..."
echo "" | gsutil cp - "gs://${BUCKET}/blusanta/audio/names/english/.keep"
echo "" | gsutil cp - "gs://${BUCKET}/blusanta/audio/names/hindi/.keep"
echo "" | gsutil cp - "gs://${BUCKET}/blusanta/audio/thankyou/english/.keep"
echo "" | gsutil cp - "gs://${BUCKET}/blusanta/audio/thankyou/hindi/.keep"
echo "" | gsutil cp - "gs://${BUCKET}/blusanta/results/.keep"
echo "" | gsutil cp - "gs://${BUCKET}/blusanta/results_hindi/.keep"
echo "" | gsutil cp - "gs://${BUCKET}/blusanta/doctor_videos/.keep"

# Set CORS
echo ""
echo "🔧 Setting CORS..."
cat > /tmp/cors.json << 'EOF'
[
  {
    "origin": ["*"],
    "method": ["GET", "HEAD", "PUT", "POST", "DELETE"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type", "Access-Control-Allow-Origin"]
  }
]
EOF
gsutil cors set /tmp/cors.json gs://${BUCKET}

# Make bucket publicly readable
echo ""
echo "🔓 Setting public access..."
gsutil iam ch allUsers:objectViewer gs://${BUCKET}

echo ""
echo "============================================"
echo "✅ Upload Complete!"
echo "============================================"
echo ""
echo "Uploaded videos to: gs://${BUCKET}/${TARGET_PATH}/"
echo ""
echo "Folder structure created:"
echo "  gs://${BUCKET}/blusanta/"
echo "  ├── audio/"
echo "  │   ├── names/english/"
echo "  │   ├── names/hindi/"
echo "  │   ├── thankyou/english/"
echo "  │   └── thankyou/hindi/"
echo "  ├── constant-videos/english/"
echo "  ├── doctor_videos/"
echo "  ├── results/"
echo "  └── results_hindi/"
echo ""
