# AI Agent Instructions for ErisBluSanta Campaign

## 🎯 Project Overview

**ErisBluSanta** is a personalized medical campaign video platform generating **8-segment podcast-style videos** with ElevenLabs TTS audio overlays. Unlike Bhagyashree (MuseTalk lip-sync), BluSanta uses **pre-recorded constant videos + audio replacement**, eliminating video generation VMs entirely.

**Critical Architecture (Dec 2025):**

| Component | Technology                    | Location                                                          | Purpose                                 |
| --------- | ----------------------------- | ----------------------------------------------------------------- | --------------------------------------- |
| Backend   | Node.js/Express (port 3001)   | blusanta-campaign VM (us-central1-c)                              | Audio gen + orchestration + QC workflow |
| Frontend  | Next.js 15.1.9 (port 3000)    | Same VM                                                           | Assessment submission form              |
| Stitching | Python 3.12 Flask (port 8080) | video-stitch-blusanta VM (us-central1-a)                          | FFmpeg + OpenAI Whisper subtitles       |
| Database  | SQLite (WAL mode)             | `/home/Dipesh_Goel/blusanta/backend/data/blusanta_assessments.db` | Assessment tracking                     |
| Storage   | GCS                           | `gs://blusanta-campaign-videos/blusanta/`                         | Videos, audio, fonts                    |
| WhatsApp  | Gupshup API                   | -                                                                 | QC-approved notifications only          |
| QC        | Google Sheets + Apps Script   | Sheet ID: `1TDmGcLyQDE8cj2HiXtLpDJAXF-XQaFHLryYj-Q5-r48`          | Manual review workflow                  |

**Key Files:**

- `backend/routes/blusanta-generation.js` (942 lines) - Main pipeline with QC workflow
- `backend/utils/constants.js` (275 lines) - 8-segment structure + config
- `temp_blusanta.py` (1457 lines) - Stitching service with subtitle generation
- `backend/utils/sheet.js` (172 lines) - Google Sheets sync (columns N/O/P/Q/R)
- `QC_sheet_code.gs` - Apps Script monitoring Column Q for QC approval

## 🎬 Critical: 8-Segment Video Structure (Dec 2025 Fix)

**THE BUG THAT WAS FIXED:** Stitching service tried to use `final_intro.mp4` and `final_outro.mp4` that don't exist, causing all videos to fail upload. The intro/outro are **merged into the 8 segments**, not separate wrappers.

### Correct 8-Segment Structure

```javascript
// Backend payload (backend/utils/constants.js buildStitchingPayload())
{
  "constant_video_paths": [
    "gs://.../const_000.mp4",  // Intro + greeting merged here
    "gs://.../const_001.mp4",  // Question 1
    "gs://.../const_002.mp4",  // Question 2
    "gs://.../const_003.mp4"   // Thank you + outro merged here
  ],
  "placeholder_video_paths": [
    "gs://.../plc_000.mp4",    // Greeting audio overlay
    "gs://.../plc_001.mp4"     // Thank you audio overlay
  ],
  "nodding_video_path": "gs://.../nodding.mp4",
  "doctor_video_paths": [
    "gs://.../video1.mov",     // Doctor response 1
    "gs://.../video2.mov"      // Doctor response 2
  ],
  "greeting_audio_path": "gs://.../E99998_11223377_greeting.mp3",
  "thank_you_audio_path": "gs://.../E99998_11223377_thankyou.mp3"
}
```

### Payload Adapter Pattern (temp_blusanta.py lines 1360-1410)

**CRITICAL FIX (Dec 2025):** Variables `final_intro_path` and `final_outro_path` MUST be set to `None` initially, not file paths. The check `if final_intro_path and final_outro_path:` on line 1158 will fail if they're strings pointing to non-existent files.

```python
# WRONG (causes FFmpeg "file not found" error):
final_intro_path = os.path.join(job_temp_dir, "final_intro.mp4")  # Always a string
final_outro_path = os.path.join(job_temp_dir, "final_outro.mp4")
if final_intro_path and final_outro_path:  # True even if files don't exist!
    standardize_video(final_intro_path, f_intro)  # ERROR: File not found

# CORRECT (Dec 2025 fix in temp_blusanta.py lines 1010-1025):
final_intro_path = None  # Start as None
final_outro_path = None
if payload.get("final_intro_path"):
    final_intro_path = os.path.join(job_temp_dir, "final_intro.mp4")
    download_file(payload["final_intro_path"], final_intro_path)
# Later: if final_intro_path and final_outro_path: will be False for 8-segment
```

### Video Sequence (Podcast Layout)

```
Segment 0: const_000.mp4 (full screen) + plc_000.mp4 (placeholder)
Segment 1: plc_000.mp4 with greeting audio (full screen) + placeholder
Segment 2: const_001.mp4 (full screen) + placeholder
Segment 3: nodding.mp4 (trimmed) + doctor_video_1 (PODCAST ZOOM LAYOUT)
Segment 4: const_002.mp4 (full screen) + placeholder
Segment 5: nodding.mp4 (trimmed) + doctor_video_2 (PODCAST ZOOM LAYOUT)
Segment 6: plc_001.mp4 with thank_you audio (full screen) + placeholder
Segment 7: const_003.mp4 (full screen) + placeholder
```

**Podcast Zoom Layout** (segments 3 & 5 only):

- Left box (x=50, y=760): Label "BLUSANTA" - Montserrat-SemiBold fontsize 32
- Right box (x=1000, y=760): Label "DR. [FULL NAME]" - Montserrat-SemiBold fontsize 32
- Fonts: `gs://blusanta-campaign-videos/blusanta/fonts/Montserrat-SemiBold.ttf`

## 🎥 Video Stitching: Major Learnings & Flow

### The Pipeline Architecture

**Backend → Stitching VM Communication:**

