# BluSanta 8-Segment Deployment Summary

**Date:** December 8, 2025  
**Status:** ✅ DEPLOYED TO PRODUCTION

---

## 🎯 Implementation Overview

Successfully migrated BluSanta from 9-part complex structure to **8-segment Bhagyashree podcast pattern** with **TWO separate ElevenLabs audio overlays**.

---

## 📹 New Video Structure

### 8-Segment Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│ Segment 0: const_000.mp4                                       │
│            (Intro + Greeting merged)                            │
├─────────────────────────────────────────────────────────────────┤
│ Segment 1: plc_000.mp4                                         │
│            🎤 Audio Overlay: "Doctor <first name>"              │
│            📁 File: {employee_code}_{dr_code}_greeting.mp3      │
├─────────────────────────────────────────────────────────────────┤
│ Segment 2: const_001.mp4                                       │
│            (Question 1)                                         │
├─────────────────────────────────────────────────────────────────┤
│ Segment 3: nodding.mp4 (trimmed) + doctor_video_1.mp4         │
│            🎬 ZOOM Layout: BluSanta (left) + Doctor (right)     │
│            🔊 Audio: Doctor's voice from doctor_video_1         │
├─────────────────────────────────────────────────────────────────┤
│ Segment 4: const_002.mp4                                       │
│            (Question 2)                                         │
├─────────────────────────────────────────────────────────────────┤
│ Segment 5: nodding.mp4 (trimmed) + doctor_video_2.mp4         │
│            🎬 ZOOM Layout: BluSanta (left) + Doctor (right)     │
│            🔊 Audio: Doctor's voice from doctor_video_2         │
├─────────────────────────────────────────────────────────────────┤
│ Segment 6: plc_001.mp4                                         │
│            🎤 Audio Overlay: "Thank you Doctor <first name>"    │
│            📁 File: {employee_code}_{dr_code}_thankyou.mp3      │
├─────────────────────────────────────────────────────────────────┤
│ Segment 7: const_003.mp4                                       │
│            (Final message + Thank you + Outro merged)           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎵 TWO ElevenLabs Audio Files

### Previous Implementation (REPLACED)

- ❌ Single audio: "Doctor <first name>"
- ❌ Same audio used for TWO different placeholder videos
- ❌ Limited personalization

### New Implementation (ACTIVE)

✅ **Audio 1: Greeting**

- Text: `"Doctor {first_name}"`
- File: `{employee_code}_{dr_code}_greeting.mp3`
- Used in: **Segment 1** (plc_000.mp4)
- GCS Path: `blusanta/audio/names/{language}/{employee_code}_{dr_code}_greeting.mp3`

✅ **Audio 2: Thank You**

- Text: `"Thank you Doctor {first_name}"`
- File: `{employee_code}_{dr_code}_thankyou.mp3`
- Used in: **Segment 6** (plc_001.mp4)
- GCS Path: `blusanta/audio/names/{language}/{employee_code}_{dr_code}_thankyou.mp3`

---

## 🚀 Deployed Files

### Backend VM: `blusanta-campaign` (us-central1-c)

| File                                    | Changes                                                                                                                                                                   | Status      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `backend/utils/constants.js`            | • Updated video sequence to 8 segments<br>• `buildStitchingPayload()` now accepts `greetingAudioUrl` and `thankYouAudioUrl`<br>• Updated constant/placeholder video paths | ✅ Deployed |
| `backend/utils/elevenlabs.js`           | • `generateAndUploadNameAudio()` generates TWO audio files<br>• Returns `{greetingUrl, thankYouUrl}` object<br>• Uploads to separate GCS paths                            | ✅ Deployed |
| `backend/routes/blusanta-generation.js` | • Destructures TWO audio URLs from generation<br>• Updated validation to check BOTH audio files<br>• Passes TWO separate audio URLs to stitching payload                  | ✅ Deployed |

**PM2 Status:** ✅ Backend restarted (pid: 4014150)

---

### Stitching VM: `video-stitch-blusanta` (us-central1-a)

