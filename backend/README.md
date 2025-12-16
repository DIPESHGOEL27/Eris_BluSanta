# BluSanta Video Assessment Backend

Personalized video generation backend for the BluSanta campaign. This is adapted from the Bhagyashree project with key architectural differences.

## 🎯 Key Differences from Bhagyashree

| Feature              | Bhagyashree                         | BluSanta                         |
| -------------------- | ----------------------------------- | -------------------------------- |
| **Video Generation** | MuseTalk VMs for lip-sync           | Pre-recorded constant videos     |
| **Audio (TTS)**      | Custom TTS VM (port 8079)           | ElevenLabs API                   |
| **Pipeline Stages**  | Audio → Video → Stitching           | Audio → Stitching (no video gen) |
| **VMs Required**     | TTS VM + MuseTalk VM + Stitching VM | Stitching VM only                |
| **Personalization**  | Lip-synced avatar video             | Audio overlay on constant video  |

## 📋 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                  │
│  (Assessment Form - collects videos + name pronunciation)       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BLUSANTA BACKEND                             │
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────┐                     │
│  │  /submit-       │    │  /initiate-     │                     │
│  │  assessment     │───▶│  audio-gen      │                     │
│  └─────────────────┘    └─────────────────┘                     │
│                                │                                 │
│                                ▼                                 │
│                    ┌─────────────────────┐                      │
│                    │   ElevenLabs API    │                      │
│                    │  (generates audio)  │                      │
│                    └─────────────────────┘                      │
│                                │                                 │
│                                ▼                                 │
│                    ┌─────────────────────┐                      │
│                    │  /initiate-video-   │                      │
│                    │  stitching          │                      │
│                    └─────────────────────┘                      │
│                                │                                 │
└────────────────────────────────│────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    STITCHING VM (GCP)                            │
│                                                                  │
│  Combines:                                                       │
│  • Pre-recorded constant videos                                  │
│  • ElevenLabs-generated personalized audio                      │
│  • User-uploaded videos (4 videos)                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GOOGLE CLOUD STORAGE                          │
│                                                                  │
│  • Input videos from frontend                                    │
│  • Generated audio files                                         │
│  • Final stitched videos                                         │
│  • Pre-recorded constant video assets                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 📂 Project Structure

```
backend/
├── index.js                 # Express server entry point
├── package.json
├── .env.example             # Environment variables template
├── .gitignore
│
├── db/
│   └── database.js          # SQLite database setup
│
├── data/
│   └── service-account-key.json  # GCP service account (not in git)
│
├── routes/
│   ├── assessments.js       # Assessment CRUD endpoints
│   ├── storage.js           # GCS signed URL endpoints
│   ├── whatsapp.js          # WhatsApp notification endpoints
│   ├── blusanta-generation.js  # Core generation pipeline
│   └── db-admin.js          # Admin dashboard
│
└── utils/
    ├── constants.js         # BluSanta configuration
    ├── elevenlabs.js        # ElevenLabs TTS integration
    ├── gcp.js               # GCP utilities (VM, Storage)
    ├── gupshup.js           # WhatsApp API
    ├── sheet.js             # Google Sheets integration
    └── index.js             # Common utilities
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Google Cloud Platform account with:
  - Cloud Storage bucket
  - Compute Engine (for stitching VM)
  - Service account with appropriate permissions
- ElevenLabs account with API key
- Gupshup account for WhatsApp (optional)

### Installation

```bash
cd backend
npm install
```

### Configuration

1. Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

2. Fill in your environment variables:

```env
# Server
PORT=3001

# Database
DB_NAME=blusanta_assessments.db

# GCP
GCP_PROJECT_ID=your-project-id
GCP_KEY_FILE=./data/service-account-key.json
GCS_BUCKET_NAME=your-bucket

# ElevenLabs (CRITICAL)
ELEVENLABS_API_KEY=your-api-key
ELEVENLABS_VOICE_ID=your-voice-id

# Google Sheets
SPREADSHEET_ID=your-sheet-id

# Gupshup (optional)
GUPSHUP_API_KEY=your-api-key
```

3. Add your GCP service account key:

```bash
# Place your service account JSON at:
data/service-account-key.json
```

### Running

```bash
# Development
npm run dev

# Production
npm start
```

## 🎤 ElevenLabs Integration

The key difference in BluSanta is using ElevenLabs for audio generation instead of a custom TTS VM.

### Setting Up ElevenLabs

1. Create an account at [elevenlabs.io](https://elevenlabs.io)
2. Get your API key from Settings
3. Create or select a voice for BluSanta
4. Copy the Voice ID

### Voice ID

You can find available voices using the test endpoint:

```bash
curl http://localhost:3001/api/blusanta/test-elevenlabs
```

Or use the ElevenLabs dashboard to find your voice ID.

## 🎬 Video Stitching Sequence

Unlike Bhagyashree (which generates lip-synced avatar videos), BluSanta uses **pre-recorded constant videos** with **audio overlay**.

### Stitching Sequence

```
1. Intro (constant)
2. Name Segment (constant video + ElevenLabs audio overlay) ← PERSONALIZATION
3. Const_001 (transition to Q1)
4. User Video 1 + Nodding reaction
5. Const_002 (transition to Q2)
6. User Video 2 + Nodding reaction
7. Const_003 (transition to Q3)
8. User Video 3 + Nodding reaction
9. Const_004 (transition to Q4)
10. User Video 4 + Nodding reaction
11. Outro (constant)
```

### Required Video Assets

Upload these to GCS at `gs://your-bucket/blusanta/[language]_video_assets/`:

```
english_video_assets/
├── intro.mp4
├── name_segment.mp4      # Audio will be overlaid here
├── constant/
│   ├── const_000.mp4
│   ├── const_001.mp4
│   ├── const_002.mp4
│   ├── const_003.mp4
│   ├── const_004.mp4
│   └── const_005.mp4
├── nodding.mp4
├── outro.mp4
├── bg_zoom.png
├── Lato-Regular.ttf
├── Montserrat-SemiBold.ttf
└── subtitles/
    └── ...

hindi_video_assets/
└── (same structure)
```

## 📡 API Endpoints

### Assessment Endpoints

| Method | Endpoint                 | Description           |
| ------ | ------------------------ | --------------------- |
| POST   | `/api/submit-assessment` | Submit new assessment |
| GET    | `/api/assessment/:id`    | Get assessment by ID  |
| GET    | `/api/assessments`       | List all assessments  |

### Generation Pipeline

| Method | Endpoint                                  | Description                      |
| ------ | ----------------------------------------- | -------------------------------- |
| POST   | `/api/blusanta/initiate-audio-generation` | Trigger audio generation         |
| POST   | `/api/blusanta/initiate-video-stitching`  | Trigger video stitching          |
| POST   | `/api/blusanta/update-after-stitching`    | Webhook for stitching completion |
| POST   | `/api/blusanta/retry-pending-assessments` | Retry stuck assessments          |

### QC & Admin

| Method | Endpoint                       | Description              |
| ------ | ------------------------------ | ------------------------ |
| POST   | `/api/blusanta/qc-approved-wa` | QC approval/regeneration |
| GET    | `/admin`                       | Admin dashboard          |
| POST   | `/admin/reset-assessment/:id`  | Reset an assessment      |

### Testing

| Method | Endpoint                        | Description                |
| ------ | ------------------------------- | -------------------------- |
| GET    | `/api/blusanta/test-elevenlabs` | Test ElevenLabs connection |
| GET    | `/health`                       | Health check               |

## 🔄 Pipeline Flow

```
1. User submits assessment form (with name pronunciation)
   └─▶ POST /api/submit-assessment

2. Cron or manual trigger initiates audio generation
   └─▶ POST /api/blusanta/initiate-audio-generation
   └─▶ ElevenLabs API generates audio
   └─▶ Audio uploaded to GCS

3. After audio, stitching is triggered automatically
   └─▶ POST /api/blusanta/initiate-video-stitching
   └─▶ Stitching VM combines:
       • Constant videos
       • Personalized audio (overlay)
       • User videos

4. Stitching VM calls webhook on completion
   └─▶ POST /api/blusanta/update-after-stitching
   └─▶ Updates database and Google Sheet

5. QC review in Google Sheet
   └─▶ Apps Script calls /api/blusanta/qc-approved-wa
   └─▶ WhatsApp sent on approval
```

## 🛠️ Development

### Adding New Constant Videos

1. Record and edit your constant video segments
2. Upload to GCS at the correct path
3. Update `utils/constants.js` if sequence changes

### Changing Voice

1. Get new voice ID from ElevenLabs
2. Update `ELEVENLABS_VOICE_ID` in `.env`
3. Test with `/api/blusanta/test-elevenlabs`

### Database Schema

```sql
CREATE TABLE assessments (
  id INTEGER PRIMARY KEY,
  employee_code TEXT,
  employee_name TEXT,
  employee_mobile TEXT,
  dr_code TEXT,
  dr_first_name TEXT,
  dr_last_name TEXT,
  dr_mobile TEXT,
  video_language TEXT,
  name_pronunciation TEXT,    -- User input for pronunciation
  avatar_name TEXT DEFAULT 'blusanta',
  audio_generation BOOLEAN DEFAULT 0,
  video_generation BOOLEAN DEFAULT 0,  -- Always 0 for BluSanta (no MuseTalk)
  video_stitch BOOLEAN DEFAULT 0,
  final_video_url TEXT,
  error_message TEXT,
  is_regenerated BOOLEAN DEFAULT 0,
  created_at TIMESTAMP
);
```

## 📊 Monitoring

- **Admin Dashboard**: `http://localhost:3001/admin`
- **Health Check**: `http://localhost:3001/health`
- **Logs**: Check console output for `[BLUSANTA]` prefixed logs

## ⚠️ Important Notes

1. **No MuseTalk Required**: Unlike Bhagyashree, BluSanta doesn't need MuseTalk VMs
2. **ElevenLabs Quota**: Monitor your ElevenLabs character quota
3. **Video Assets**: Must upload pre-recorded constant videos before running
4. **Stitching VM**: The same stitching VM from Bhagyashree can be reused

## 🐛 Troubleshooting

### ElevenLabs Errors

```bash
# Test API connection
curl http://localhost:3001/api/blusanta/test-elevenlabs
```

### Stuck Assessments

```bash
# Trigger retry
curl -X POST http://localhost:3001/api/blusanta/retry-pending-assessments
```

### Reset an Assessment

Use the admin dashboard or:

```bash
curl -X POST http://localhost:3001/admin/reset-assessment/123
```

## 📜 License

Private - Indo AI Technologies