```
1. Backend builds payload (constants.js buildStitchingPayload())
2. Backend POSTs to Flask endpoint: http://35.209.226.200:8080/stitch
3. Flask returns immediate response: {"status": "processing", "job_started_at": timestamp}
4. Backend polls/waits for webhook callback
5. Stitching VM processes video (7-8 minutes)
6. Stitching VM POSTs to webhook: http://34.171.167.66:3001/api/blusanta/update-after-stitching
7. Backend updates DB, sheet, and triggers QC workflow
```

### Critical Learning #1: Asset Download Before Processing

**Pattern (temp_blusanta.py lines 1005-1045):**

```python
# STEP 1: Download ALL assets first (fail fast if missing)
# Define local paths
intro_path = None
outro_path = None
final_intro_path = None
final_outro_path = None

# Download constant videos (4 segments)
constant_videos = []
for i, const_path in enumerate(payload["constant_video_paths"]):
    local_path = os.path.join(job_temp_dir, f"const_{i:03d}.mp4")
    download_file(const_path, local_path)
    constant_videos.append(local_path)

# Download placeholder videos (2 segments)
placeholder_videos = []
for i, plc_path in enumerate(payload["placeholder_video_paths"]):
    local_path = os.path.join(job_temp_dir, f"plc_{i:03d}.mp4")
    download_file(plc_path, local_path)
    placeholder_videos.append(local_path)

# Download doctor response videos
doctor_videos = []
for i, dr_path in enumerate(payload["doctor_video_paths"]):
    local_path = os.path.join(job_temp_dir, f"dr_video_{i+1}.mov")
    download_file(dr_path, local_path)
    doctor_videos.append(local_path)

# Download audio overlays
greeting_audio = os.path.join(job_temp_dir, "greeting_audio.mp3")
download_file(payload["greeting_audio_path"], greeting_audio)

thankyou_audio = os.path.join(job_temp_dir, "thankyou_audio.mp3")
download_file(payload["thank_you_audio_path"], thankyou_audio)
```

**Why This Matters:**

- **Fail Fast:** If any asset missing, error occurs before 7 minutes of processing
- **Network Isolation:** All GCS downloads upfront, FFmpeg processing offline
- **Temp Directory:** Each job isolated in `/home/Dipesh_Goel/temp/job_{timestamp}/`

### Critical Learning #2: Audio Overlay Structure

**THE BUG THAT WAS FIXED (Dec 2025):**

Original code expected audio overlays as a **dict**:

```python
# WRONG: Expected this structure
audio_overlays = {
    1: "/path/to/greeting_audio.mp3",
    6: "/path/to/thankyou_audio.mp3"
}
```

But backend sent it as **list of dicts**:

```python
# CORRECT: Backend actually sends this (constants.js lines 1048-1060)
audio_overlays = [
    {"segment_index": 1, "audio_path": "gs://.../greeting.mp3"},
    {"segment_index": 6, "audio_path": "gs://.../thankyou.mp3"}
]
```

**The Fix (temp_blusanta.py lines 1048-1070):**

```python
# Download audio overlays
audio_overlay_paths = {}
if payload.get("audio_overlays"):
    for overlay in payload["audio_overlays"]:
        segment_idx = overlay["segment_index"]
        audio_gcs_path = overlay["audio_path"]
        local_audio_path = os.path.join(job_temp_dir, f"audio_{segment_idx}.mp3")
        download_file(audio_gcs_path, local_audio_path)
        audio_overlay_paths[segment_idx] = local_audio_path
        logger.info(f"Audio overlay for segment {segment_idx}: {local_audio_path}")
```

**Lesson:** Always validate payload structure matches what backend actually sends, not what comments say.

### Critical Learning #3: Segment Processing Loop

**The Core Algorithm (temp_blusanta.py lines 1090-1135):**

```python
# Process 8 segments sequentially
segments = []
for i in range(8):
    segment_type = determine_segment_type(i)  # constant, audio_overlay, podcast_zoom

    if segment_type == "constant":
        # Simple standardization, optional subtitles
        segments.append(process_constant_segment(constant_videos[...]))

    elif segment_type == "audio_overlay":
        # Replace video audio with ElevenLabs audio
        segments.append(process_audio_overlay_segment(
            placeholder_videos[...],
            audio_overlay_paths[i]
        ))

    elif segment_type == "podcast_zoom":
        # Side-by-side layout with labels
        segments.append(create_podcast_zoom_segment(
            nodding_video,
            doctor_videos[...],
            podcast_background,
            font_path,
            doctor_name
        ))

# Final concatenation
concatenate_videos(segments, final_output)
```

**Segment Type Mapping:**

```
Segment 0: constant (const_000)
Segment 1: audio_overlay (plc_000 + greeting audio)
Segment 2: constant (const_001)
Segment 3: podcast_zoom (nodding + doctor_video_1)
Segment 4: constant (const_002)
Segment 5: podcast_zoom (nodding + doctor_video_2)
Segment 6: audio_overlay (plc_001 + thankyou audio)
Segment 7: constant (const_003)
```

### Critical Learning #4: FFmpeg Audio Overlay Pattern

**The Correct Pattern (temp_blusanta.py):**

```python
def process_audio_overlay_segment(video_path, audio_path):
    """Replace video audio with overlay audio"""
    output_path = video_path.replace('.mp4', '_with_audio.mp4')

    ffmpeg_cmd = [
        'ffmpeg', '-y',
        '-i', video_path,      # Input video
        '-i', audio_path,      # Input audio (ElevenLabs)
        '-c:v', 'copy',        # Copy video stream (no re-encode)
        '-c:a', 'aac',         # Encode audio as AAC
        '-map', '0:v:0',       # Map video from input 0
        '-map', '1:a:0',       # Map audio from input 1
        '-shortest',           # Trim to shortest stream duration
        output_path
    ]

    run_ffmpeg(ffmpeg_cmd)
    return output_path
```

**Key Points:**

- **`-c:v copy`:** No video re-encoding (faster, lossless)
- **`-c:a aac`:** Audio must be encoded to match container
- **`-map` directives:** Explicit stream selection prevents auto-selection bugs
- **`-shortest`:** Critical to prevent video/audio length mismatch