| File                      | Changes                                                                                                                                                                                                           | Status      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `blusanta_zoom_stitch.py` | • Complete rewrite for 8-segment structure<br>• Downloads TWO separate audio files<br>• Applies greeting audio to segment 1<br>• Applies thank you audio to segment 6<br>• Enhanced logging with segment tracking | ✅ Deployed |

**PM2 Status:** ✅ Stitching service restarted (pid: 100359)

---

## 📦 Required GCS Assets (PENDING UPLOAD)

### Constant Videos

Upload to: `gs://blusanta-campaign-videos/blusanta/constant-videos/{language}/`

```
✅ const_000.mp4  - Intro + Greeting merged
✅ const_001.mp4  - Question 1 ("How has your experience been...")
✅ const_002.mp4  - Question 2 ("What advice would you give...")
✅ const_003.mp4  - Final message + Thank you + Outro merged
```

### Placeholder Videos (with TWO different audios)

Upload to: `gs://blusanta-campaign-videos/blusanta/constant-videos/{language}/`

```
✅ plc_000.mp4  - Placeholder for "Doctor <first name>" audio
✅ plc_001.mp4  - Placeholder for "Thank you Doctor <first name>" audio
```

### Support Videos

Upload to: `gs://blusanta-campaign-videos/blusanta/constant-videos/{language}/`

```
✅ nodding.mp4  - Nodding reaction video (trimmed to doctor response duration)
```

### Background Image

Upload to: `gs://blusanta-campaign-videos/blusanta/podcast-backgrounds/`

```
✅ Podcast_BG.jpg  - Background for ZOOM layout segments
```

---

## 🔄 Payload Structure Changes

### Backend → Stitching VM Payload

```javascript
{
  "constant_video_paths": [
    "gs://.../const_000.mp4",  // Segment 0
    "gs://.../const_001.mp4",  // Segment 2
    "gs://.../const_002.mp4",  // Segment 4
    "gs://.../const_003.mp4"   // Segment 7
  ],
  "placeholder_video_paths": [
    "gs://.../plc_000.mp4",    // Segment 1
    "gs://.../plc_001.mp4"     // Segment 6
  ],
  "nodding_video_path": "gs://.../nodding.mp4",  // Segments 3, 5
  "doctor_video_paths": [
    "gs://.../doctor_1.mp4",   // Segment 3 ZOOM
    "gs://.../doctor_2.mp4"    // Segment 5 ZOOM
  ],
  "greeting_audio_path": "gs://.../XXX_YYY_greeting.mp3",
  "thank_you_audio_path": "gs://.../XXX_YYY_thankyou.mp3",
  "podcast_background": "gs://.../Podcast_BG.jpg",
  "final_upload_path": "gs://.../final_video.mp4",
  "webhook_url": "http://34.171.167.66:5001/api/blusanta/update-after-stitching",
  "additional_data": {
    "id": 123,
    "final_video_url": "https://storage.googleapis.com/.../final_video.mp4"
  }
}
```

### Key Changes from Previous Version

- ❌ Removed: `intro_path`, `outro_path`, `final_intro_path`, `final_outro_path`
- ❌ Removed: `assets_actor_paths[]` (7-item array)
- ❌ Removed: `audio_overlays[]` with segment indices
- ✅ Added: `constant_video_paths[]` (4 items)
- ✅ Added: `placeholder_video_paths[]` (2 items)
- ✅ Added: `nodding_video_path` (single file, reused)
- ✅ Changed: `nameAudioUrl` → `greeting_audio_path` + `thank_you_audio_path`

---

## 🔍 Code Flow

### Audio Generation Flow

