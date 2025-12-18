# BluSanta Test Video Generation Script
# This script tests the complete 8-segment video generation flow

Write-Host "🎬 BluSanta Test Video Generation" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$BACKEND_URL = "http://34.171.167.66:5001"
$AUTH_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiZTMxZjE2YTVlMTQzYTBkZTExMjkifQ.pWDOEeQy1M8C_4sazA3Vm3VIFN59DoeZBfGC2bXxrLs"

# Test data
$TEST_EMPLOYEE_CODE = "TEST001"
$TEST_DR_CODE = "DR001"
$TEST_DR_FIRST_NAME = "Abhishek"
$TEST_DR_LAST_NAME = "Kumar"
$TEST_LANGUAGE = "English"

Write-Host "📋 Test Configuration:" -ForegroundColor Yellow
Write-Host "  Employee Code: $TEST_EMPLOYEE_CODE"
Write-Host "  Doctor Code: $TEST_DR_CODE"
Write-Host "  Doctor Name: Dr. $TEST_DR_FIRST_NAME $TEST_DR_LAST_NAME"
Write-Host "  Language: $TEST_LANGUAGE"
Write-Host ""

# Step 1: Generate TWO audio files
Write-Host "🎤 Step 1: Generating TWO ElevenLabs audio files..." -ForegroundColor Green

$audioPayload = @{
    employee_code = $TEST_EMPLOYEE_CODE
    dr_code = $TEST_DR_CODE
    dr_first_name = $TEST_DR_FIRST_NAME
    dr_last_name = $TEST_DR_LAST_NAME
    video_language = $TEST_LANGUAGE
    dr_name_pronunciation = "Abhishek"
} | ConvertTo-Json

Write-Host "Payload:" -ForegroundColor Gray
Write-Host $audioPayload -ForegroundColor Gray

try {
    $audioResponse = Invoke-RestMethod -Uri "$BACKEND_URL/api/blusanta/generate-audio" `
        -Method POST `
        -Headers @{
            "Authorization" = "Bearer $AUTH_TOKEN"
            "Content-Type" = "application/json"
        } `
        -Body $audioPayload

    Write-Host "✅ Audio generation response:" -ForegroundColor Green
    Write-Host ($audioResponse | ConvertTo-Json -Depth 10) -ForegroundColor White
    
    if ($audioResponse.greetingUrl -and $audioResponse.thankYouUrl) {
        Write-Host "✅ TWO audio files generated successfully!" -ForegroundColor Green
        Write-Host "  Greeting audio: $($audioResponse.greetingUrl)" -ForegroundColor Cyan
        Write-Host "  Thank you audio: $($audioResponse.thankYouUrl)" -ForegroundColor Cyan
    } else {
        Write-Host "❌ Audio generation failed - missing URLs" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Audio generation failed:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 2: Check if we have test doctor videos in GCS
Write-Host "📹 Step 2: Checking for test doctor videos..." -ForegroundColor Green

# For now, we'll use placeholder paths
$DR_VIDEO_1 = "gs://blusanta-campaign-videos/test/doctor_response_1.mp4"
$DR_VIDEO_2 = "gs://blusanta-campaign-videos/test/doctor_response_2.mp4"

Write-Host "  Doctor Video 1: $DR_VIDEO_1" -ForegroundColor Cyan
Write-Host "  Doctor Video 2: $DR_VIDEO_2" -ForegroundColor Cyan
Write-Host ""

Write-Host "⚠️  Note: Make sure these test videos exist in GCS!" -ForegroundColor Yellow
Write-Host ""

# Step 3: Trigger video stitching
Write-Host "🎬 Step 3: Triggering video stitching..." -ForegroundColor Green

$stitchPayload = @{
    employee_code = $TEST_EMPLOYEE_CODE
    dr_code = $TEST_DR_CODE
    dr_first_name = $TEST_DR_FIRST_NAME
    dr_last_name = $TEST_DR_LAST_NAME
    video_language = $TEST_LANGUAGE
    dr_video_1_url = $DR_VIDEO_1
    dr_video_2_url = $DR_VIDEO_2
} | ConvertTo-Json

Write-Host "Payload:" -ForegroundColor Gray
Write-Host $stitchPayload -ForegroundColor Gray

try {
    $stitchResponse = Invoke-RestMethod -Uri "$BACKEND_URL/api/blusanta/trigger-stitching" `
        -Method POST `
        -Headers @{
            "Authorization" = "Bearer $AUTH_TOKEN"
            "Content-Type" = "application/json"
        } `
        -Body $stitchPayload

    Write-Host "✅ Stitching triggered:" -ForegroundColor Green
    Write-Host ($stitchResponse | ConvertTo-Json -Depth 10) -ForegroundColor White
} catch {
    Write-Host "❌ Stitching trigger failed:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 4: Monitor stitching status
Write-Host "⏳ Step 4: Monitoring stitching progress..." -ForegroundColor Green
Write-Host "  Check PM2 logs on stitching VM:" -ForegroundColor Yellow
Write-Host "  gcloud compute ssh video-stitch-blusanta --zone=us-central1-a --command='pm2 logs video-stitch --lines 50'" -ForegroundColor Cyan
Write-Host ""

Write-Host "🎉 Test initiated successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Next steps:" -ForegroundColor Yellow
Write-Host "  1. Monitor backend logs: gcloud compute ssh blusanta-campaign --zone=us-central1-c --command='pm2 logs blusanta-backend --lines 50'"
Write-Host "  2. Monitor stitching logs: gcloud compute ssh video-stitch-blusanta --zone=us-central1-a --command='pm2 logs video-stitch --lines 50'"
Write-Host "  3. Check final video in GCS: gsutil ls gs://blusanta-campaign-videos/blusanta/final-videos/"
Write-Host ""