### Critical Learning #5: Podcast Zoom Layout with Labels

**The Complex Part (temp_blusanta.py lines 638-893):**

```python
def create_podcast_zoom_segment(left_video, right_video, background, font_path, doctor_name):
    """Create side-by-side podcast layout with dynamic labels"""

    # Step 1: Trim left video (nodding) to match right video (doctor response)
    right_duration = get_video_duration(right_video)
    trimmed_left = trim_video_to_duration(left_video, right_duration)

    # Step 2: Standardize both videos (1920x1080, 25fps, yuv420p)
    std_left = standardize_video(trimmed_left)
    std_right = standardize_video(right_video)

    # Step 3: Build complex FFmpeg filter with overlays and labels
    filter_complex = f"""
    [0:v]scale=900:540,pad=920:560:10:10:white[left];
    [1:v]scale=900:540,pad=920:560:10:10:white[right];
    [2:v]scale=1920:1080[bg];
    [bg][left]overlay=50:266[bg_left];
    [bg_left][right]overlay=950:266[video_base];
    [video_base]drawtext=fontfile={font_path}:text='BLUSANTA':fontsize=32:fontcolor=white:x=50:y=760[video_label1];
    [video_label1]drawtext=fontfile={font_path}:text='DR. {doctor_name}':fontsize=32:fontcolor=white:x=1000:y=760[final]
    """

    # Step 4: Merge audio from both videos
    ffmpeg_cmd = [
        'ffmpeg', '-y',
        '-i', std_left,
        '-i', std_right,
        '-i', background,
        '-filter_complex', filter_complex,
        '-map', '[final]',          # Use filtered video
        '-map', '0:a',              # Left audio
        '-map', '1:a',              # Right audio
        '-filter_complex', 'amix=inputs=2:duration=longest',  # Mix audio
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        output_path
    ]
```

**Major Learning Points:**

1. **Duration Sync:** Nodding MUST be trimmed to doctor video length BEFORE layout
2. **Standardization First:** Both videos standardized separately, then composited
3. **White Borders:** `pad=920:560:10:10:white` adds 10px white border around each video
4. **Positioning Math:**
   - Left: x=50, y=266 (top-left corner)
   - Right: x=950, y=266 (top-right corner, accounting for border)
   - Labels: y=760 (below videos)
5. **Font Loading:** Font must be downloaded to temp dir, can't reference GCS path in FFmpeg
6. **Audio Mixing:** `amix=inputs=2` combines both audio tracks

### Critical Learning #6: Subtitle Integration

**OpenAI Whisper API Pattern (temp_blusanta.py lines 52-220):**

```python
def generate_subtitles_with_openai(video_path, output_path):
    """Generate English subtitles using OpenAI Whisper API"""

    # Step 1: Extract audio from video
    audio_path = video_path.replace('.mp4', '_audio.mp3')
    extract_audio_cmd = [
        'ffmpeg', '-y', '-i', video_path,
        '-vn',  # No video
        '-acodec', 'libmp3lame',
        '-ar', '16000',  # 16kHz for Whisper
        '-ac', '1',      # Mono
        audio_path
    ]
    run_ffmpeg(extract_audio_cmd)

    # Step 2: Call OpenAI Whisper API
    with open(audio_path, 'rb') as audio_file:
        transcript = openai.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            response_format="verbose_json",
            timestamp_granularity=["word"]
        )

    # Step 3: Convert to ASS subtitle format
    ass_content = generate_ass_subtitle(transcript.words)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(ass_content)

    # Step 4: Cache to GCS for future use
    upload_to_gcs(output_path, gcs_subtitle_path)

    return output_path

def apply_subtitles_to_video(video_path, subtitle_path):
    """Burn subtitles into video"""
    output_path = video_path.replace('.mp4', '_with_subs.mp4')

    # Escape subtitle path for FFmpeg
    escaped_subtitle_path = subtitle_path.replace('\\', '/').replace(':', '\\\\:')

    ffmpeg_cmd = [
        'ffmpeg', '-y',
        '-i', video_path,
        '-vf', f"ass={escaped_subtitle_path}",  # Burn ASS subtitles
        '-c:a', 'copy',  # Copy audio (no re-encode)
        output_path
    ]

    run_ffmpeg(ffmpeg_cmd)
    return output_path
```

**Caching Strategy:**

- Subtitles cached at `gs://blusanta-campaign-videos/blusanta/subtitles/const_{i}_subtitle.ass`
- Check GCS first, only call OpenAI if missing
- Saves API costs for repeated constant videos

**Fallback Behavior:**

- Subtitle generation failures are non-fatal
- Video continues without subtitles if Whisper API fails
- Logged as ERROR but doesn't stop pipeline

### Critical Learning #7: Webhook & Error Handling

**Success Webhook (temp_blusanta.py lines 1420-1440):**

```python
# After video uploaded to GCS
webhook_payload = {
    "status": "completed",
    "final_video_url": final_gcs_url,
    "additional_data": payload.get("additional_data", {}),
    "job_completed_at": time.time()
}

response = requests.post(
    payload["webhook_url"],
    json=webhook_payload,
    headers={"Authorization": f"Bearer {AI_SERVICE_AUTH_TOKEN}"},
    timeout=30
)

if response.status_code == 200:
    logger.info("✅ Webhook notification sent successfully")
else:
    logger.error(f"⚠️ Webhook failed: {response.status_code}")
    # Continue anyway - backend will eventually poll
```

**Error Webhook (temp_blusanta.py lines 1445-1460):**

```python
except Exception as e:
    logger.error(f"❌ STITCHING FAILED: {str(e)}")

    # Send error webhook
    error_payload = {
        "status": "failed",
        "error_message": str(e),
        "additional_data": payload.get("additional_data", {}),
        "job_failed_at": time.time()
    }

    try:
        requests.post(payload["webhook_url"], json=error_payload, timeout=10)
    except:
        pass  # Don't fail on webhook failure

    return jsonify(error_payload), 500
```