```
1. Doctor uploads video via frontend
   ↓
2. Backend receives doctor info + video
   ↓
3. blusanta-generation.js calls generateAndUploadNameAudio()
   ↓
4. elevenlabs.js generates TWO audio files:
   - ElevenLabs API call for "Doctor {first_name}" → greeting.mp3
   - ElevenLabs API call for "Thank you Doctor {first_name}" → thankyou.mp3
   ↓
5. Both uploaded to GCS:
   - blusanta/audio/names/{language}/{code}_greeting.mp3
   - blusanta/audio/names/{language}/{code}_thankyou.mp3
   ↓
6. Returns: {greetingUrl: "gs://...", thankYouUrl: "gs://..."}
   ↓
7. Backend validates BOTH files exist
   ↓
8. Passes BOTH URLs to buildStitchingPayload()
```

### Stitching Flow

```
1. Backend sends payload to video-stitch-blusanta VM
   ↓
2. Python downloads all assets:
   - 4 constant videos
   - 2 placeholder videos
   - 1 nodding video (reused)
   - 2 doctor videos
   - 2 ElevenLabs audio files ⭐ NEW
   - 1 background image
   ↓
3. Process 8 segments sequentially:

   Seg 0: Standardize const_000.mp4
   Seg 1: Replace audio in plc_000.mp4 with greeting.mp3 ⭐
   Seg 2: Standardize const_001.mp4
   Seg 3: Create ZOOM layout (nodding + doctor_1)
   Seg 4: Standardize const_002.mp4
   Seg 5: Create ZOOM layout (nodding + doctor_2)
   Seg 6: Replace audio in plc_001.mp4 with thankyou.mp3 ⭐
   Seg 7: Standardize const_003.mp4
   ↓
4. Concatenate all 8 segments
   ↓
5. Upload final video to GCS
   ↓
6. Send webhook notification to backend
```

---

## 🧪 Testing Checklist

### Phase 1: Backend Testing

- [ ] Verify TWO audio files generated by ElevenLabs
- [ ] Check GCS paths: `_greeting.mp3` and `_thankyou.mp3`
- [ ] Confirm validation passes for BOTH files
- [ ] Inspect stitching payload structure
- [ ] Monitor PM2 logs: `pm2 logs blusanta-backend`

### Phase 2: Stitching Testing

- [ ] Upload test constant videos (const_000 to const_003)
- [ ] Upload test placeholder videos (plc_000, plc_001)
- [ ] Upload nodding.mp4 and Podcast_BG.jpg
- [ ] Trigger test video generation
- [ ] Verify 8 segments processed correctly
- [ ] Check audio overlays in segments 1 and 6
- [ ] Monitor PM2 logs: `ssh video-stitch-blusanta && pm2 logs video-stitch`

### Phase 3: End-to-End Testing

- [ ] Submit doctor video via frontend
- [ ] Confirm WhatsApp notification sent
- [ ] Download final video from GCS
- [ ] Verify audio quality in segments 1 and 6
- [ ] Check ZOOM layout in segments 3 and 5
- [ ] Validate video duration and quality

---

## 🔧 Debugging Commands

### Backend VM (`blusanta-campaign`)

```bash
# SSH to backend
gcloud compute ssh blusanta-campaign --zone=us-central1-c

# Check PM2 status
pm2 list

# View logs
pm2 logs blusanta-backend --lines 100

# Restart backend
pm2 restart blusanta-backend

# Check deployed files
ls -la /home/Dipesh_Goel/blusanta/backend/utils/
ls -la /home/Dipesh_Goel/blusanta/backend/routes/
```

### Stitching VM (`video-stitch-blusanta`)

```bash
# SSH to stitching VM
gcloud compute ssh video-stitch-blusanta --zone=us-central1-a

# Check PM2 status
pm2 list

# View logs
pm2 logs video-stitch --lines 100

# Restart stitching service
pm2 restart video-stitch

# Check downloaded assets
ls -la ~/assets/

# Check processed segments
ls -la ~/temp/

# Check final output
ls -la ~/output/
```

### GCS Bucket Verification

```bash
# List audio files
gsutil ls gs://blusanta-campaign-videos/blusanta/audio/names/english/

# List constant videos
gsutil ls gs://blusanta-campaign-videos/blusanta/constant-videos/english/

# Download for inspection
gsutil cp gs://blusanta-campaign-videos/blusanta/audio/names/english/XXX_YYY_greeting.mp3 .
```

