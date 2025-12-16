# BluSanta Video Flow - Visual Guide

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        BLUSANTA VIDEO GENERATION                         │
└─────────────────────────────────────────────────────────────────────────┘

1. ASSESSMENT CREATION
   ┌──────────────────┐
   │  MR Upload Form  │
   │  - Doctor info   │
   │  - 2 videos      │
   │  - Pronunciation │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │   Database (DB)  │
   │  - assessments   │
   │  - videos table  │
   └────────┬─────────┘

2. AUDIO GENERATION (ElevenLabs)
            │
            ▼
   ┌──────────────────────────────────────────┐
   │  POST /api/blusanta/initiate-audio-gen   │
   └────────┬─────────────────────────────────┘
            │
            ▼
   ┌──────────────────────────────────────────┐
   │         ElevenLabs API Call              │
   │  Text: "Doctor [First] [Last]"           │
   │  Voice: BluSanta voice ID                │
   │  Output: e99998_12345678_name.mp3        │
   └────────┬─────────────────────────────────┘
            │
            ▼
   ┌──────────────────────────────────────────┐
   │     Upload to GCS                        │
   │  gs://.../audio/names/english/           │
   │     e99998_12345678_name.mp3             │
   └────────┬─────────────────────────────────┘
            │
            ▼
   ┌──────────────────────────────────────────┐
   │  Update DB: audio_generation = 1         │
   └────────┬─────────────────────────────────┘

3. VIDEO STITCHING (Two-Stage Process)
            │
            ▼
   ┌──────────────────────────────────────────┐
   │  POST /api/blusanta/initiate-video-stitch│
   └────────┬─────────────────────────────────┘
            │
            ▼
   ┌──────────────────────────────────────────┐
   │   Stitching VM: video-stitch-blusanta    │
   │   POST http://<vm-ip>:8080/stitching     │
   └────────┬─────────────────────────────────┘
            │
            ▼
   ╔════════════════════════════════════════════╗
   ║     STAGE 1: PODCAST VIDEO (9 parts)      ║
   ╚════════════════════════════════════════════╝
            │
            ├─── Part 1: Intro (full-screen)
            │    └── 1_Const_Intro.mp4
            │
            ├─── Part 2: Name Placeholder (full-screen)
            │    ├── 2_Doctor_Placeholder.mp4
            │    └── [AUDIO OVERLAY] e99998_12345678_name.mp3
            │
            ├─── Part 3: Question 1 (full-screen)
            │    └── 3_Const_Question_1.mp4
            │
            ├─── Part 4: Q&A 1 (PODCAST ZOOM)
            │    ┌─────────────────────────────────────┐
            │    │  Podcast_BG.jpg (1920x1080)         │
            │    │  ┌────────┐        ┌────────┐       │
            │    │  │BluSanta│        │ Doctor │       │
            │    │  │640x720 │        │640x720 │       │
            │    │  └────────┘        └────────┘       │
            │    └─────────────────────────────────────┘
            │    ├── 4_Blusanta_Noding.mp4 (trimmed to Dr1)
            │    └── e99998_12345678_video1.mp4
            │
            ├─── Part 5: Question 2 (full-screen)
            │    └── 5_Const_Question_2.mp4
            │
            ├─── Part 6: Q&A 2 (PODCAST ZOOM)
            │    ┌─────────────────────────────────────┐
            │    │  Podcast_BG.jpg (1920x1080)         │
            │    │  ┌────────┐        ┌────────┐       │
            │    │  │BluSanta│        │ Doctor │       │
            │    │  │640x720 │        │640x720 │       │
            │    │  └────────┘        └────────┘       │
            │    └─────────────────────────────────────┘
            │    ├── 6_Blusanta_Noding.mp4 (trimmed to Dr2)
            │    └── e99998_12345678_video2.mp4
            │
            ├─── Part 7: Thank You (full-screen)
            │    └── 7_Const_Blusanta_Thank you.mp4
            │
            ├─── Part 8: Thank You Placeholder (full-screen)
            │    ├── 8_Doctor_Plc_Blusanta_Thank you.mp4
            │    └── [AUDIO OVERLAY] e99998_12345678_name.mp3
            │
            └─── Part 9: Outro (full-screen)
                 └── 9_Const_outro_Blusanta_Thank you.mp4
            │
            ▼
   ┌──────────────────────────────────────────┐
   │   FFmpeg Concat: podcast_video.mp4       │
   └────────┬─────────────────────────────────┘
            │
            ▼
   ╔════════════════════════════════════════════╗
   ║      STAGE 2: FINAL WRAP (3 parts)        ║
   ╚════════════════════════════════════════════╝
            │
            ├─── Part 1: Campaign Intro
            │    └── Final_Video_Intro.mp4
            │
            ├─── Part 2: Podcast Video
            │    └── podcast_video.mp4 (from Stage 1)
            │
            └─── Part 3: Campaign Outro
                 └── Final_Video_Outro.mp4
            │
            ▼
   ┌──────────────────────────────────────────┐
   │   FFmpeg Concat: final_video.mp4         │
   └────────┬─────────────────────────────────┘
            │
            ▼
   ┌──────────────────────────────────────────┐
   │     Upload to GCS                        │
   │  gs://.../results/                       │
   │     e99998_12345678_final.mp4            │
   └────────┬─────────────────────────────────┘