**Backend Polling Pattern (blusanta-generation.js lines 560-620):**

```javascript
// After sending stitching request
let waitTime = 0;
const MAX_WAIT = 900; // 15 minutes

while (waitTime < MAX_WAIT) {
  await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10s
  waitTime += 10;

  // Check if webhook updated database
  const status = await checkAssessmentStatus(id);
  if (status.video_stitch === 1) {
    console.log(`[BLUSANTA] ✅ ID ${id} stitching completed!`);
    break;
  }

  console.log(`[BLUSANTA] ⏳ Waiting for ID ${id} (${waitTime}s)...`);
}
```

**Key Insights:**

1. **Dual Verification:** Backend checks webhook + polls database
2. **Timeout Protection:** 15-minute max wait prevents infinite loops
3. **Non-blocking:** Webhook failures don't stop video processing
4. **Error Propagation:** Failed stitching updates DB with error message

### Critical Learning #8: Temp Directory Management

**Pattern for Job Isolation:**

```python
# Create unique temp directory per job
job_id = int(time.time() * 1000)
job_temp_dir = os.path.join("/home/Dipesh_Goel/temp", f"job_{job_id}")
os.makedirs(job_temp_dir, exist_ok=True)

try:
    # All processing in job_temp_dir
    # Downloads, intermediate files, final output

    # Upload final video to GCS
    upload_to_gcs(final_local_path, gcs_path)

finally:
    # Cleanup temp directory (success or failure)
    shutil.rmtree(job_temp_dir, ignore_errors=True)
```

**Why This Matters:**

- **Parallel Jobs:** Multiple assessments can stitch simultaneously
- **Disk Space:** Cleanup prevents disk fill (each job ~500MB-1GB)
- **Debugging:** Temp dir with timestamp helps trace issues
- **Failure Isolation:** One job's crash doesn't affect others

### Performance Metrics

**Typical Processing Times:**

- Asset download: 30-60 seconds (8 videos + 2 audio + fonts + background)
- Subtitle generation: 15-30 seconds per constant video (4 total)
- Segment processing: 60-90 seconds each (8 segments)
- Final concatenation: 30-45 seconds
- GCS upload: 20-40 seconds
- **Total: 7-8 minutes per video**

**Bottlenecks:**

1. OpenAI Whisper API calls (can be cached)
2. FFmpeg podcast zoom rendering (most CPU intensive)
3. GCS upload speed (network dependent)

## 🔑 Essential Patterns

### 1. QC Approval Workflow (Dec 2025 - Most Critical!)

**THE CHANGE:** WhatsApp notifications are NO LONGER sent automatically after video completion. Videos must be **QC-approved in Google Sheet first**.

**Old Flow (Commented Out):**

```javascript
// backend/routes/blusanta-generation.js lines 692-723 (COMMENTED OUT Dec 2025)
// Video completes → Send WhatsApp immediately
```

**New Flow (Active):**

```
1. Video completes → DB updated → Google Sheet updated (Columns N, O)
2. QC team reviews video → Sets Status (Column Q) to "Approved" or "Regenerate"
3. Google Apps Script (QC_sheet_code.gs) detects edit on Column Q
4. Script calls POST /api/blusanta/qc-approved-wa
5. Backend sends WhatsApp if status="Approved"
6. If status="Regenerate": Reset assessment, update Column R to "Yes"
```

**Google Sheets Structure (After cleanup, Dec 2025):**

- Column A (1): ID
- Column N (14): Final video link ← Backend auto-updates
- Column O (15): Video Generated on ← Backend auto-updates
- Column P (16): Name Pronunciation ← Manual/optional
- Column Q (17): Status ← **QC EDITS THIS** (triggers automation)
- Column R (18): Regenerated? ← Auto-updated by script
- Column S (19): Comments ← Manual/optional

**Backend Sheet Update** (backend/utils/sheet.js):

```javascript
// After stitching completes (lines 102-134)
await updateSheetByAssessmentId(id, {
  final_video_url: final_video_url, // Column N
  video_generated_on: timestamp, // Column O
});
// NOTE: Only updates if assessment found in sheet
// Reads sheet, finds row by ID, updates specific columns
```

**QC Apps Script Trigger** (QC_sheet_code.gs):

```javascript
function onTriggerEdit(e) {
  if (range.getColumn() === 17) {
    // Column Q - Status
    const status = range.getValue();
    if (status === "Approved" || status === "Regenerate") {
      // Call backend API: POST /qc-approved-wa
      const payload = {
        _id: sheet.getRange(row, 1).getValue(),
        video_url: sheet.getRange(row, 14).getValue(), // Column N
        status: status,
        name_pronunciation: sheet.getRange(row, 16).getValue(), // Column P
        qc_remarks: sheet.getRange(row, 17).getValue(), // Column Q
      };
    }
  }
}
```

**CRITICAL: Sheet Row Addition Bug**

The sheet has a major structural issue where `addRowToSheet()` appends rows to random far-right columns (e.g., `EU8:FL8`) instead of a new row. This is a **Google Sheets API bug** with `append()` when sheet has formatting issues.

**When debugging sheet sync:**

1. Check backend logs: `[SHEET] ✅ Added assessment 14 to Google Sheet`
2. Check actual sheet: Row may be in column EU instead of new row
3. Verify `updateSheetByAssessmentId()` reads correct columns (N/O/P/Q/R)
4. Manual fix: Clean sheet structure, remove blank columns

### 2. ElevenLabs TWO Audio Generation

**Location:** `backend/utils/elevenlabs.js` + `backend/routes/blusanta-generation.js` lines 67-250

**KEY CHANGE (Dec 2025):** Generate **TWO separate audio files** - greeting and thank you:

```javascript
// Generate TWO audio files per assessment
const greetingAudio = await generateElevenLabsAudio({
  text: `Doctor ${name_pronunciation || dr_first_name}`,
  voiceId: ELEVENLABS_CONFIG.voiceId,
});
// Upload to: blusanta/audio/names/english/E99998_11223377_greeting.mp3

const thankYouAudio = await generateElevenLabsAudio({
  text: `Thank you Doctor ${name_pronunciation || dr_first_name}`,
  voiceId: ELEVENLABS_CONFIG.voiceId,
});
// Upload to: blusanta/audio/names/english/E99998_11223377_thankyou.mp3
```

**Stitching Usage:**

- `greeting_audio_path` → Applied to segment 1 (plc_000.mp4)
- `thank_you_audio_path` → Applied to segment 6 (plc_001.mp4)

**Quota Management:**

```javascript
// Check before batch processing
const quota = await checkElevenLabsQuota();
if (quota.remainingCharacters < rows.length * 50) {
  // Fail early - don't start processing
}
```

### 3. Subtitle Generation with OpenAI Whisper

**Location:** `temp_blusanta.py` lines 52-220

**Added Dec 2025:** English subtitles on constant segments using OpenAI Whisper API.

```python
# Generate subtitles for constant videos
def generate_subtitles_with_openai(video_path, output_path):
    # Extract audio
    audio_path = video_path.replace('.mp4', '_audio.mp3')
    extract_audio_from_video(video_path, audio_path)

    # Call OpenAI Whisper API
    with open(audio_path, 'rb') as audio_file:
        transcript = openai.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            response_format="verbose_json",
            timestamp_granularity=["word"]
        )

    # Generate ASS subtitle file
    # Cached in GCS: blusanta/subtitles/const_000_subtitle.ass
```

**Environment Setup:**

- OpenAI API key in `/home/Dipesh_Goel/.env` on stitching VM
- Packages: `openai==2.9.0`, `python-dotenv==1.2.1`
- Installed with `--break-system-packages` flag

**Integration:**

```python
# Apply subtitles to constant segments during processing
for segment in segments:
    if segment['type'] == 'constant':
        video_with_subs = apply_subtitles_to_video(
            segment['video_path'],
            subtitle_path
        )
```

### 4. Database & Sheet Column Alignment

**SQLite Schema** (`blusanta_assessments.db`):

```sql
CREATE TABLE assessments (
  id INTEGER PRIMARY KEY,
  employee_code TEXT, employee_name TEXT, employee_mobile TEXT,
  dr_code TEXT, dr_first_name TEXT, dr_last_name TEXT, dr_mobile TEXT,
  video_language TEXT, name_pronunciation TEXT, avatar_name TEXT,
  audio_generation INTEGER DEFAULT 0,  -- ElevenLabs complete
  video_generation INTEGER DEFAULT 0,  -- N/A for BluSanta (always 0)
  video_stitch INTEGER DEFAULT 0,      -- Stitching complete
  final_video_url TEXT,
  error_message TEXT,
  is_regenerated INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Google Sheets Sync** (backend/utils/sheet.js):

```javascript
// Row data sent to addRowToSheet() (lines 14-32)
const sheetData = [
  assessmentId, // Column A
  videoLanguage, // Column B
  "blusanta", // Column C
  employeeCode, // Column D
  employeeName, // Column E
  employeeMobile, // Column F
  drCode, // Column G
  drFirstName, // Column H
  drLastName, // Column I
  drMobile, // Column J
  videos.video1 || "", // Column K
  videos.video2 || "", // Column L
  new Date().toISOString(), // Column M
  "", // Column N - final_video_url (updated later)
  "", // Column O - video_generated_on (updated later)
  "", // Column P - name_pronunciation
  "", // Column Q - status (QC sets this)
  namePronunciation, // Column R - name pronunciation input
];
```

**CRITICAL:** Column mappings updated TWICE in Dec 2025:

- First: P/Q/R/S/T (when sheet had blank columns)
- Second: N/O/P/Q/R (after user removed blank columns)

## 🚀 Developer Workflows

### Deployment to GCP VMs

**Backend/Frontend (blusanta-campaign VM):**

```powershell
# 1. Upload backend route file
gcloud compute scp "backend/routes/blusanta-generation.js" blusanta-campaign:/home/Dipesh_Goel/blusanta/backend/routes/ --zone=us-central1-c

# 2. Restart backend
gcloud compute ssh blusanta-campaign --zone=us-central1-c --command="pm2 restart blusanta-backend"

# 3. Frontend build and deploy
cd frontend
npm run build
tar -czf next-build.tar.gz .next
gcloud compute scp next-build.tar.gz blusanta-campaign:/home/Dipesh_Goel/ --zone=us-central1-c
gcloud compute ssh blusanta-campaign --zone=us-central1-c --command="cd /home/Dipesh_Goel/blusanta/frontend && tar -xzf ~/next-build.tar.gz && pm2 restart blusanta-frontend"
```

**Stitching Service (video-stitch-blusanta VM):**

```powershell
# 1. Upload Python script
gcloud compute scp "temp_blusanta.py" video-stitch-blusanta:/home/Dipesh_Goel/blusanta_zoom_stitch.py --zone=us-central1-a

# 2. Restart service
gcloud compute ssh video-stitch-blusanta --zone=us-central1-a --command="pm2 restart all"
```

### Database Operations

```powershell
# Query assessment status
gcloud compute ssh blusanta-campaign --zone=us-central1-c --command='sqlite3 /home/Dipesh_Goel/blusanta/backend/data/blusanta_assessments.db "SELECT id, audio_generation, video_stitch, final_video_url FROM assessments WHERE id=14;"'

# Reset assessment for retry
gcloud compute ssh blusanta-campaign --zone=us-central1-c --command='sqlite3 /home/Dipesh_Goel/blusanta/backend/data/blusanta_assessments.db "UPDATE assessments SET audio_generation=0, video_generation=0, video_stitch=0, final_video_url=NULL WHERE id=14;"'