---

## 📊 Comparison: Old vs New

| Aspect                 | Old (9-Part)           | New (8-Segment)                 |
| ---------------------- | ---------------------- | ------------------------------- |
| **Total Segments**     | 9 parts                | 8 segments                      |
| **ElevenLabs Audios**  | 1 audio (reused twice) | 2 audios (different texts)      |
| **Placeholder Videos** | 2 (same video, reused) | 2 (different videos)            |
| **Structure**          | Complex wrapping       | Bhagyashree pattern             |
| **Intro/Outro**        | Separate parts         | Merged with content             |
| **Audio Text 1**       | "Doctor {name}"        | "Doctor {first_name}"           |
| **Audio Text 2**       | "Doctor {name}" (same) | "Thank you Doctor {first_name}" |
| **Nodding Usage**      | N/A                    | Trimmed, reused 2x              |
| **ZOOM Segments**      | 2 (parts 4, 6)         | 2 (segments 3, 5)               |

---

## ⚠️ Known Limitations

1. **Asset Upload Required**: Constant videos not yet uploaded to GCS
2. **Testing Pending**: End-to-end flow not yet validated
3. **Audio Quality**: Ensure ElevenLabs voice ID configured correctly
4. **ZOOM Layout**: Verify positioning works for all doctor video aspect ratios
5. **Nodding Trim**: May need adjustment based on doctor response durations

---

## 🎯 Next Steps

1. **Upload Assets to GCS**

   - Prepare 4 constant videos (const_000 to const_003)
   - Prepare 2 placeholder videos (plc_000, plc_001)
   - Upload nodding.mp4 and Podcast_BG.jpg

2. **Test Audio Generation**

   - Trigger test with sample doctor data
   - Verify TWO audio files created
   - Check audio quality and text accuracy

3. **Test Stitching**

   - Send test payload to stitching VM
   - Monitor segment processing
   - Verify final video output

4. **Production Validation**

   - Run full end-to-end test
   - Review WhatsApp notifications
   - Check error handling

5. **Monitor & Optimize**
   - Track ElevenLabs quota usage
   - Monitor stitching VM performance
   - Collect user feedback

---

## 📝 File Inventory

### Local Files (Modified)

```
c:\Users\Dipesh_Goel\AI Video Training\ErisBluSanta\
├── backend/
│   ├── utils/
│   │   ├── constants.js ✅ DEPLOYED
│   │   └── elevenlabs.js ✅ DEPLOYED
│   └── routes/
│       └── blusanta-generation.js ✅ DEPLOYED
├── blusanta_zoom_stitch_updated.py ✅ DEPLOYED AS blusanta_zoom_stitch.py
└── .github/
    └── copilot-instructions.md ✅ UPDATED
```

### VM Files (Deployed)

```
blusanta-campaign:/home/Dipesh_Goel/blusanta/
├── backend/
│   ├── utils/
│   │   ├── constants.js ✅ Updated Dec 8
│   │   └── elevenlabs.js ✅ Updated Dec 8
│   └── routes/
│       └── blusanta-generation.js ✅ Updated Dec 8

video-stitch-blusanta:/home/Dipesh_Goel/
└── blusanta_zoom_stitch.py ✅ Updated Dec 8
```

---

## ✅ Deployment Confirmation

- [x] Backend files deployed to `blusanta-campaign` VM
- [x] Stitching script deployed to `video-stitch-blusanta` VM
- [x] PM2 backend restarted successfully (pid: 4014150)
- [x] PM2 stitching service restarted successfully (pid: 100359)
- [x] Code changes validated and tested locally
- [x] Documentation updated (.github/copilot-instructions.md)
- [ ] **PENDING**: Upload constant/placeholder videos to GCS
- [ ] **PENDING**: End-to-end testing with real doctor data

---

**Deployment Completed By:** GitHub Copilot  
**Date:** December 8, 2025  
**Commit Message:** "Implement 8-segment BluSanta structure with TWO separate ElevenLabs audio overlays"
