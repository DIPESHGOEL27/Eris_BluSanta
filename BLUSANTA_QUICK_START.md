# BluSanta Podcast Video - Quick Start Guide

## Overview

BluSanta creates podcast-style videos with:

- **9-part podcast video**: Intro → Q&A with side-by-side zoom → Outro
- **Final wrap**: Campaign intro → Podcast → Campaign outro
- **Two layouts**: Full-screen for constants, side-by-side zoom for Q&A

## Quick Deploy (3 Steps)

### Step 1: Upload Videos to GCS (1 minute)

```powershell
cd ErisBluSanta
.\upload-videos.ps1
```

✅ Uploads 12 files from `videos/` folder to GCS

### Step 2: Deploy Stitching Script (2 minutes)

```powershell
cd ..
.\deploy-blusanta-zoom.ps1
```

✅ Deploys `blusanta_zoom_stitch.py` to VM
✅ Sets up Python environment
✅ Verifies ffmpeg and gsutil

### Step 3: Test the Flow (5 minutes)

```powershell
# Trigger video generation for test assessment
curl -X POST http://localhost:3001/api/blusanta/initiate-audio-generation `
  -H "Content-Type: application/json" `
  -d '{"language": "English"}'
```

✅ ElevenLabs generates "Doctor [Name]" audio
✅ Stitching creates podcast video with zoom layout
✅ Final video uploaded to GCS
✅ Sheet updated with video URL

## Video Layouts

### Full-Screen (7 segments)

```
1920x1080 native resolution
Used for: Intro, Outro, Questions, Placeholders
```

### Podcast Zoom (2 segments - Q&A)

```
┌──────────────────────────────────────────┐
│        1920x1080 Background              │
│  ┌──────────┐            ┌──────────┐   │
│  │          │            │          │   │
│  │ BluSanta │            │  Doctor  │   │
│  │ 640x720  │            │ 640x720  │   │
│  │ @140,180 │            │ @1140,180│   │
│  └──────────┘            └──────────┘   │
└──────────────────────────────────────────┘
```

## Video Sequence

### Podcast Video (Stage 1)

```
1. Intro (full-screen)
2. "Doctor [Name]" placeholder (full-screen, ElevenLabs audio)
3. Question 1 (full-screen)
4. BluSanta + Doctor Response 1 (PODCAST ZOOM)
5. Question 2 (full-screen)
6. BluSanta + Doctor Response 2 (PODCAST ZOOM)
7. Thank You (full-screen)
8. "Doctor [Name]" thank you (full-screen, ElevenLabs audio)
9. Outro (full-screen)
```

### Final Wrap (Stage 2)

```
1. Final_Video_Intro.mp4
2. Podcast Video (from above)
3. Final_Video_Outro.mp4
```

## File Locations

### Local Files

```
ErisBluSanta/videos/
├── 1_Const_Intro.mp4
├── 2_Doctor_Placeholder.mp4
├── 3_Const_Question_1.mp4
├── 4_Blusanta_Noding.mp4
├── 5_Const_Question_2.mp4
├── 6_Blusanta_Noding.mp4
├── 7_Const_Blusanta_Thank you.mp4
├── 8_Doctor_Plc_Blusanta_Thank you.mp4
├── 9_Const_outro_Blusanta_Thank you.mp4
├── Final_Video_Intro.mp4
├── Final_Video_Outro.mp4
└── Podcast_BG.jpg
```

### GCS Bucket

```
gs://blusanta-campaign-videos/
└── blusanta/
    ├── constant-videos/
    │   └── english/
    │       ├── 1_Const_Intro.mp4
    │       ├── 2_Doctor_Placeholder.mp4
    │       ├── ...
    │       └── Podcast_BG.jpg
    ├── audio/
    │   └── names/
    │       └── english/
    │           └── {employee}_{dr}_name.mp3
    └── results/
        └── {employee}_{dr}_final.mp4
```

### VM Deployment

```
video-stitch-blusanta VM:
├── ~/zoom_stitch.py         (stitching script)
├── ~/venv-stitch/           (Python virtual env)
└── /tmp/blusanta_zoom_*/    (temp work dirs)
```

## Troubleshooting

### Videos Not Uploaded