# Trigger audio generation
Invoke-RestMethod -Uri "http://34.171.167.66:3001/api/blusanta/initiate-audio-generation" -Method POST -Body (@{language="English"} | ConvertTo-Json) -ContentType "application/json"
```

### Checking Logs

```powershell
# Backend logs
gcloud compute ssh blusanta-campaign --zone=us-central1-c --command="pm2 logs blusanta-backend --lines 100 --nostream"

# Stitching logs
gcloud compute ssh video-stitch-blusanta --zone=us-central1-a --command="pm2 logs --lines 200 --nostream"

# Filter for specific assessment
gcloud compute ssh blusanta-campaign --zone=us-central1-c --command="pm2 logs blusanta-backend --lines 500 --nostream | grep -i '11223377\|assessment.*14'"
```

### GCS File Verification

```powershell
# Check if video exists
gcloud storage ls gs://blusanta-campaign-videos/blusanta/results/E99998_11223377_final.mp4

# List recent videos
gcloud storage ls gs://blusanta-campaign-videos/blusanta/results/ | Select-Object -Last 10

# Check audio files
gcloud storage ls gs://blusanta-campaign-videos/blusanta/audio/names/english/
```

### Testing Workflows

**1. Test Complete Flow:**

```powershell
# Submit assessment via frontend at https://erisblusanta.gonuts.ai/
# Check status after 8-10 minutes:
gcloud compute ssh blusanta-campaign --zone=us-central1-c --command='sqlite3 /home/Dipesh_Goel/blusanta/backend/data/blusanta_assessments.db "SELECT id, audio_generation, video_stitch FROM assessments ORDER BY id DESC LIMIT 5;"'
```

**2. Test QC Workflow:**

```
1. Wait for video completion (video_stitch=1, sheet updated)
2. Verify Google Sheet has entry with Final video link (Column N)
3. Manually set Status (Column Q) to "Approved"
4. Check backend receives webhook: POST /qc-approved-wa
5. Verify WhatsApp sent to employee
```

**3. Test Regeneration:**

```
1. Set Status (Column Q) to "Regenerate"
2. Update Name Pronunciation (Column P) if needed
3. Check "Regenerated?" (Column R) auto-updates to "Yes"
4. Verify assessment reset in DB (audio_generation=0, video_stitch=0)
5. Wait for reprocessing
```

// Don't fail webhook if WhatsApp fails
console.error(`[BLUSANTA] ⚠️ Failed to send WhatsApp:`, waError.message);
}

````

**Critical Details:**

- ALWAYS send WhatsApp after successful video completion (unlike Bhagyashree which only sends on QC approval)
- Use try-catch to prevent webhook failure if Gupshup is down
- Template ID: `GUPSHUP_VIDEO_READY_TEMPLATE_ID` from `.env`
- Requires `node-fetch` import in `utils/gupshup.js`

### 5. GCS Path Conventions

All GCS paths use **underscores instead of spaces** (Dec 2025 fix):

```javascript
// Constant videos (on GCS)
gs://blusanta-campaign-videos/blusanta/constant-videos/english/
  - 1_Const_Intro.mp4
  - 2_Doctor_Placeholder.mp4
  - 3_Const_Question_1.mp4
  - 4_Blusanta_Noding.mp4
  - 5_Const_Question_2.mp4
  - 6_Blusanta_Noding.mp4
  - 7_Const_Blusanta_Thankyou.mp4
  - 8_Doctor_Plc_Blusanta_Thankyou.mp4
  - 9_Const_outro_Blusanta_Thankyou.mp4

// Generated audio
gs://blusanta-campaign-videos/blusanta/audio/names/{assessment_id}_name_audio.mp3

// User-uploaded doctor videos
gs://blusanta-campaign-videos/blusanta/videos/{employee_id}_{dr_code}/
  - dr_video_1.mp4
  - dr_video_2.mp4

// Final results
gs://blusanta-campaign-videos/blusanta/results/
  - {employee_id}_{dr_code}_final.mp4
````

**When validating GCS objects:**

- Use `validateGcsObject()` from `utils/gcp.js`
- Check ALL constant videos exist before starting stitching
- Fail fast with clear error if any file missing

## 🔧 Development Workflows

### Local Development

```powershell
# Backend (from ErisBluSanta/backend)
npm install
cp .env.example .env  # Configure ELEVENLABS_API_KEY, GUPSHUP_API_KEY, etc.
npm run dev           # Starts on port 3001

# Frontend (from ErisBluSanta/frontend)
npm install
cp .env.example .env.local  # Set NEXT_PUBLIC_BACKEND_URL
npm run dev           # Starts on port 3000
```

## ⚠️ Common Errors & Solutions

### Error 1: "Error opening input file final_intro.mp4" (CRITICAL BUG - Dec 2025)

**Symptom:** Stitching reports success but video doesn't exist in GCS. Logs show FFmpeg error.

**Root Cause:** `final_intro_path` and `final_outro_path` set to file paths even when not needed for 8-segment structure.

**Solution:** In `temp_blusanta.py` lines 1010-1025:

```python
# Initialize as None, only set paths if payload contains them
final_intro_path = None
final_outro_path = None
if payload.get("final_intro_path"):
    final_intro_path = os.path.join(job_temp_dir, "final_intro.mp4")
    download_file(payload["final_intro_path"], final_intro_path)
```

**Check:** Line 1158: `if final_intro_path and final_outro_path:` should be False for 8-segment.

### Error 2: Google Sheet Not Updating (Assessment Missing)

**Symptom:** Backend logs `[SHEET] ✅ Added assessment 14` but sheet doesn't show new row.

**Root Cause:** Google Sheets API `append()` bug adds row to far-right columns (e.g., EU8:FL8) when sheet has formatting issues.

**Solutions:**

1. **Immediate:** Check columns EU-FL in sheet for missing data
2. **Long-term:** Clean sheet structure, remove blank columns
3. **Verification:** Backend logs show `updatedRange: 'Sheet1!EU8:FL8'` instead of expected row