4. POST-PROCESSING
            │
            ▼
   ┌──────────────────────────────────────────┐
   │  Webhook: /update-after-stitching        │
   └────────┬─────────────────────────────────┘
            │
            ├──▶ Update DB: video_stitch = 1
            │    final_video_url = https://...
            │
            └──▶ Update Google Sheet
                 ├── final_video_url
                 └── video_generated_on

5. QC & DELIVERY
            │
            ▼
   ┌──────────────────────────────────────────┐
   │   Google Apps Script                     │
   │   QC Status Update                       │
   └────────┬─────────────────────────────────┘
            │
            ├─── "Approved" ──▶ Send WhatsApp
            │                   to employee
            │
            └─── "Regenerate" ──▶ Reset flags
                                  audio_generation = 0
                                  video_stitch = 0
```

## Layout Comparison

### Full-Screen Layout (7 segments)

```
┌─────────────────────────────────┐
│                                 │
│                                 │
│         VIDEO CONTENT           │
│         1920 x 1080             │
│         Native Resolution       │
│                                 │
│                                 │
└─────────────────────────────────┘

Used for:
- Intro (Part 1)
- Name Placeholder (Part 2)
- Questions (Parts 3, 5)
- Thank You (Part 7)
- Thank You Placeholder (Part 8)
- Outro (Part 9)
```

### Podcast Zoom Layout (2 segments)

```
┌─────────────────────────────────────────────┐
│    Podcast_BG.jpg (1920 x 1080)             │
│                                             │
│  ┌────────────────┐    ┌────────────────┐  │
│  │                │    │                │  │
│  │   BluSanta     │    │     Doctor     │  │
│  │   (640x720)    │    │    (640x720)   │  │
│  │                │    │                │  │
│  │  Position:     │    │  Position:     │  │
│  │  x=140, y=180  │    │  x=1140,y=180  │  │
│  │                │    │                │  │
│  └────────────────┘    └────────────────┘  │
│                                             │
└─────────────────────────────────────────────┘

Used for:
- Q&A Segment 1 (Part 4)
- Q&A Segment 2 (Part 6)
```

## File Dependencies

### Input Files (GCS)

```
Constant Videos (7):
gs://blusanta-campaign-videos/blusanta/constant-videos/english/
├── 1_Const_Intro.mp4
├── 2_Doctor_Placeholder.mp4
├── 3_Const_Question_1.mp4
├── 4_Blusanta_Noding.mp4
├── 5_Const_Question_2.mp4
├── 6_Blusanta_Noding.mp4
├── 7_Const_Blusanta_Thank you.mp4
├── 8_Doctor_Plc_Blusanta_Thank you.mp4
└── 9_Const_outro_Blusanta_Thank you.mp4

Final Wrap (2):
gs://blusanta-campaign-videos/blusanta/constant-videos/english/
├── Final_Video_Intro.mp4
└── Final_Video_Outro.mp4

Background:
gs://blusanta-campaign-videos/blusanta/constant-videos/english/
└── Podcast_BG.jpg

Audio (1 per assessment):
gs://blusanta-campaign-videos/blusanta/audio/names/english/
└── {employee}_{dr}_name.mp3

