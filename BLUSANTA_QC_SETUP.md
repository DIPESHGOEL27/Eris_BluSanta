# BluSanta QC Automation Setup Guide

## Overview

The BluSanta QC workflow allows QC team to manage video approvals, regenerations, and re-upload requests directly from Google Sheets.

## Sheet Structure

### Columns A-O: Data Entry

- **A**: ID (auto-filled from database)
- **B**: Video Language
- **C**: Campaign Name
- **D**: Employee Code
- **E**: Employee Name
- **F**: Employee Mobile no.
- **G**: Dr. Code
- **H**: Dr. First Name
- **I**: Dr. Last Name
- **J**: Dr. Mobile no.
- **K**: Response video 1
- **L**: Response video 2
- **M**: Response collected on
- **N**: Final video link
- **O**: Video Generated on

### Columns P-T: QC Actions & Status

- **P**: **Status** (Dropdown: Approved/Regenerate/Re-upload)
- **Q**: **Reason for Re-upload** (Text - required when Status = "Re-upload")
- **R**: **Hindi Pronunciation** (Text - optional override for regeneration)
- **S**: **Regenerated?** (Auto-filled: Yes/Pending/blank)
- **T**: **Comments** (Optional notes)

---

## Workflow

### 1. Approved

**When to use**: Video is perfect and ready to send to MR

**Actions**:

1. Select "Approved" in column P (Status)
2. Script automatically sends WhatsApp to MR with video link

**WhatsApp Template**: Video Ready

- Parameter 1: Employee Name
- Parameter 2: Doctor Name
- Parameter 3: Doctor Code
- Parameter 4: Video URL

---

### 2. Regenerate

**When to use**: Video needs to be regenerated with pronunciation correction

**Actions**:

1. (Optional) Enter corrected Hindi pronunciation in column R
2. Select "Regenerate" in column P (Status)
3. Script marks video for regeneration
4. Backend worker auto-regenerates with new pronunciation
5. After regeneration completes, column S (Regenerated?) updates to "Yes"

**Important**:

- If column R (Hindi Pronunciation) is provided, it overrides the original name_pronunciation
- If column R is empty, uses existing pronunciation from database
- Video regenerates automatically via backend worker

---

### 3. Re-upload

**When to use**: Doctor videos need to be re-uploaded due to quality issues

**Actions**:

1. Enter reason in column Q (Reason for Re-upload) - **REQUIRED**
2. Select "Re-upload" in column P (Status)
3. Script sends WhatsApp to MR requesting re-upload with reason

**WhatsApp Template**: Video Re-upload Request

- Parameter 1: Employee Name
- Parameter 2: Doctor Name
- Parameter 3: Doctor Code
- Parameter 4: Reason for Re-upload (from column Q)

---

## Setup Instructions

### Step 1: Open Apps Script Editor

1. Open BluSanta QC Google Sheet
2. Go to **Extensions** > **Apps Script**
3. Delete any existing code
4. Copy code from `BluSanta QC Automation Script.ts`
5. Paste into Apps Script editor
6. Click **Save** (disk icon)

### Step 2: Set Up Trigger

1. In Apps Script editor, click **Run** > Select `setupTrigger` function
2. Click **Run** button
3. Authorize when prompted (grant permissions)
4. You should see "Trigger set up successfully!"

### Step 3: Update Backend URL (if needed)

In the AppScript code, find this line:

```javascript
const url = "http://34.171.167.66:3001/api/blusanta/qc-approved-wa";
```

Update IP if backend VM changes.

### Step 4: Test

1. In Apps Script, find `testTrigger()` function
2. Set `TEST_ROW` to a row with valid data
3. Run `testTrigger()` function
4. Check execution log for success/errors

---

## Backend Configuration

### Environment Variables

Ensure `.env` has:

```env
# Google Sheets
SPREADSHEET_ID=1TDmGcLyQDE8cj2HiXtLpDJAXF-XQaFHLryYj-Q5-r48

# Gupshup WhatsApp Templates
GUPSHUP_VIDEO_READY_TEMPLATE_ID=d9e669e2-e18e-4d18-becf-aed14e1228ef
GUPSHUP_VIDEO_REUPLOAD_TEMPLATE_ID=2a4b3e32-5103-4ff4-b930-060a54c542d9
```

### API Endpoint

Backend endpoint: `POST /api/blusanta/qc-approved-wa`

**Request Body**:

```json
{
  "_id": 123,
  "video_url": "https://storage.googleapis.com/...",
  "status": "Approved|Regenerate|Re-upload",
  "hindi_pronunciation": "डॉक्टर अनिल कुमार",
  "reason_for_reupload": "Poor audio quality"
}
```

**Response**:

```json
{
  "success": true,
  "message": "Video approved. WhatsApp sent to..."
}
```

---

## Troubleshooting

### Script Not Triggering

- Check trigger is installed: Apps Script > **Triggers** (clock icon)
- Should see `onTriggerEdit` with `On edit` event
- Re-run `setupTrigger()` if missing

### WhatsApp Not Sending

- Check backend logs: `pm2 logs blusanta-backend`
- Verify template IDs in `.env`
- Ensure phone numbers in correct format (no +, just country code + number)

### Sheet Not Updating

- Check Google Service Account has edit access to sheet
- Verify `SPREADSHEET_ID` in `.env`
- Check backend logs for sheet update errors

### Regeneration Not Working

- Ensure backend worker is running: `pm2 status`
- Should see `blusanta-worker` in online status
- Check worker logs: `pm2 logs blusanta-worker`

---

## Key Differences from Bhagyashree

| Feature              | Bhagyashree                   | BluSanta              |
| -------------------- | ----------------------------- | --------------------- |
| Doctor Videos        | 4 videos                      | 2 videos              |
| Pronunciation Field  | `hindi_pronounciation` (typo) | `hindi_pronunciation` |
| Status Column        | Column R                      | Column P              |
| Reason Column        | N/A                           | Column Q (Re-upload)  |
| Pronunciation Column | Column T                      | Column R              |
| Regenerated Column   | Column R                      | Column S              |
| Comments Column      | Column S                      | Column T              |

---

## Testing Checklist

- [ ] Test "Approved" status - WhatsApp sent to MR
- [ ] Test "Regenerate" without pronunciation override
- [ ] Test "Regenerate" with pronunciation override in column R
- [ ] Test "Re-upload" with reason in column Q
- [ ] Verify "Regenerated?" updates to "Yes" after completion
- [ ] Check backend logs for errors
- [ ] Verify sheet updates correctly

---

## Support

- Backend logs: `pm2 logs blusanta-backend`
- Worker logs: `pm2 logs blusanta-worker`
- Video stitch logs: `gcloud compute ssh video-stitch-blusanta --command="pm2 logs"`
- Database: `sqlite3 /path/to/blusanta_assessments.db`
