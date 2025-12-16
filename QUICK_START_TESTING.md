# 🎬 Quick Start: Testing BluSanta 8-Segment Flow

## ⚡ Current Status

✅ All code deployed  
✅ All constant videos uploaded to GCS  
✅ Backend and stitching services running  
⏳ **Ready for end-to-end test!**

---

## 🎯 What You Need to Test

### 1. TWO Doctor Response Videos

You need actual doctor videos recorded by a real doctor answering the two questions:

**Video 1:** Answer to "How has your experience been with us?"

- Duration: 15-30 seconds
- Format: MP4, any resolution (will be standardized)
- Content: Doctor speaking on camera

**Video 2:** Answer to "What advice would you give to other doctors?"

- Duration: 15-30 seconds
- Format: MP4, any resolution (will be standardized)
- Content: Doctor speaking on camera

---

## 🚀 Option 1: Use Existing Sample Videos (Quick Test)

If you just want to test the pipeline works, you can upload placeholder doctor videos:

```powershell
# Use existing sample videos as test
gsutil cp "c:\Users\Dipesh_Goel\AI Video Training\ErisBluSanta\sample_videos\Blusanta_Dr Abhishek.mp4" gs://blusanta-campaign-videos/test/doctor_response_1.mp4

gsutil cp "c:\Users\Dipesh_Goel\AI Video Training\ErisBluSanta\sample_videos\Blusanta_Dr Bhargavi.mp4" gs://blusanta-campaign-videos/test/doctor_response_2.mp4

# Then run the test
cd "c:\Users\Dipesh_Goel\AI Video Training\ErisBluSanta"
.\test-8-segment-flow.ps1
```

⚠️ **Note:** These are placeholder videos, not actual doctor responses, but will test the pipeline.

---

## 🎥 Option 2: Record Real Doctor Videos (Production Test)

### Recording Instructions for Doctor:

**Setup:**

- Good lighting (face clearly visible)
- Clean background (or video call background)
- Stable camera (phone is fine)
- Record horizontal (landscape mode)

**Question 1: "How has your experience been with us?"**

- Duration: 15-30 seconds
- Script: Doctor speaks naturally about their experience
- Save as: `doctor_q1.mp4`

**Question 2: "What advice would you give to other doctors?"**

- Duration: 15-30 seconds
- Script: Doctor gives advice to colleagues
- Save as: `doctor_q2.mp4`

### Upload to GCS:

```powershell
gsutil cp "path\to\doctor_q1.mp4" gs://blusanta-campaign-videos/test/doctor_response_1.mp4
gsutil cp "path\to\doctor_q2.mp4" gs://blusanta-campaign-videos/test/doctor_response_2.mp4
```

### Run Test:

```powershell
cd "c:\Users\Dipesh_Goel\AI Video Training\ErisBluSanta"
.\test-8-segment-flow.ps1
```

---

## 🎤 Testing TWO Audio Generation

The test script will automatically:

1. Generate greeting audio: "Doctor Abhishek"
2. Generate thank you audio: "Thank you Doctor Abhishek"
3. Upload both to GCS
4. Verify both files exist

You can manually test audio generation:

```powershell
# Test audio generation endpoint
$body = @{
    employee_code = "TEST001"
    dr_code = "DR001"
    dr_first_name = "Abhishek"
    dr_last_name = "Kumar"
    video_language = "English"
    dr_name_pronunciation = "Abhishek"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://34.171.167.66:5001/api/blusanta/generate-audio" `
    -Method POST `
    -Headers @{
        "Authorization" = "Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiZTMxZjE2YTVlMTQzYTBkZTExMjkifQ.pWDOEeQy1M8C_4sazA3Vm3VIFN59DoeZBfGC2bXxrLs"
        "Content-Type" = "application/json"
    } `
    -Body $body
```

Expected response:

```json
{
  "greetingUrl": "gs://blusanta-campaign-videos/blusanta/audio/names/english/TEST001_DR001_greeting.mp3",
  "thankYouUrl": "gs://blusanta-campaign-videos/blusanta/audio/names/english/TEST001_DR001_thankyou.mp3"
}
```

---

## 📊 Monitor the Process

### 1. Backend Logs (Audio Generation)

```bash
gcloud compute ssh blusanta-campaign --zone=us-central1-c --command="pm2 logs blusanta-backend --lines 50"
```

Look for:

- ✅ `[BLUSANTA] ✅ Greeting audio: gs://...`
- ✅ `[BLUSANTA] ✅ Thank you audio: gs://...`

### 2. Stitching Logs (Video Processing)

```bash
gcloud compute ssh video-stitch-blusanta --zone=us-central1-a --command="pm2 logs video-stitch --lines 50"
```

Look for:

- ✅ `Segment 0: const_000 processed`
- ✅ `Segment 1: plc_000 with greeting audio processed`
- ✅ `Segment 2: const_001 processed`
- ✅ `Segment 3: nodding + doctor response 1 ZOOM processed`
- ✅ `Segment 4: const_002 processed`
- ✅ `Segment 5: nodding + doctor response 2 ZOOM processed`
- ✅ `Segment 6: plc_001 with thank you audio processed`
- ✅ `Segment 7: const_003 processed`
- ✅ `Final video uploaded to gs://...`

### 3. Check Final Video

```powershell
# List final videos
gsutil ls gs://blusanta-campaign-videos/blusanta/final-videos/

# Download to verify
gsutil cp gs://blusanta-campaign-videos/blusanta/final-videos/TEST001_DR001_final.mp4 .

# Play the video to verify all 8 segments
```

---

## 🎯 Expected Result

You should get a final video with this structure:

```
00:00 - 00:XX  Segment 0: Intro + greeting
       ↓
00:XX - 00:XX  Segment 1: "Doctor Abhishek" (ElevenLabs audio)
       ↓
00:XX - 00:XX  Segment 2: Question 1
       ↓
00:XX - 00:XX  Segment 3: Doctor answers Q1 (ZOOM layout)
       ↓
00:XX - 00:XX  Segment 4: Question 2
       ↓
00:XX - 00:XX  Segment 5: Doctor answers Q2 (ZOOM layout)
       ↓
00:XX - 00:XX  Segment 6: "Thank you Doctor Abhishek" (ElevenLabs audio)
       ↓
00:XX - 00:XX  Segment 7: Final message + outro
```

---

## ❓ What to Check in Final Video

1. **Audio Quality:**

   - [ ] Greeting audio sounds natural
   - [ ] Thank you audio sounds natural
   - [ ] Doctor's voice clear in ZOOM segments
   - [ ] No audio gaps or glitches

2. **Visual Quality:**

   - [ ] All segments flow smoothly
   - [ ] ZOOM layout shows BluSanta left, Doctor right
   - [ ] Background image visible in ZOOM segments
   - [ ] No black frames or stuttering

3. **Timing:**
   - [ ] Each segment has appropriate duration
   - [ ] No awkward pauses between segments
   - [ ] Nodding video trimmed to match doctor responses

---

## 🚨 Troubleshooting

### Audio generation fails

```powershell
# Check ElevenLabs quota
gcloud compute ssh blusanta-campaign --zone=us-central1-c --command="cat /home/Dipesh_Goel/blusanta/.env | grep ELEVENLABS"
```

### Stitching fails

```bash
# Check stitching VM status
gcloud compute ssh video-stitch-blusanta --zone=us-central1-a --command="pm2 status"

# Check disk space
gcloud compute ssh video-stitch-blusanta --zone=us-central1-a --command="df -h"

# Check Python environment
gcloud compute ssh video-stitch-blusanta --zone=us-central1-a --command="source ~/venv-stitch/bin/activate && python --version"
```

### Videos not found in GCS

```powershell
# Verify all required files
gsutil ls gs://blusanta-campaign-videos/blusanta/constant-videos/english/const_*.mp4
gsutil ls gs://blusanta-campaign-videos/blusanta/constant-videos/english/plc_*.mp4
gsutil ls gs://blusanta-campaign-videos/blusanta/constant-videos/english/nodding.mp4
gsutil ls gs://blusanta-campaign-videos/blusanta/podcast-backgrounds/Podcast_BG.jpg
```

---

## ✅ Success Checklist

After running the test, verify:

- [ ] TWO audio files created in GCS
- [ ] Both audio files sound correct
- [ ] All 8 segments processed
- [ ] Final video downloaded and plays correctly
- [ ] Greeting audio (segment 1) sounds natural
- [ ] Thank you audio (segment 6) sounds natural
- [ ] ZOOM segments (3, 5) show correct layout
- [ ] No errors in backend logs
- [ ] No errors in stitching logs
- [ ] WhatsApp notification sent (if configured)

---

## 🎉 Once Testing is Complete

If everything works:

1. **Update Frontend:** Integrate new 8-segment flow
2. **Production Data:** Use real doctor videos
3. **Scale:** Configure for multiple doctors
4. **Monitor:** Set up alerts and dashboards

---

**Quick Command Reference:**

```powershell
# Upload test videos
gsutil cp sample_doctor_1.mp4 gs://blusanta-campaign-videos/test/doctor_response_1.mp4
gsutil cp sample_doctor_2.mp4 gs://blusanta-campaign-videos/test/doctor_response_2.mp4

# Run test
.\test-8-segment-flow.ps1

# Monitor logs
gcloud compute ssh blusanta-campaign --zone=us-central1-c --command="pm2 logs blusanta-backend"
gcloud compute ssh video-stitch-blusanta --zone=us-central1-a --command="pm2 logs video-stitch"

# Download result
gsutil cp gs://blusanta-campaign-videos/blusanta/final-videos/TEST001_DR001_final.mp4 .
```

---

**Ready to test?** Run `.\test-8-segment-flow.ps1` to begin! 🚀
