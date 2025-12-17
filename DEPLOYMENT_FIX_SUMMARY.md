# BluSanta Video Stitching - Fix Summary

**Date**: December 16, 2024  
**Assessment**: #54 (E13298_00257814)

## Issues Identified and Fixed

### 1. FFmpeg Filter Script Issue

**Problem**: FFmpeg command line with `-filter_complex` was too long, causing "Error opening output file: Invalid argument" (exit code 234)

**Root Cause**: The podcast zoom filter expressions with cosine interpolation animations created extremely long command lines that exceeded system limits.

**Solution**: Changed from inline `-filter_complex` to `-filter_complex_script`:

```python
# Write filter_complex to file to avoid command-line length issues
job_temp_dir = os.path.dirname(output_path)
filter_script_path = os.path.join(job_temp_dir, 'filter_script.txt')
with open(filter_script_path, 'w', encoding='utf-8') as f:
    f.write(filter_complex)

cmd = [
    # ... other params ...
    "-filter_complex_script", filter_script_path,
    # ... rest of command ...
]
```

**File**: [blusanta_zoom_stitch.py](blusanta_zoom_stitch.py#L1148-L1157)

### 2. Unsupported Audio Codec Issue

**Problem**: Doctor videos with 'apac' audio codec caused FFmpeg to fail with "Could not find codec parameters for stream 1"

**Root Cause**: Some doctor videos (.mov files) have proprietary audio codecs that FFmpeg cannot decode.

**Solution**: Added audio transcoding before processing:

```python
# Transcode doctor video to ensure compatible audio codec
doctor_video_transcoded = os.path.join(job_temp_dir, 'doctor_transcoded.mp4')

logger.info(f"Transcoding doctor video to ensure audio compatibility...")
transcode_cmd = [
    'ffmpeg', '-y', '-i', doctor_video,
    '-c:v', 'copy',  # Copy video stream as-is
    '-c:a', 'aac',   # Convert audio to AAC
    '-ar', '44100',  # Standard sample rate
    '-ac', '2',      # Stereo
    '-b:a', '128k',  # Standard bitrate
    doctor_video_transcoded
]

subprocess.run(transcode_cmd, check=True, capture_output=True, text=True)
doctor_video = doctor_video_transcoded  # Use transcoded version
```

**File**: [blusanta_zoom_stitch.py](blusanta_zoom_stitch.py#L923-L943)

## Git Repository Setup

### Repository Information

- **GitHub**: https://github.com/DIPESHGOEL27/Eris_BluSanta.git
- **Branch**: master
- **Initial Commit**: 1f27fb9 (72 files, 25,026 insertions)

### Deployment Workflow

1. **Make changes locally** in `c:\Users\Dipesh_Goel\AI Video Training\ErisBluSanta`
2. **Test changes** if possible
3. **Commit to Git**:
   ```powershell
   git add .
   git commit -m "Description of changes"
   git push origin master
   ```
4. **Deploy to VM**:
   ```powershell
   .\deploy-to-vm.ps1 -Restart
   ```

### Deployment Script

Created `deploy-to-vm.ps1` that:

- Creates timestamped backup on VM
- Uploads `blusanta_zoom_stitch.py` to video-stitch-blusanta
- Optionally restarts PM2 service

Usage:

```powershell
# Deploy without restart
.\deploy-to-vm.ps1

# Deploy and restart service
.\deploy-to-vm.ps1 -Restart
```

## Test Results - Assessment #54

### Job Information

- **Job ID**: job_1765919957142
- **Start Time**: 21:19:14 UTC
- **End Time**: 21:29:24 UTC
- **Duration**: 607.67 seconds (~10.1 minutes)
- **Employee Code**: E13298
- **Doctor Code**: 00257814
- **Language**: English

### Processing Steps ✅

1. ✅ Downloaded 12 files from GCS (constant videos, doctor videos, audio)
2. ✅ Part 1 (Constant): Standardized
3. ✅ Part 2 (Audio Overlay - greeting): Audio replaced, **subtitles generated and applied**
4. ✅ Part 3 (Constant): Standardized
5. ✅ Part 4 (Podcast Zoom): **Doctor video transcoded**, segment created, **subtitles generated and applied**
6. ✅ Part 5 (Constant): Standardized
7. ✅ Part 6 (Podcast Zoom): **Doctor video transcoded**, segment created, **subtitles generated and applied**
8. ✅ Part 7 (Audio Overlay - thank you): Audio replaced, **subtitles generated and applied**
9. ✅ Part 8 (Constant): Standardized
10. ✅ All segments concatenated successfully
11. ✅ Final video uploaded to GCS
12. ✅ Webhook sent (HTTP 200)
13. ✅ Database updated (video_stitch=1)

### Subtitles Verification

All 4 dynamic segments received subtitles via OpenAI Whisper API:

- **Part 2** (Audio Overlay): `p2_temp.ass` → Applied
- **Part 4** (Podcast Zoom): `p4_podcast_temp.ass` → Applied
- **Part 6** (Podcast Zoom): `p6_podcast_temp.ass` → Applied
- **Part 7** (Audio Overlay): `p7_temp.ass` → Applied

### Final Output

- **URL**: https://storage.googleapis.com/blusanta-campaign-videos/blusanta/results/E13298_00257814_final.mp4
- **Database Status**: video_stitch=1 ✅

## Key Improvements

### Reliability

- ✅ Handles long FFmpeg filter expressions without command-line length issues
- ✅ Automatically transcodes incompatible audio codecs
- ✅ Robust error handling with fallback to original video if transcoding fails

### Maintainability

- ✅ Git version control with GitHub integration
- ✅ Automated deployment script with backup creation
- ✅ Clear documentation in DEPLOYMENT_WORKFLOW.md
- ✅ Proper .gitignore for sensitive files and large media

### Code Quality

- ✅ Fixed version matches VM production version
- ✅ Added comprehensive logging for transcoding steps
- ✅ Filter script cleanup handled automatically

## Files Changed

### Modified

- `blusanta_zoom_stitch.py` - Main video stitching script
  - Added filter script file support
  - Added audio transcoding for doctor videos

### New

- `deploy-to-vm.ps1` - Automated deployment script
- `DEPLOYMENT_WORKFLOW.md` - Deployment documentation
- `.gitignore` - Git ignore patterns
- `DEPLOYMENT_FIX_SUMMARY.md` - This file

## Next Steps

### Monitoring

- Monitor subsequent assessments to ensure fixes work consistently
- Check logs for any edge cases with different video formats

### Potential Enhancements

- Add video format validation before processing
- Implement parallel processing for independent segments
- Add progress reporting via webhook or database updates

### Documentation

- Update main README with new deployment workflow
- Document common troubleshooting scenarios
- Create runbook for VM maintenance

## Commands Reference

### Check Service Status

```powershell
gcloud compute ssh video-stitch-blusanta --zone=us-central1-a --command="pm2 status"
```

### View Logs

```powershell
gcloud compute ssh video-stitch-blusanta --zone=us-central1-a --command="pm2 logs video-stitch --lines 50"
```

### Check Database

```powershell
gcloud compute ssh blusanta-campaign --zone=us-central1-c --command="sqlite3 /home/Dipesh_Goel/blusanta/backend/data/blusanta_assessments.db 'SELECT id, employee_code, dr_code, video_stitch FROM assessments WHERE id=54;'"
```

### Deploy Changes

```powershell
cd "c:\Users\Dipesh_Goel\AI Video Training\ErisBluSanta"
git add .
git commit -m "Description"
git push origin master
.\deploy-to-vm.ps1 -Restart
```

---

**Status**: ✅ All fixes deployed and verified working
**Repository**: https://github.com/DIPESHGOEL27/Eris_BluSanta.git
**Last Updated**: December 16, 2024, 21:30 UTC
