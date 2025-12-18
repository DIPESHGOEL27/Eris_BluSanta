# Upload BluSanta constant videos to GCS
# Run from the ErisBluSanta directory

$BUCKET = "blusanta-campaign-videos"
$BASE_PATH = "blusanta/constant-videos/english"
$VIDEOS_DIR = ".\videos"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "BluSanta Video Assets Upload" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check if videos directory exists
if (-not (Test-Path $VIDEOS_DIR)) {
    Write-Host "❌ Error: $VIDEOS_DIR not found" -ForegroundColor Red
    Write-Host "Please run this script from the ErisBluSanta directory" -ForegroundColor Yellow
    exit 1
}

Write-Host "📦 Uploading videos to gs://$BUCKET/$BASE_PATH/" -ForegroundColor Yellow
Write-Host ""

# Upload all files from videos directory
$files = Get-ChildItem -Path $VIDEOS_DIR -File

foreach ($file in $files) {
    $destPath = "gs://$BUCKET/$BASE_PATH/$($file.Name)"
    Write-Host "  ⬆️  $($file.Name) → $destPath" -ForegroundColor Gray
    gsutil cp "$($file.FullName)" $destPath
}

Write-Host ""
Write-Host "✅ Upload complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Uploaded files:" -ForegroundColor Cyan
gsutil ls "gs://$BUCKET/$BASE_PATH/"
Write-Host ""
