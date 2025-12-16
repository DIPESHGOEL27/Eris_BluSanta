# ✅ BluSanta 8-Segment Deployment Checklist

**Date:** December 8, 2025  
**Status:** Ready for Testing

---

## 📋 Deployment Status

### ✅ Backend Files Deployed

- [x] `backend/utils/constants.js` - Updated with correct payload structure
- [x] `backend/utils/elevenlabs.js` - Generates TWO audio files
- [x] `backend/routes/blusanta-generation.js` - Handles TWO audio URLs
- [x] PM2 Backend restarted (pid: 4091771)

### ✅ Stitching VM Files Deployed

- [x] `blusanta_zoom_stitch.py` - 8-segment structure with TWO audio overlays
- [x] PM2 Stitching service restarted (pid: 100359)

### ✅ GCS Assets Uploaded

- [x] `const_000.mp4` - Intro + greeting merged (66.6 MB total for 4 files)
- [x] `const_001.mp4` - Question 1
- [x] `const_002.mp4` - Question 2
- [x] `const_003.mp4` - Final message + outro
- [x] `plc_000.mp4` - Placeholder for greeting audio (766.4 KB total for 2 files)
- [x] `plc_001.mp4` - Placeholder for thank you audio
- [x] `nodding.mp4` - Nodding video (223.5 MB)
- [x] `Podcast_BG.jpg` - Background image (1.2 MB)

**Total Assets:** 292.1 MB uploaded to GCS

---

## 🎯 Ready for Testing

### Test Script Created

- `test-8-segment-flow.ps1` - Automated test script

### Test Procedure

1. **Upload Test Doctor Videos to GCS:**

   ```powershell
   gsutil cp "path\to\doctor_response_1.mp4" gs://blusanta-campaign-videos/test/doctor_response_1.mp4
   gsutil cp "path\to\doctor_response_2.mp4" gs://blusanta-campaign-videos/test/doctor_response_2.mp4
   ```

2. **Run Test Script:**

   ```powershell
   cd "c:\Users\Dipesh_Goel\AI Video Training\ErisBluSanta"
   .\test-8-segment-flow.ps1
   ```

3. **Monitor Logs:**

   ```bash
   # Backend logs
   gcloud compute ssh blusanta-campaign --zone=us-central1-c --command="pm2 logs blusanta-backend --lines 50"

   # Stitching logs
   gcloud compute ssh video-stitch-blusanta --zone=us-central1-a --command="pm2 logs video-stitch --lines 50"
   ```

4. **Verify Output:**

   ```bash
   # Check final video
   gsutil ls gs://blusanta-campaign-videos/blusanta/final-videos/

   # Download and verify
   gsutil cp gs://blusanta-campaign-videos/blusanta/final-videos/TEST001_DR001_final.mp4 .
   ```

---

## 🎤 TWO Audio Files System

### Greeting Audio (Segment 1)

- **Text:** `"Doctor {first_name}"`
- **Example:** "Doctor Abhishek"
- **File:** `{employee_code}_{dr_code}_greeting.mp3`
- **GCS Path:** `gs://blusanta-campaign-videos/blusanta/audio/names/english/TEST001_DR001_greeting.mp3`
- **Applied to:** `plc_000.mp4` at segment 1

### Thank You Audio (Segment 6)

- **Text:** `"Thank you Doctor {first_name}"`
- **Example:** "Thank you Doctor Abhishek"
- **File:** `{employee_code}_{dr_code}_thankyou.mp3`
- **GCS Path:** `gs://blusanta-campaign-videos/blusanta/audio/names/english/TEST001_DR001_thankyou.mp3`
- **Applied to:** `plc_001.mp4` at segment 6

---

## 📹 8-Segment Structure

```
Segment 0: const_000.mp4 (Intro + Greeting)
    ↓
Segment 1: plc_000.mp4 + greeting_audio.mp3 🎤 "Doctor Abhishek"
    ↓
Segment 2: const_001.mp4 (Question 1)
    ↓
Segment 3: nodding.mp4 + doctor_response_1.mp4 🎬 ZOOM
    ↓
Segment 4: const_002.mp4 (Question 2)
    ↓
Segment 5: nodding.mp4 + doctor_response_2.mp4 🎬 ZOOM
    ↓
Segment 6: plc_001.mp4 + thankyou_audio.mp3 🎤 "Thank you Doctor Abhishek"
    ↓
Segment 7: const_003.mp4 (Final + Outro)
```

---

## 🔍 Verification Points

### Audio Generation ✅

- [ ] Greeting audio file created in GCS
- [ ] Thank you audio file created in GCS
- [ ] Both audio files have correct pronunciation
- [ ] Audio quality is clear and natural

### Video Stitching ✅

- [ ] All 8 segments processed in order
- [ ] Greeting audio overlay applied to segment 1
- [ ] Thank you audio overlay applied to segment 6
- [ ] ZOOM layout correct in segments 3 and 5
- [ ] Nodding video trimmed to doctor response duration
- [ ] Final video concatenated without gaps

### Final Output ✅

- [ ] Video plays smoothly from start to finish
- [ ] Audio synced correctly in all segments
- [ ] ZOOM layout shows BluSanta left, Doctor right
- [ ] Background image displayed correctly in ZOOM segments
- [ ] No visual glitches or artifacts
- [ ] File size reasonable (estimate: ~100-150 MB)

---

## 🚨 Common Issues & Solutions

### Issue: Audio generation fails

**Solution:** Check ElevenLabs API quota and credentials in `.env`

### Issue: Stitching fails with "file not found"

**Solution:** Verify all GCS paths are correct and files exist

### Issue: ZOOM layout looks wrong

**Solution:** Check `Podcast_BG.jpg` dimensions and FFmpeg overlay coordinates

### Issue: Nodding video too long/short

**Solution:** Python script auto-trims to doctor video duration

### Issue: Final video has gaps between segments

**Solution:** Ensure all videos standardized to 1920x1080, 25fps, aac stereo

---

## 📊 Performance Metrics

### Expected Processing Times

- Audio generation (TWO files): ~5-10 seconds
- Segment processing: ~2-3 minutes per segment
- Total stitching time: ~20-30 minutes for 8 segments
- Final concatenation: ~2-3 minutes

### Resource Usage

- Backend VM: Low CPU, ~40 MB memory
- Stitching VM: High CPU during processing, ~60 MB memory
- GCS bandwidth: ~300 MB download, ~150 MB upload

---

## 🎉 Success Criteria

✅ **Deployment Complete When:**

1. TWO audio files generated successfully
2. All 8 segments processed without errors
3. Final video plays smoothly end-to-end
4. Audio overlays sound natural and clear
5. ZOOM layout looks professional
6. WhatsApp notification sent to admin

---

## 📝 Next Steps After Testing

1. **Production Rollout:**

   - Update frontend with new flow
   - Configure production doctor video uploads
   - Set up automated testing

2. **Monitoring:**

   - Set up error alerts
   - Track ElevenLabs quota usage
   - Monitor stitching VM performance

3. **Optimization:**
   - Enable parallel composite uploads for large files
   - Consider video compression optimization
   - Add caching for frequently accessed assets

---

**Last Updated:** December 8, 2025  
**Updated By:** GitHub Copilot  
**Deployment Version:** 8-Segment v1.0
