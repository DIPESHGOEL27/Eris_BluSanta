# BluSanta Deployment Status

## ✅ Deployment Complete!

**Date:** December 3, 2025

---

## Infrastructure Details

### GCP Project

- **Project ID:** `sage-shard-448708-v9`
- **Region:** `us-central1`

### VM Instance

- **Name:** `blusanta-campaign`
- **Zone:** `us-central1-c`
- **Machine Type:** `e2-medium`
- **Static IP:** `34.171.167.66`

### GCS Bucket

- **Bucket Name:** `blusanta-campaign-videos`
- **Public Access:** Enabled
- **Constant Videos:** Uploaded to `blusanta/constant-videos/english/`

### Firewall Rules

- `blusanta-allow-web`: Port 3001 (backend)
- `blusanta-allow-frontend`: Port 3000 (frontend)

---

## Application URLs

| Service         | URL                           |
| --------------- | ----------------------------- |
| **Frontend**    | http://34.171.167.66:3000     |
| **Backend API** | http://34.171.167.66:3001/api |

---

## ElevenLabs Voice Clone

| Setting        | Value                    |
| -------------- | ------------------------ |
| **Voice ID**   | `AaOmHgLP2HDIgFFFnMkD`   |
| **Voice Name** | BluSanta                 |
| **Model**      | `eleven_multilingual_v2` |

---

## Video Configuration

### 9-Part Video Sequence

| #   | Video File                           | Type        | Audio                |
| --- | ------------------------------------ | ----------- | -------------------- |
| 1   | 1_Const_Intro.mp4                    | CONSTANT    | Original             |
| 2   | 2_Doctor_Placeholder.mp4             | PLACEHOLDER | "Doctor [Name]"      |
| 3   | 3_Const_Question_1.mp4               | CONSTANT    | Original             |
| 4   | 4_Blusanta_Noding.mp4                | NODDING     | Original             |
| 5   | 5_Const_Question_2.mp4               | CONSTANT    | Original             |
| 6   | 6_Blusanta_Noding.mp4                | NODDING     | Original             |
| 7   | 7_Const_Blusanta_Thank you.mp4       | CONSTANT    | Original             |
| 8   | 8_Doctor_Plc_Blusanta_Thank you.mp4  | PLACEHOLDER | "Doctor [Name]" (\*) |
| 9   | 9_Const_outro_Blusanta_Thank you.mp4 | CONSTANT    | Original             |

> (\*) SAME audio as Part 2 - ElevenLabs generates only ONE audio file per assessment

### Doctor Videos

- **Video 1:** Doctor's response to Question 1
- **Video 2:** Doctor's response to Question 2

---

## PM2 Process Manager

Both apps are managed by PM2 and will auto-restart on system boot.

### Useful Commands (SSH into VM first)

```bash
pm2 status          # Check app status
pm2 logs            # View logs
pm2 restart all     # Restart all apps
pm2 stop all        # Stop all apps
```

---

## API Endpoints

### Assessments

- `GET /api/assessments` - List all assessments
- `POST /api/assessments/submit` - Submit new assessment

### BluSanta Generation

- `POST /api/blusanta/initiate-audio-generation` - Generate ElevenLabs audio
- `POST /api/blusanta/initiate-video-stitching` - Stitch final video
- `POST /api/blusanta/update-after-stitching` - Webhook for stitching completion

### Storage

- `POST /api/storage/signed-url` - Get signed URL for video upload

---

## Next Steps

1. **Test End-to-End Flow:**

   - Submit an assessment via frontend
   - Check if audio generates correctly
   - Verify video stitching works

2. **Optional - Domain Setup:**

   - Point a domain to `34.171.167.66`
   - Set up SSL with nginx

3. **Optional - Hindi Language Support:**
   - Upload Hindi constant videos to `blusanta/constant-videos/hindi/`

---

## Troubleshooting

### Check Backend Logs

```bash
gcloud compute ssh blusanta-campaign --zone=us-central1-c --command="pm2 logs blusanta-backend --lines 50"
```

### Check Frontend Logs

```bash
gcloud compute ssh blusanta-campaign --zone=us-central1-c --command="pm2 logs blusanta-frontend --lines 50"
```

### Restart Services

```bash
gcloud compute ssh blusanta-campaign --zone=us-central1-c --command="pm2 restart all"
```

### Check Database

```bash
gcloud compute ssh blusanta-campaign --zone=us-central1-c --command="sqlite3 /home/Dipesh_Goel/blusanta/backend/blusanta_assessments.db '.tables'"
```