**Sheet Structure Fix:**

- Remove ALL blank columns between M and N
- Ensure continuous column structure A-S
- Test `addRowToSheet()` adds to next available row, not random column

### Error 3: Subtitle Generation Failures

**Symptom:** Logs show `ERROR - [generate_subtitles_with_openai] Subtitle generation failed`

**Causes:**

1. OpenAI API key not set in `/home/Dipesh_Goel/.env` on stitching VM
2. `openai` package not installed (`pip install openai==2.9.0 --break-system-packages`)
3. Audio extraction failed (video has no audio track)

**Solutions:**

```bash
# SSH to stitching VM
gcloud compute ssh video-stitch-blusanta --zone=us-central1-a

# Check .env file
cat /home/Dipesh_Goel/.env | grep OPENAI_API_KEY

# Install openai package if missing
pip install openai==2.9.0 python-dotenv==1.2.1 --break-system-packages

# Restart service
pm2 restart all
```

**Note:** Subtitle failures are non-fatal - video still generates without subtitles.

### Error 4: WhatsApp Not Sent After QC Approval

**Symptom:** Status set to "Approved" in sheet but no WhatsApp notification.

**Checks:**

1. **Google Apps Script deployed?** Check Extensions > Apps Script in sheet
2. **Trigger installed?** Should be `onEdit` for `onTriggerEdit()` function
3. **Column correct?** Script monitors Column Q (17), not R or S
4. **Backend endpoint working?** Test: `curl -X POST http://34.171.167.66:3001/api/blusanta/qc-approved-wa -H "Content-Type: application/json" -d '{"_id":14,"video_url":"...","status":"Approved"}'`
5. **Gupshup template ID set?** Check `.env` for `GUPSHUP_VIDEO_READY_TEMPLATE_ID`

**Debug Apps Script:**

```javascript
// In Google Apps Script editor, run testTrigger()
function testTrigger() {
  const TEST_ROW = 2; // Change to your test row
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const range = sheet.getRange(TEST_ROW, 17); // Column Q
  const mockEvent = {
    source: SpreadsheetApp.getActiveSpreadsheet(),
    range: range,
  };
  onTriggerEdit(mockEvent);
  // Check Execution log for API response
}
```

### Error 5: ElevenLabs Quota Exhausted

**Symptom:** Audio generation fails with "Quota exceeded" error.

**Immediate Solution:**

```javascript
// Backend checks quota before processing (lines 120-135)
const quota = await checkElevenLabsQuota();
if (quota.remainingCharacters < rows.length * 50) {
  console.error("[BLUSANTA] ❌ Insufficient ElevenLabs quota");
  // Processing stops early
}
```

**Long-term:** Monitor usage in ElevenLabs dashboard, upgrade plan if needed.

### Error 6: Assessment Stuck in "Processing"

**Symptom:** `audio_generation=1` but `video_stitch=0` for extended period (>10 minutes).

**Diagnosis:**

```powershell
# Check backend waiting logs
gcloud compute ssh blusanta-campaign --zone=us-central1-c --command="pm2 logs blusanta-backend --lines 100 --nostream | grep 'Waiting for ID'"

# Check stitching service is running
gcloud compute ssh video-stitch-blusanta --zone=us-central1-a --command="pm2 status"
```

**Common Causes:**

1. Stitching VM crashed - restart with `pm2 restart all`
2. FFmpeg zombie process - check `ps aux | grep ffmpeg` and kill if needed
3. Network issue - restart stitching service
4. Invalid payload - check backend logs for payload structure

**Reset and Retry:**

```powershell
# Reset assessment
gcloud compute ssh blusanta-campaign --zone=us-central1-c --command='sqlite3 /home/Dipesh_Goel/blusanta/backend/data/blusanta_assessments.db "UPDATE assessments SET audio_generation=0, video_stitch=0, final_video_url=NULL WHERE id=14;"'

# Trigger retry
Invoke-RestMethod -Uri "http://34.171.167.66:3001/api/blusanta/initiate-audio-generation" -Method POST -Body (@{language="English"} | ConvertTo-Json) -ContentType "application/json"
```

## 📋 Code Review Checklist

When modifying code, verify:

### Backend Changes

- [ ] `.env` variables documented in README
- [ ] PM2 restart command included in deployment notes
- [ ] Database schema changes include migration script
- [ ] Google Sheets column mappings match actual sheet structure
- [ ] WhatsApp template IDs exist in Gupshup dashboard

### Stitching Service Changes

- [ ] File paths use `None` check, not empty string check
- [ ] FFmpeg commands include error handling
- [ ] Temp directory cleanup on success AND failure
- [ ] Webhook called with complete payload including `additional_data`
- [ ] OpenAI/ElevenLabs API calls have timeout and retry logic

### Frontend Changes

- [ ] Environment variables use `NEXT_PUBLIC_` prefix for client-side
- [ ] Build tested locally with `npm run build`
- [ ] `.next` directory uploaded to VM after successful build
- [ ] PM2 restart for frontend service

### QC Workflow Changes

- [ ] Apps Script column indices match sheet structure (0-indexed in JS, 1-indexed in formula)
- [ ] Trigger set to `onEdit` for spreadsheet
- [ ] Backend endpoint accepts all required fields from QC script
- [ ] Status values match exactly: "Approved" or "Regenerate" (case-sensitive)

---

**Last Updated:** December 9, 2025  
**Key Contributors:** Conversation summary shows multi-phase troubleshooting spanning WhatsApp fixes, video structure corrections, subtitle generation, Google Sheets alignment, and QC workflow implementation.
npm run dev # Starts on port 3000

````

### VM Deployment (GCP)