```powershell
# Check GCS bucket access
gsutil ls gs://blusanta-campaign-videos/blusanta/

# Re-upload specific file
gsutil cp .\videos\Podcast_BG.jpg gs://blusanta-campaign-videos/blusanta/constant-videos/english/
```

### Deployment Failed

```powershell
# Check VM is running
gcloud compute instances list --filter="name=video-stitch-blusanta"

# Start VM if stopped
gcloud compute instances start video-stitch-blusanta --zone=us-central1-a

# Re-run deployment
.\deploy-blusanta-zoom.ps1
```

### Stitching Fails

```bash
# SSH into VM
gcloud compute ssh video-stitch-blusanta --zone=us-central1-a

# Check script exists
ls -lh ~/zoom_stitch.py

# Test ffmpeg
ffmpeg -version

# Check logs
journalctl -u video-stitch -f
# OR
pm2 logs
```

### Audio Overlay Not Working

```bash
# Verify ElevenLabs audio exists
gsutil ls gs://blusanta-campaign-videos/blusanta/audio/names/english/

# Download and test audio
gsutil cp gs://blusanta-campaign-videos/blusanta/audio/names/english/e99998_12345678_name.mp3 test.mp3
ffprobe test.mp3
```

## Monitoring

### Check Assessment Status

```sql
-- Check pending assessments
SELECT id, employee_code, dr_code, audio_generation, video_stitch
FROM assessments
WHERE avatar_name = 'blusanta'
ORDER BY created_at DESC
LIMIT 10;
```

### Check Stitching Server Status

```bash
# Via API
curl http://<vm-ip>:8080/status

# Check processes
ssh video-stitch-blusanta
ps aux | grep python
```

### Check GCS Output

```powershell
# List recent outputs
gsutil ls -lh gs://blusanta-campaign-videos/blusanta/results/ | Sort-Object -Descending | Select-Object -First 10

# Download for review
gsutil cp gs://blusanta-campaign-videos/blusanta/results/e99998_12345678_final.mp4 review.mp4
```

## Performance

### Expected Timings

- Audio generation (ElevenLabs): ~10 seconds per assessment
- Podcast video stitching: ~3-5 minutes per assessment
- Final wrap: ~30 seconds
- Total: ~4-6 minutes end-to-end

### Optimization Tips

1. Use `-preset fast` or `-preset medium` for ffmpeg (not ultrafast or slow)
2. CRF 23 is good balance of quality/size (lower = better quality, larger file)
3. Keep nodding videos short (max 2-3 minutes)
4. Pre-process constant videos to ensure consistent codec/resolution

## Production Checklist

- [ ] All 12 files uploaded to GCS
- [ ] Stitching script deployed to VM
- [ ] Backend updated with correct GCS paths
- [ ] Test assessment created in database
- [ ] End-to-end flow tested successfully
- [ ] Sheet integration verified
- [ ] WhatsApp template tested
- [ ] Error monitoring set up
- [ ] Backup strategy defined

## Support

### Logs to Check

1. Backend logs: `pm2 logs backend` or `journalctl -u backend`
2. Stitching VM logs: SSH and check service logs
3. Database: Check assessment status and error_message fields
4. GCS: Verify all required files exist

### Common Issues

| Issue                   | Solution                                                |
| ----------------------- | ------------------------------------------------------- |
| Missing Podcast_BG.jpg  | Re-upload: `gsutil cp .\videos\Podcast_BG.jpg gs://...` |
| Audio overlay fails     | Check ElevenLabs quota and audio file exists            |
| Zoom layout black boxes | Verify video scaling and overlay positions              |
| Concat fails            | Ensure all segments have same codec/resolution          |

## Quick Commands

```powershell
# Deploy everything
cd ErisBluSanta
.\upload-videos.ps1
cd ..
.\deploy-blusanta-zoom.ps1

# Test
curl -X POST http://localhost:3001/api/blusanta/initiate-audio-generation -d '{"language":"English"}'

# Monitor
gcloud compute ssh video-stitch-blusanta --zone=us-central1-a --command="tail -f /var/log/video-stitch.log"

# Check output
gsutil ls gs://blusanta-campaign-videos/blusanta/results/
```

## Done! 🎉

Your BluSanta podcast video system is ready to generate personalized videos with professional podcast-style Q&A segments!
