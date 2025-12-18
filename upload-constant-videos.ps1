# PowerShell script to upload BluSanta constant videos to GCS
# ============================================
# 
# Usage:
#   .\upload-constant-videos.ps1
# ============================================

$BUCKET = "blusanta-campaign-videos"
$VIDEOS_DIR = ".\videos"
$TARGET_PATH = "blusanta/constant-videos/english"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "🎅 BluSanta Constant Videos Upload" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Bucket: gs://$BUCKET" -ForegroundColor Yellow
Write-Host "Target Path: $TARGET_PATH" -ForegroundColor Yellow
Write-Host "Source: $VIDEOS_DIR" -ForegroundColor Yellow
Write-Host ""

# Check if gsutil is available
try {
    gsutil --version | Out-Null
} catch {
    Write-Host "❌ gsutil not found. Please install Google Cloud SDK" -ForegroundColor Red
    exit 1
}

# Create bucket if it doesn't exist
Write-Host "📦 Creating bucket (if not exists)..." -ForegroundColor Green
gsutil mb -l us-central1 "gs://$BUCKET" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Bucket already exists or creation skipped" -ForegroundColor Gray
}

# Video sequence (9 parts)
$VIDEOS = @(
    "1_Const_Intro.mp4",
    "2_Doctor_Placeholder.mp4",
    "3_Const_Question_1.mp4",
    "4_Blusanta_Noding.mp4",
    "5_Const_Question_2.mp4",
    "6_Blusanta_Noding.mp4",
    "7_Const_Blusanta_Thank you.mp4",
    "8_Doctor_Plc_Blusanta_Thank you.mp4",
    "9_Const_outro_Blusanta_Thank you.mp4"
)

Write-Host ""
Write-Host "📤 Uploading constant videos..." -ForegroundColor Green

foreach ($VIDEO in $VIDEOS) {
    $filePath = Join-Path $VIDEOS_DIR $VIDEO
    if (Test-Path $filePath) {
        Write-Host "  Uploading: $VIDEO" -ForegroundColor White
        gsutil cp $filePath "gs://$BUCKET/$TARGET_PATH/$VIDEO"
    } else {
        Write-Host "  ⚠️ Not found: $VIDEO" -ForegroundColor Yellow
    }
}

# Create folder structure
Write-Host ""
Write-Host "📁 Creating folder structure..." -ForegroundColor Green

$FOLDERS = @(
    "blusanta/audio/names/english/.keep",
    "blusanta/audio/names/hindi/.keep",
    "blusanta/audio/thankyou/english/.keep",
    "blusanta/audio/thankyou/hindi/.keep",
    "blusanta/results/.keep",
    "blusanta/results_hindi/.keep",
    "blusanta/doctor_videos/.keep"
)

foreach ($FOLDER in $FOLDERS) {
    Write-Host "  Creating: $FOLDER" -ForegroundColor Gray
    "" | gsutil cp - "gs://$BUCKET/$FOLDER"
}

# Set CORS
Write-Host ""
Write-Host "🔧 Setting CORS..." -ForegroundColor Green
$corsJson = @"
[
  {
    "origin": ["*"],
    "method": ["GET", "HEAD", "PUT", "POST", "DELETE"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type", "Access-Control-Allow-Origin"]
  }
]
"@
$corsFile = Join-Path $env:TEMP "cors.json"
$corsJson | Out-File -FilePath $corsFile -Encoding UTF8
gsutil cors set $corsFile "gs://$BUCKET"

# Make bucket publicly readable
Write-Host ""
Write-Host "🔓 Setting public access..." -ForegroundColor Green
gsutil iam ch allUsers:objectViewer "gs://$BUCKET"

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "✅ Upload Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Uploaded videos to: gs://$BUCKET/$TARGET_PATH/" -ForegroundColor White
Write-Host ""
Write-Host "GCS Folder Structure:" -ForegroundColor White
Write-Host "  gs://$BUCKET/blusanta/" -ForegroundColor Gray
Write-Host "  ├── audio/" -ForegroundColor Gray
Write-Host "  │   ├── names/english/" -ForegroundColor Gray
Write-Host "  │   ├── names/hindi/" -ForegroundColor Gray
Write-Host "  │   ├── thankyou/english/" -ForegroundColor Gray
Write-Host "  │   └── thankyou/hindi/" -ForegroundColor Gray
Write-Host "  ├── constant-videos/english/" -ForegroundColor Gray
Write-Host "  ├── doctor_videos/" -ForegroundColor Gray
Write-Host "  ├── results/" -ForegroundColor Gray
Write-Host "  └── results_hindi/" -ForegroundColor Gray
Write-Host ""