```bash
# Deploy backend changes
gcloud compute scp ./backend/routes/blusanta-generation.js \
  blusanta-campaign:/home/Dipesh_Goel/blusanta/backend/routes/ \
  --zone=us-central1-c

# Restart PM2
gcloud compute ssh blusanta-campaign --zone=us-central1-c \
  --command="cd /home/Dipesh_Goel/blusanta/backend && pm2 restart blusanta-backend"

# Deploy stitching VM changes
gcloud compute scp ./blusanta_zoom_stitch.py \
  video-stitch-blusanta:/home/ubuntu/blusanta-stitch/ \
  --zone=us-central1-a

# Restart stitching service
gcloud compute ssh video-stitch-blusanta --zone=us-central1-a \
  --command="sudo systemctl restart blusanta-stitch"
````

**Critical Path Convention:**

- Backend: `/home/Dipesh_Goel/blusanta/` (note capital D and underscore)
- Stitching VM: `/home/ubuntu/blusanta-stitch/`

### Debugging Commands

```bash
# Check PM2 status
pm2 list
pm2 logs blusanta-backend --lines 50

# Check stitching service
sudo systemctl status blusanta-stitch
sudo journalctl -u blusanta-stitch -f

# Test ElevenLabs quota
curl -H "xi-api-key: $ELEVENLABS_API_KEY" \
  https://api.elevenlabs.io/v1/user/subscription

# Check GCS bucket
gsutil ls gs://blusanta-campaign-videos/blusanta/constant-videos/english/
```

## 🚨 Common Issues & Solutions

### Issue 1: WhatsApp Messages Not Sent

**Symptoms:** Video completes but employee doesn't receive notification

**Debug Steps:**

1. Check backend logs: `grep "\[GUPSHUP\]" logs/backend-out-0.log`
2. Verify `node-fetch` imported in `utils/gupshup.js`
3. Check `.env` has `GUPSHUP_API_KEY` and `GUPSHUP_VIDEO_READY_TEMPLATE_ID`
4. Test Gupshup API manually: `curl -H "apikey: $GUPSHUP_API_KEY" ...`

**Fix:** Ensure WhatsApp send in `update-after-stitching` webhook (lines 692-724)

### Issue 2: Videos Overlapping in Top-Left Corner

**Symptoms:** Podcast segments (Parts 4 & 6) show videos stacked in corner

**Root Cause:** Missing dynamic zoom expressions or incorrect positioning

**Fix Pattern:**

```python
# Use expressions from bs-video-stitch-code/zoom_stitch.py
left_zoom_expr = f"if(between(n,0,{zoom_duration}),{start_zoom}+({end_zoom}-{start_zoom})*n/{zoom_duration},{end_zoom})"
left_overlay_x_expr = f"30+(900-{left_width_expr})/2"
# NOT hardcoded: left_overlay_x = 30  # ❌ WRONG
```

### Issue 3: Audio Generation Stuck

**Symptoms:** `audio_generation = 0` never updates to `1`

**Debug Steps:**

1. Check ElevenLabs quota: `checkElevenLabsQuota()`
2. Verify voice ID exists: `ELEVENLABS_VOICE_ID` in `.env`
3. Check audio generation lock: `grep "lock acquired" logs/`
4. Test API manually with curl

**Reset:** `pm2 restart blusanta-backend` (resets lock)

### Issue 4: Google Sheet Column Mismatch

**Symptoms:** Final video URL not appearing in correct sheet column

**Root Cause:** Column mappings in `utils/sheet.js` don't match actual sheet

**Fix:** Update column references:

```javascript
// utils/sheet.js
N: final_video_url;
O: video_generated_on;
P: whatsapp_status;
R: name_pronunciation;
S: regenerated;
```

## 📋 Security & Maintenance

### Next.js Security (CVE-2025-66478)

**Status:** ✅ FIXED (as of Dec 2025)

The frontend uses Next.js **15.1.9** which includes the security patch for CVE-2025-66478 (React Server Components vulnerability). No action required.

**Verification:**

```json
// frontend/package.json
{
  "dependencies": {
    "next": "15.1.9" // ✅ Patched version
  }
}
```

**If downgrading:** Use stable Next.js 14.x: `npm install next@14`

### Environment Variables Checklist

Required in `backend/.env`:

- `ELEVENLABS_API_KEY` - ElevenLabs API key
- `ELEVENLABS_VOICE_ID` - BluSanta voice clone ID
- `GUPSHUP_API_KEY` - WhatsApp API key
- `GUPSHUP_VIDEO_READY_TEMPLATE_ID` - WhatsApp template ID
- `GCP_PROJECT_ID` - Google Cloud project
- `GCS_BUCKET_NAME` - `blusanta-campaign-videos`

## 🎓 Learning Path for New AI Agents

**Day 1: Understanding the Pipeline**

1. Read `backend/README.md` (architecture differences)
2. Study `backend/utils/constants.js` (9-part video sequence)
3. Trace one assessment through `blusanta-generation.js`

**Day 2: Video Stitching**

1. Review `blusanta_zoom_stitch.py` structure
2. Understand podcast zoom layout logic
3. Test locally: `python blusanta_zoom_stitch.py`

**Day 3: Integration Points**

1. ElevenLabs API integration (`utils/elevenlabs.js`)
2. WhatsApp notifications (`utils/gupshup.js`)
3. GCS operations (`utils/gcp.js`)

**Testing Command:**

```bash
# End-to-end test
curl -X POST http://localhost:3001/api/blusanta/initiate-audio-generation \
  -H "Content-Type: application/json" \
  -d '{"language": "English"}'
```

## 📝 Code Modification Checklist

Before committing changes:

- [ ] Updated constants.js if video sequence changes
- [ ] Tested with both placeholder videos (Part 2 & 8 use same audio)
- [ ] Verified GCS paths use underscores not spaces
- [ ] Added WhatsApp notification if adding new completion webhook
- [ ] Tested on actual VM (not just local)
- [ ] Checked PM2 logs for errors after restart
- [ ] Updated this doc if architectural changes made

---

**Need Help?** Check existing issues in podcast-setup repo or compare implementation with Bhagyashree project for reference patterns.