Doctor Videos (2 per assessment):
gs://blusanta-campaign-videos/blusanta/results/
├── {employee}_{dr}_video1.mp4
└── {employee}_{dr}_video2.mp4
```

### Output File

```
Final Video:
gs://blusanta-campaign-videos/blusanta/results/
└── {employee}_{dr}_final.mp4
```

## Processing Steps Detail

### Audio Overlay (Parts 2 & 8)

```
Input:  2_Doctor_Placeholder.mp4 (2.95s, original audio)
        e99998_12345678_name.mp3 (0.97s, ElevenLabs)

Process: ffmpeg -i video -i audio -t 0.97 -map 0:v -map 1:a

Output: Part 2 video with ElevenLabs audio (0.97s)
```

### Nodding Trim (Parts 4 & 6)

```
Input:  4_Blusanta_Noding.mp4 (60s)
        e99998_12345678_video1.mp4 (45s, doctor response)

Process: ffmpeg -i nodding -t 45 -c copy

Output: Trimmed nodding video (45s) to match doctor
```

### Podcast Zoom (Parts 4 & 6)

```
Input:  Podcast_BG.jpg (1920x1080)
        4_Blusanta_Noding.mp4 (trimmed to 45s)
        e99998_12345678_video1.mp4 (45s)

Process:
  1. Loop background image
  2. Scale BluSanta to 640x720
  3. Scale Doctor to 640x720
  4. Overlay BluSanta at (140, 180)
  5. Overlay Doctor at (1140, 180)
  6. Use BluSanta audio
  7. Trim to min(45s, 45s) = 45s

Output: Side-by-side video (45s) with podcast layout
```

### Stage 1 Concat (9 → 1)

```
Input:  9 video segments (mix of full-screen and zoom)

Process: ffmpeg -f concat -safe 0 -i concat_list.txt

Output: podcast_video.mp4 (~3-5 minutes)
```

### Stage 2 Concat (3 → 1)

```
Input:  Final_Video_Intro.mp4 (30s)
        podcast_video.mp4 (3-5 min)
        Final_Video_Outro.mp4 (30s)

Process: ffmpeg -f concat -safe 0 -i final_concat.txt

Output: final_video.mp4 (~4-6 minutes total)
```

## Timing Estimates

```
Audio Generation (ElevenLabs):     ~10s
├── API call                       5s
├── TTS processing                 3s
└── Upload to GCS                  2s

Stage 1: Podcast Video:            ~180s (3 min)
├── Download inputs                30s
├── Audio overlay (x2)             20s
├── Nodding trim (x2)              10s
├── Podcast zoom (x2)              60s
└── Concat (9 parts)               60s

Stage 2: Final Wrap:               ~30s
├── Download intro/outro           10s
└── Concat (3 parts)               20s

Upload & Webhook:                  ~20s
├── Upload final video             15s
└── Webhook callback               5s

Total per Assessment:              ~240s (4 minutes)
```

## Error Handling

```
┌─────────────────────────────────────────────┐
│              Error Recovery                 │
└─────────────────────────────────────────────┘

ElevenLabs Fails
   └──▶ Retry 3 times with exponential backoff
        └──▶ If still fails: audio_generation = -1

Download Fails
   └──▶ Validate GCS paths before processing
        └──▶ Mark assessment with error_message

FFmpeg Fails
   └──▶ Capture stderr, log detailed error
        └──▶ Set video_stitch = -1

Upload Fails
   └──▶ Retry upload 3 times
        └──▶ If fails: Keep local copy, alert admin

Webhook Fails
   └──▶ Non-blocking, log warning
        └──▶ Backend will poll DB for completion
```

## Monitoring Points

```
Database Queries:
  SELECT COUNT(*) FROM assessments
  WHERE audio_generation = 0 AND avatar_name = 'blusanta'
  → Pending audio generation

  SELECT COUNT(*) FROM assessments
  WHERE audio_generation = 1 AND video_stitch = 0 AND avatar_name = 'blusanta'
  → Pending stitching

  SELECT COUNT(*) FROM assessments
  WHERE video_stitch = -1 AND avatar_name = 'blusanta'
  → Failed stitching

API Endpoints:
  GET http://<vm-ip>:8080/status
  → {"status": "free|busy"}

  GET http://localhost:3001/api/blusanta/queue-status
  → {"audio_pending": 5, "stitch_pending": 3}

GCS Monitoring:
  gsutil ls -lh gs://blusanta-campaign-videos/blusanta/results/ | wc -l
  → Count of completed videos
```

This visual guide shows the complete end-to-end flow of the BluSanta video generation system!
