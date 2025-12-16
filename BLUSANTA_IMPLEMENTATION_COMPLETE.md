# BluSanta Podcast Video Implementation - Complete

## What's Been Implemented

### 1. Two-Layout Stitching System ✅

**Full-Screen Layout** (Parts 1, 2, 3, 5, 7, 8, 9):

- Videos play at native 1920x1080 resolution
- Used for intro, outro, questions, and placeholder videos

**Podcast Zoom Layout** (Parts 4, 6):

- Background: `Podcast_BG.jpg` (1920x1080)
- BluSanta (left): 640x720 at (140, 180)
- Doctor (right): 640x720 at (1140, 180)
- Side-by-side view for Q&A segments

### 2. Two-Stage Stitching Process ✅

**Stage 1: Podcast Video (9 parts)**

```
Intro → Name Placeholder → Q1 → [BluSanta + Dr1] → Q2 → [BluSanta + Dr2] → Thank You → Thank You Placeholder → Outro
```

**Stage 2: Final Wrap (3 parts)**

```
Final_Video_Intro → Podcast Video → Final_Video_Outro
```

### 3. Audio Processing ✅

**ElevenLabs Audio Overlay**:

- ONE audio file: "Doctor [Name]"
- Used in TWO places: Parts 2 and 8
- Video trimmed to match audio duration

**Nodding Duration Matching**:

- Part 4 nodding trimmed to DrVideo1 length
- Part 6 nodding trimmed to DrVideo2 length

### 4. Updated Files

#### Backend Configuration

- ✅ `ErisBluSanta/backend/utils/constants.js`
  - Added `podcast_background` (Podcast_BG.jpg)
  - Updated `buildStitchingPayload()` to include podcast layout config
  - Documented full-screen vs zoom layout usage

#### Stitching Script

- ✅ `blusanta_zoom_stitch.py` (NEW)
  - Implements two-stage stitching
  - Creates podcast zoom layout with side-by-side view
  - Handles audio overlays and nodding duration matching
  - Uses FFmpeg for all video processing

#### Test & Deployment

- ✅ `test-blusanta-zoom.py` - Local test script with sample payload
- ✅ `deploy-blusanta-zoom.sh` - Linux deployment script
- ✅ `deploy-blusanta-zoom.ps1` - Windows deployment script
- ✅ `ErisBluSanta/upload-videos.ps1` - Upload videos to GCS

#### Documentation

- ✅ `BLUSANTA_ZOOM_IMPLEMENTATION.md` - Complete implementation guide

## Video Sequence Breakdown

| #   | Video                                | Layout   | Audio      | Duration  | Description        |
| --- | ------------------------------------ | -------- | ---------- | --------- | ------------------ |
| 1   | 1_Const_Intro.mp4                    | Full     | Original   | Fixed     | Podcast intro      |
| 2   | 2_Doctor_Placeholder.mp4             | Full     | ElevenLabs | Trimmed   | "Doctor [Name]"    |
| 3   | 3_Const_Question_1.mp4               | Full     | Original   | Fixed     | Question 1         |
| 4   | 4_Blusanta_Noding + DrVideo1         | **Zoom** | Original   | Match Dr1 | Q&A segment 1      |
| 5   | 5_Const_Question_2.mp4               | Full     | Original   | Fixed     | Question 2         |
| 6   | 6_Blusanta_Noding + DrVideo2         | **Zoom** | Original   | Match Dr2 | Q&A segment 2      |
| 7   | 7_Const_Blusanta_Thank you.mp4       | Full     | Original   | Fixed     | Thank you          |
| 8   | 8_Doctor_Plc_Blusanta_Thank you.mp4  | Full     | ElevenLabs | Trimmed   | Thank you response |
| 9   | 9_Const_outro_Blusanta_Thank you.mp4 | Full     | Original   | Fixed     | Podcast outro      |

**Final Wrap**:

- Final_Video_Intro.mp4 (full-screen)
- Stitched Podcast Video (from above)
- Final_Video_Outro.mp4 (full-screen)

## Deployment Steps

### 1. Upload Constant Videos to GCS

```powershell
cd ErisBluSanta
.\upload-videos.ps1
```

This uploads all files from `ErisBluSanta/videos/` to:

```
gs://blusanta-campaign-videos/blusanta/constant-videos/english/
```

### 2. Deploy Stitching Script to VM

```powershell
cd "AI Video Training"
.\deploy-blusanta-zoom.ps1
```

This:

- Copies `blusanta_zoom_stitch.py` to `video-stitch-blusanta` VM
- Sets up Python virtual environment
- Installs dependencies (requests)
- Verifies ffmpeg and gsutil

### 3. Update Stitching Service

SSH into the VM and update the service to use the new script:

```bash
gcloud compute ssh video-stitch-blusanta --zone=us-central1-a

# Navigate to service directory
cd ~/video_stitch  # or wherever your service is

# Backup old script
cp zoom_stitch.py zoom_stitch.py.backup

# Copy new script
cp ~/zoom_stitch.py zoom_stitch.py

# Restart service
pm2 restart all
# OR
sudo systemctl restart video-stitch
```

### 4. Test the Flow

Trigger an assessment video generation:

```powershell
# Initiate audio generation
curl -X POST http://localhost:3001/api/blusanta/initiate-audio-generation `
  -H "Content-Type: application/json" `
  -d '{"language": "English"}'

# Monitor logs
# Backend should automatically trigger stitching after audio completes
```

## Payload Example

The backend sends this payload to the stitching service:

```json
{
  "intro_path": "gs://.../1_Const_Intro.mp4",
  "outro_path": "gs://.../9_Const_outro_Blusanta_Thank you.mp4",
  "final_intro_path": "gs://.../Final_Video_Intro.mp4",
  "final_outro_path": "gs://.../Final_Video_Outro.mp4",
  "podcast_background": "gs://.../Podcast_BG.jpg",

  "assets_actor_paths": [
    "gs://.../2_Doctor_Placeholder.mp4",
    "gs://.../3_Const_Question_1.mp4",
    "gs://.../4_Blusanta_Noding.mp4",
    "gs://.../5_Const_Question_2.mp4",
    "gs://.../6_Blusanta_Noding.mp4",
    "gs://.../7_Const_Blusanta_Thank you.mp4",
    "gs://.../8_Doctor_Plc_Blusanta_Thank you.mp4"
  ],

  "assets_doctor_paths": [
    null,
    null,
    "gs://.../e99998_12345678_video1.mp4",
    null,
    "gs://.../e99998_12345678_video2.mp4",
    null,
    null
  ],

  "audio_overlays": [
    {
      "segment_index": 0,
      "audio_path": "gs://.../e99998_12345678_name.mp3",
      "trim_video_to_audio": true
    },
    {
      "segment_index": 6,
      "audio_path": "gs://.../e99998_12345678_name.mp3",
      "trim_video_to_audio": true
    }
  ],

  "nodding_segments": [
    { "nodding_index": 2, "match_duration_of": 2 },
    { "nodding_index": 4, "match_duration_of": 4 }
  ],

  "final_upload_path": "gs://.../results/e99998_12345678_final.mp4",
  "webhook_url": "http://<backend-ip>:3001/api/blusanta/update-after-stitching",
  "additional_data": {
    "id": 1,
    "final_video_url": "https://storage.googleapis.com/.../final.mp4"
  }
}
```

## Key Features

### 1. Podcast Zoom Layout (FFmpeg)

```bash
ffmpeg -loop 1 -i Podcast_BG.jpg \
       -i blusanta.mp4 -i doctor.mp4 \
       -filter_complex "
         [0:v]scale=1920:1080[bg];
         [1:v]scale=640:720[left];
         [2:v]scale=640:720[right];
         [bg][left]overlay=x=140:y=180[tmp];
         [tmp][right]overlay=x=1140:y=180[v]
       " \
       -map "[v]" -map 1:a \
       -t <min_duration> output.mp4
```

### 2. Audio Replacement

```bash
ffmpeg -i video.mp4 -i audio.mp3 \
       -t <audio_duration> \
       -map 0:v -map 1:a \
       -c:v libx264 -c:a aac \
       -shortest output.mp4
```

### 3. Video Trimming

```bash
ffmpeg -i input.mp4 \
       -t <target_duration> \
       -c:v libx264 -c:a aac \
       output.mp4
```

### 4. Concatenation

```bash
# Create concat list
file 'part1.mp4'
file 'part2.mp4'
file 'part3.mp4'

# Concatenate
ffmpeg -f concat -safe 0 -i concat_list.txt \
       -c:v libx264 -c:a aac output.mp4
```

## Testing

### Local Test

```powershell
cd "AI Video Training"

# Edit test-blusanta-zoom.py to add doctor video URLs
# Update assets_doctor_paths indices 2 and 4

python test-blusanta-zoom.py
```

### VM Test

```bash
# SSH into VM
gcloud compute ssh video-stitch-blusanta --zone=us-central1-a

# Test script
source ~/venv-stitch/bin/activate
python ~/zoom_stitch.py

# Check status endpoint
curl http://localhost:8080/status
```

### End-to-End Test

```powershell
# Create test assessment in database
# Trigger audio generation
curl -X POST http://localhost:3001/api/blusanta/initiate-audio-generation

# Check logs
# Backend → ElevenLabs → Stitching → Sheet update → WhatsApp
```

## Troubleshooting

### Issue: Audio overlay not working

**Solution**:

- Verify ElevenLabs audio file exists at specified GCS path
- Check `trim_video_to_audio: true` is set
- Ensure audio format is MP3 44.1kHz

### Issue: Podcast zoom layout shows black boxes

**Solution**:

- Verify Podcast_BG.jpg is 1920x1080
- Check video scaling (640x720)
- Validate overlay positions (140,180 and 1140,180)

### Issue: Nodding videos not trimmed

**Solution**:

- Check `nodding_segments` array has correct indices
- Verify `match_duration_of` points to valid doctor video
- Ensure doctor videos exist and are downloadable

### Issue: Final video concat fails

**Solution**:

- Verify all intermediate videos created successfully
- Check concat_list.txt has correct file paths
- Ensure all videos have same codec/resolution

### Issue: Upload to GCS fails

**Solution**:

- Check GCS bucket permissions
- Verify gsutil is configured correctly
- Ensure service account has write access

## Next Steps

1. ✅ Upload constant videos to GCS
2. ✅ Deploy stitching script to VM
3. ⏳ Test with real assessment data
4. ⏳ Monitor first production run
5. ⏳ Optimize FFmpeg settings for speed/quality
6. ⏳ Add error recovery and retry logic

## Files Summary

| File                                                 | Purpose                              |
| ---------------------------------------------------- | ------------------------------------ |
| `blusanta_zoom_stitch.py`                            | Main stitching script (deploy to VM) |
| `ErisBluSanta/backend/utils/constants.js`            | Config and payload builder           |
| `ErisBluSanta/backend/routes/blusanta-generation.js` | Orchestration                        |
| `test-blusanta-zoom.py`                              | Local testing                        |
| `deploy-blusanta-zoom.ps1`                           | Windows deployment                   |
| `ErisBluSanta/upload-videos.ps1`                     | Upload assets to GCS                 |
| `BLUSANTA_ZOOM_IMPLEMENTATION.md`                    | Technical reference                  |

## Contact

For issues or questions about this implementation, contact the development team.
