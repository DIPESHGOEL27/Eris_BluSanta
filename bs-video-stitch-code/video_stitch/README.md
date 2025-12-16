# Video Stitch Module - Podcast-Style Video Generation with Dynamic Zoom Effects

## Overview

This module provides a complete pipeline for creating professional podcast-style videos with dynamic zoom-in/zoom-out transitions between two video participants (actor/host and doctor/guest). The system creates the appearance of a video conference or interview format where participants are shown side-by-side with smooth animated transitions.

## Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Video Layout Specifications](#video-layout-specifications)
4. [Animation System](#animation-system)
5. [File Structure](#file-structure)
6. [Module Documentation](#module-documentation)
7. [API Reference](#api-reference)
8. [Cloud Integration](#cloud-integration)
9. [Subtitle System](#subtitle-system)
10. [Configuration](#configuration)
11. [Deployment](#deployment)
12. [Troubleshooting](#troubleshooting)

---

## Features

- **Dynamic Zoom Transitions**: Smooth cosine-based zoom animations for a natural, professional feel
- **Side-by-Side Layout**: Split-screen podcast layout (900x540 pixels for each participant)
- **Automatic Subtitle Generation**: Integration with OpenAI Whisper API for speech-to-text
- **Multi-language Support**: English and Hindi (Hinglish) subtitle generation
- **Cloud Integration**: Full support for both AWS S3 and Google Cloud Storage
- **Webhook Notifications**: Automated callbacks on completion or failure
- **Audio Processing**: EBU R128 loudness normalization and fade-out effects
- **Name Label Overlays**: Dynamic participant name labels during split-screen mode

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           VIDEO STITCHING PIPELINE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │   CLOUD     │    │  DOWNLOAD   │    │  SUBTITLE   │    │   VIDEO     │  │
│  │  STORAGE    │───▶│   ASSETS    │───▶│ GENERATION  │───▶│ PROCESSING  │  │
│  │  (GCS/S3)   │    │   (Local)   │    │  (Whisper)  │    │  (FFmpeg)   │  │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘  │
│                                                                   │         │
│                                                                   ▼         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │  WEBHOOK    │◀───│   UPLOAD    │◀───│   AUDIO     │◀───│    ZOOM     │  │
│  │  CALLBACK   │    │  TO CLOUD   │    │ NORMALIZE   │    │   STITCH    │  │
│  │             │    │             │    │ (loudnorm)  │    │  (FFmpeg)   │  │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Flow

1. **Cloud Storage**: Assets downloaded from GCS or S3
2. **Download Assets**: All videos, fonts, backgrounds, subtitles cached locally
3. **Subtitle Generation**: Whisper API transcribes audio to ASS subtitles
4. **Video Processing**: FFmpeg normalizes and prepares video segments
5. **Zoom Stitch**: Core FFmpeg filter creates split-screen with transitions
6. **Audio Normalize**: EBU R128 loudness normalization applied
7. **Upload to Cloud**: Final video uploaded to destination
8. **Webhook Callback**: Backend notified of success/failure

---

## Video Layout Specifications

### Frame Dimensions

| Mode | Width | Height | Description |
|------|-------|--------|-------------|
| Full Screen | 1920px | 1080px | Single participant fills entire frame |
| Split Screen (Left) | 900px | 540px | Left participant in podcast layout |
| Split Screen (Right) | 900px | 540px | Right participant in podcast layout |

### Split-Screen Positions

```
┌──────────────────────────────────────────────────────────────────┐
│                        1920 x 1080                                │
│                                                                   │
│     x=30                              x=980                       │
│     ┌──────────────────┐              ┌──────────────────┐       │
│     │ ████████████████ │              │ ████████████████ │       │
│     │ █              █ │              │ █              █ │       │
│ y=  │ █  LEFT VIDEO  █ │              │ █ RIGHT VIDEO  █ │       │
│ 266 │ █  (Bhagyashree)█ │  50px gap   │ █  (Doctor)    █ │       │
│     │ █   900x540    █ │              │ █   900x540    █ │       │
│     │ ████████████████ │              │ ████████████████ │       │
│     └──────────────────┘              └──────────────────┘       │
│          10px white border                 10px white border      │
│                                                                   │
│     BHAGYASHREE                       DR. [NAME]                  │
│     (Name Label)                      (Name Label)                │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Position Values

| Element | X Position | Y Position | Notes |
|---------|------------|------------|-------|
| Left Video | 30 | 266 | With margin |
| Right Video | 980 | 266 | 30 + 900 + 50 gap = 980 |
| Left Name Label | 50 | 760 | Below video frame |
| Right Name Label | 1000 | 760 | Below video frame |

---

## Animation System

### Cosine Interpolation

The zoom effect uses cosine interpolation for smooth easing:

```
Formula: 0.5 * (1 - cos(PI * t / duration))

At t = 0:        result = 0   (starting position)
At t = duration: result = 1   (ending position)
```

This creates a smooth ease-in-ease-out effect with no sudden starts or stops.

### Animation Phases

```
Time ─────────────────────────────────────────────────────────────────▶

Phase 1          Phase 2                            Phase 3
ZOOM OUT         HOLD (Split-Screen)                ZOOM IN
(0s to 1s)       (1s to duration)                   (duration to duration+1s)
    │                    │                                │
    │  ┌──────┐         │  ┌────┐    ┌────┐             │  ┌──────┐
    │  │      │         │  │LEFT│    │RGHT│             │  │      │
    │  │ LEFT │  ───▶   │  │    │    │    │   ───▶      │  │ LEFT │
    │  │      │         │  └────┘    └────┘             │  │      │
    │  └──────┘         │                               │  └──────┘
    │                    │                                │
    │  Full Screen       │  Both Visible                 │  Full Screen
    │  1920x1080         │  Side-by-side                 │  1920x1080
    │                    │                                │
```

### FFmpeg Expression Variables

| Expression | Description | Animation Range |
|------------|-------------|-----------------|
| `width_expr` | Controls left video width | 1920 → 900 → 1920 |
| `height_expr` | Controls left video height | 1080 → 540 → 1080 |
| `overlay_x_expr_left` | Left video X position | 0 → 30 → 0 |
| `overlay_y_expr` | Both videos Y position | 0 → 266 → 0 |
| `overlay_x_expr_right` | Right video X position | 1920 → 980 → 1920 |

---

## File Structure

```
video_stitch/
│
├── zoom_stitch.py              # Main video stitching module
│   ├── get_duration()          # Get media file duration via FFprobe
│   ├── process_video()         # Loop/trim video to target duration
│   ├── zoom_stitch()           # Core split-screen zoom effect
│   ├── get_stream_duration()   # Get video/audio stream duration
│   ├── video_generator()       # Main orchestration function
│   ├── final_stitching()       # Concatenate with audio processing
│   ├── remote_video_stitching()# Cloud-based API entry point
│   ├── s3_to_https()           # Convert S3 URI to HTTPS URL
│   ├── gcp_to_https()          # Convert GCS URI to HTTPS URL
│   ├── handle_response()       # Send webhook notifications
│   ├── download_from_cloud()   # Download from GCS/S3
│   └── upload_to_cloud()       # Upload to GCS/S3
│
├── test.py                     # Local testing script
│
├── utils/
│   ├── subtitles_generator.py  # Whisper API subtitle generation
│   │   ├── transcribe_with_whisper_api()  # API transcription
│   │   ├── generate_subtitles()           # Full subtitle pipeline
│   │   └── format_ass_timestamp()         # Time formatting
│   │
│   ├── srt_gen.py              # Local Whisper subtitle generation
│   │   ├── generate_srt()      # Generate SRT from audio
│   │   └── format_time()       # Time formatting for SRT
│   │
│   └── logging_config.py       # Logging configuration
│       ├── setup_logging()     # Configure logger
│       └── log_session_breaker()# Session delimiter
│
├── subtitles/                  # Pre-made subtitle files (ASS format)
│   ├── const_000.ass           # Intro subtitle
│   ├── const_002.ass           # Question 1 subtitle
│   └── const_004.ass           # Question 2 subtitle
│
├── logs/
│   └── server.log              # Application logs (rotating)
│
├── Dockerfile                  # Container build configuration
├── build_and_run.sh            # Docker build/run script
├── .env                        # Environment variables
└── *.ttf                       # Font files (Lato, Montserrat)
```

---

## Module Documentation

### zoom_stitch.py (Main Module)

The core video stitching module that creates podcast-style videos with dynamic zoom transitions.

#### Key Functions

##### `get_duration(file_path)`
Get media file duration using FFprobe.

```python
duration = get_duration("/path/to/video.mp4")
# Returns: 30.5 (float, seconds)
```

##### `process_video(video_path, target_duration, loop=True)`
Loop or trim a video to match target duration.

```python
# Loop a 5-second video to 30 seconds
processed = process_video("nodding.mp4", 30, loop=True)

# Trim a 60-second video to 30 seconds
processed = process_video("long.mp4", 30, loop=False)
```

##### `zoom_stitch(left_video, right_video, zoom_bg, output_video, driving_flag, emp_name, font_path, text_font_path)`
Create podcast-style video with zoom transitions.

```python
zoom_stitch(
    left_video="actor.mp4",      # Host/Bhagyashree video
    right_video="doctor.mp4",    # Guest/Doctor video
    zoom_bg="background.png",    # Podcast background
    output_video="output.mp4",   # Output path
    driving_flag="right",        # Which video drives duration
    emp_name="Dr. Smith",        # Doctor name for label
    font_path="Lato-Regular.ttf",
    text_font_path="Montserrat-SemiBold.ttf"
)
```

##### `video_generator(...)`
Main orchestration function for complete video generation.

```python
video_generator(
    assets_actor="/path/to/actor/videos/",
    assets_doctor="/path/to/doctor/videos/",
    zoom_bg="background.png",
    output_dir="/output/",
    emp_name="Dr. Smith",
    sub_dir="/subtitles/",
    font_path="Lato-Regular.ttf",
    text_font_path="Montserrat-SemiBold.ttf",
    vid_lang="en",  # or "hi" for Hindi
    intro_video_path="intro.mp4",
    outro_video_path="outro.mp4"
)
```

##### `remote_video_stitching(input_obj)`
Cloud-based entry point for API requests.

```python
request = {
    "subtitle_name": "Dr. Smith",
    "background_image": "gs://bucket/bg.png",
    "font_path": "gs://bucket/Lato-Regular.ttf",
    "text_font_path": "gs://bucket/Montserrat-SemiBold.ttf",
    "subtitle_files": "gs://bucket/subtitles/",
    "assets_actor_paths": ["gs://bucket/actor/v0.mp4", ...],
    "assets_doctor_paths": ["gs://bucket/doctor/v0.mp4", ...],
    "video_language": "en",
    "employee_name": "Dr. Smith",
    "final_upload_path": "gs://bucket/output/final.mp4",
    "webhook_url": "https://api.example.com/callback",
    "intro_path": "gs://bucket/intro.mp4",
    "outro_path": "gs://bucket/outro.mp4"
}
remote_video_stitching(request)
```

---

### subtitles_generator.py (Subtitle Module)

Generates subtitles using OpenAI Whisper API with word-level timestamps.

#### Key Functions

##### `transcribe_with_whisper_api(audio_path, video_language='en')`
Transcribe audio using Whisper API.

```python
result = transcribe_with_whisper_api("/path/to/audio.mp3")
# Returns: Whisper API response with segments and timestamps
```

##### `generate_subtitles(video_path, output_format='ass', language='en')`
Generate subtitle file from video.

```python
subtitle_path = generate_subtitles(
    video_path="video.mp4",
    output_format="ass",  # ASS format for styling
    language="en"         # or "hi" for Hindi
)
# Returns: "/path/to/subtitles/video.ass"
```

#### Name Correction System

The module includes automatic correction for commonly misheard names:

```python
name_replacements = {
    r'\blakshman\b': 'Laxman',
    r'\blaksman\b': 'Laxman',
    r'\bluckshman\b': 'Laxman',
    # ... more variants
    r'\bVBS\b': 'VVS',
    r'\bBBS\b': 'VVS',
}
```

---

### logging_config.py (Logging Module)

Configures application logging with file rotation and console output.

#### Features

- **Timezone**: Asia/Kolkata (IST)
- **Log Format**: `YYYY-MM-DD HH:MM:SS [INFO] message`
- **File Handler**: Rotating file with 5MB max size, 3 backups
- **Console Handler**: Real-time console output

```python
from utils.logging_config import logger, log_session_breaker

logger.info("Processing started")
log_session_breaker()  # Adds session delimiter
```

---

## API Reference

### Remote Video Stitching Request

**Endpoint**: Called by web server, invokes `remote_video_stitching()`

**Request Body**:

```json
{
    "subtitle_name": "Dr. Disha Shah",
    "background_image": "gs://bucket/assets/bg_zoom.png",
    "font_path": "gs://bucket/assets/Lato-Regular.ttf",
    "text_font_path": "gs://bucket/assets/Montserrat-SemiBold.ttf",
    "subtitle_files": "gs://bucket/assets/subtitles",
    "intro_path": "gs://bucket/assets/intro.mp4",
    "outro_path": "gs://bucket/assets/outro.mp4",
    "assets_actor_paths": [
        "gs://bucket/actor/video_00.mp4",
        "gs://bucket/actor/video_01.mp4",
        "gs://bucket/actor/video_02.mp4",
        "gs://bucket/actor/video_03.mp4",
        "gs://bucket/actor/video_04.mp4",
        "gs://bucket/actor/video_05.mp4",
        "gs://bucket/actor/video_06.mp4",
        "gs://bucket/actor/video_07.mp4",
        "gs://bucket/actor/video_08.mp4",
        "gs://bucket/actor/video_09.mp4",
        "gs://bucket/actor/video_10.mp4"
    ],
    "assets_doctor_paths": [
        "gs://bucket/doctor/video_00.mp4",
        "gs://bucket/doctor/video_01.mp4",
        "gs://bucket/doctor/video_02.mp4",
        "gs://bucket/doctor/response_01.mp4",
        "gs://bucket/doctor/video_04.mp4",
        "gs://bucket/doctor/response_02.mp4",
        "gs://bucket/doctor/video_06.mp4",
        "gs://bucket/doctor/response_03.mp4",
        "gs://bucket/doctor/video_08.mp4",
        "gs://bucket/doctor/response_04.mp4",
        "gs://bucket/doctor/video_10.mp4"
    ],
    "video_language": "en",
    "employee_name": "Dr. Disha Shah",
    "final_upload_path": "gs://bucket/results/final.mp4",
    "webhook_url": "https://api.example.com/stitch-complete",
    "failure_webhook_url": "https://api.example.com/stitch-failed",
    "additional_data": {
        "assessment_id": 12345
    }
}
```

### Webhook Response

**Success Webhook**:

```json
{
    "final_upload_path": "https://storage.googleapis.com/bucket/results/final.mp4",
    "employee_name": "Dr. Disha Shah",
    "additional_data": {
        "assessment_id": 12345
    }
}
```

---

## Cloud Integration

### Google Cloud Storage (GCS)

**URI Format**: `gs://bucket-name/path/to/file`

**Commands Used**:
```bash
# Download file
gcloud storage cp gs://bucket/file.mp4 /local/file.mp4

# Download folder
gcloud storage cp -r gs://bucket/folder/* /local/folder/

# Upload file
gcloud storage cp /local/file.mp4 gs://bucket/file.mp4
```

### Amazon S3

**URI Format**: `s3://bucket-name/path/to/file`

**Commands Used**:
```bash
# Download file
aws s3 cp s3://bucket/file.mp4 /local/file.mp4

# Download folder
aws s3 cp --recursive s3://bucket/folder /local/folder/

# Upload file
aws s3 cp /local/file.mp4 s3://bucket/file.mp4
```

### URL Conversion

| Cloud URI | HTTPS URL |
|-----------|-----------|
| `gs://bucket/path/file.mp4` | `https://storage.googleapis.com/bucket/path/file.mp4` |
| `s3://bucket/path/file.mp4` | `https://bucket.s3.us-east-1.amazonaws.com/path/file.mp4` |

---

## Subtitle System

### ASS File Format

The system uses Advanced SubStation Alpha (ASS) format for rich subtitle styling.

**Example ASS File**:

```
[Script Info]
Title: Generated Subtitles
Original Script: Whisper API
ScriptType: v4.00
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default, Arial, 40, &H00FFFFFF, &H000000FF, &H00000000, &H00000000, 0, 0, 0, 0, 100, 100, 0, 0, 3, 1, 1, 2, 30, 30, 110, 1

[Events]
Format: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: Marked=0,0:00:00.00,0:00:06.00,Default,,0,0,0,,Hello and welcome to the podcast.
```

### Subtitle Processing by Segment

| Segment | English | Hindi | Notes |
|---------|---------|-------|-------|
| 0 | Pre-made | Pre-made | Actor intro |
| 1 | Pre-made (personalized) | Pre-made | Doctor introduction |
| 2 | Pre-made | Pre-made | Question 1 |
| 3 | Auto-generated | Pre-made | Doctor response 1 |
| 4 | Pre-made | Pre-made | Question 2 |
| 5 | Auto-generated | Pre-made | Doctor response 2 |
| ... | ... | ... | ... |

### Subtitle Personalization

The system replaces placeholder doctor names with actual names:

**English Template**:
```
"I am excited to be here with Dr. Dhananjay Kumar, an expert in respiratory and allergy"
→ "I am excited to be here with Dr. {subtitle_name}, an expert in respiratory and allergy"
```

**Hindi Template**:
```
"Mere sath he Dr. Rudroneel Ghosh, jo respiratory aur allergy se judi conditions ke ek expert hain."
→ "Mere sath he Dr. {subtitle_name}, jo respiratory aur allergy se judi conditions ke ek expert hain."
```

---

## Configuration

### Environment Variables (.env)

```bash
# OpenAI API Key for Whisper transcription
OPENAI_API_KEY="sk-proj-xxxxx"
```

### Docker Configuration

**Base Image**: `us-central1-docker.pkg.dev/sage-shard-448708-v9/inference/ffmpeg-server-base:latest`

**Environment Variables in Container**:
```
DATA_CLOUD=gcp
MODEL_NAME=vs_bhagyashree
OPENAI_API_KEY=<your-api-key>
```

---

## Deployment

### Docker Build & Run

```bash
# Build the container
./build_and_run.sh build

# Run the container
./build_and_run.sh run

# Build and run
./build_and_run.sh both

# Stop and save logs
./build_and_run.sh stop

# Destroy container and image
./build_and_run.sh destroy
```

### Container Details

- **Port**: 8080
- **Restart Policy**: always
- **Container Name**: vs_cnt

### GCP Authentication

The container includes Google Cloud CLI and expects authentication via service account:

```bash
gcloud auth configure-docker us-central1-docker.pkg.dev
```

---

## Troubleshooting

### Common Issues

#### 1. FFmpeg Command Fails

**Symptoms**: Subprocess error during video processing

**Solutions**:
- Check FFmpeg is installed: `ffmpeg -version`
- Verify input file paths exist
- Check disk space for output files
- Review FFprobe output for corrupt files

#### 2. Whisper API Timeout

**Symptoms**: Transcription hangs or times out

**Solutions**:
- Check OpenAI API key validity
- Verify audio file size (<25MB limit)
- Ensure audio format is supported (MP3, WAV)

#### 3. Cloud Download Fails

**Symptoms**: "gcloud storage cp" or "aws s3 cp" errors

**Solutions**:
- Verify cloud CLI authentication
- Check bucket permissions
- Validate URI format (gs:// or s3://)

#### 4. Memory Issues

**Symptoms**: Process killed, out of memory

**Solutions**:
- Reduce parallel processing
- Use smaller video chunks
- Increase container memory limits

### Debug Mode

Enable verbose FFmpeg output by removing `-loglevel error`:

```python
# Change from:
'ffmpeg -hide_banner -loglevel error ...'

# To:
'ffmpeg -hide_banner -loglevel info ...'
```

### Log Files

Logs are stored in `logs/server.log` with rotation:
- Max size: 5MB per file
- Backup count: 3 files

---

## Dependencies

### System Requirements

- **FFmpeg**: Video processing (with libx264, aac codecs)
- **FFprobe**: Media file analysis
- **Python 3.8+**: Runtime environment

### Python Packages

| Package | Version | Purpose |
|---------|---------|---------|
| moviepy | Latest | Video concatenation |
| openai | Latest | Whisper API |
| python-dotenv | Latest | Environment variables |
| requests | Latest | HTTP requests |
| pytz | Latest | Timezone handling |

### Cloud CLIs

- **gcloud**: Google Cloud Storage operations
- **aws**: Amazon S3 operations (optional)

---

## License

Apache License 2.0

Copyright 2022-2023 Unscript.ai, Inc. / IndoAI Technologies

---

## Support

For issues and feature requests, contact the development team.
