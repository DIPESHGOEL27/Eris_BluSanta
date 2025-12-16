# BluSanta Podcast Video Stitching - Implementation Summary

## Overview

BluSanta uses a **two-stage stitching process** with **two different layouts**:

- **Full-screen layout**: For constant and placeholder videos
- **Podcast zoom layout**: Side-by-side view with Podcast_BG.jpg for Q&A segments

## Video Sequence

### Stage 1: Podcast Video (9 parts)

| Part | Video                                  | Layout           | Audio      | Description                        |
| ---- | -------------------------------------- | ---------------- | ---------- | ---------------------------------- |
| 1    | `1_Const_Intro.mp4`                    | Full-screen      | Original   | Podcast intro                      |
| 2    | `2_Doctor_Placeholder.mp4`             | Full-screen      | ElevenLabs | Doctor name intro (audio replaced) |
| 3    | `3_Const_Question_1.mp4`               | Full-screen      | Original   | Question 1                         |
| 4    | `4_Blusanta_Noding.mp4` + DrVideo1     | **Podcast Zoom** | Original   | Q&A segment 1 (side-by-side)       |
| 5    | `5_Const_Question_2.mp4`               | Full-screen      | Original   | Question 2                         |
| 6    | `6_Blusanta_Noding.mp4` + DrVideo2     | **Podcast Zoom** | Original   | Q&A segment 2 (side-by-side)       |
| 7    | `7_Const_Blusanta_Thank you.mp4`       | Full-screen      | Original   | Thank you message                  |
| 8    | `8_Doctor_Plc_Blusanta_Thank you.mp4`  | Full-screen      | ElevenLabs | Doctor thank you (audio replaced)  |
| 9    | `9_Const_outro_Blusanta_Thank you.mp4` | Full-screen      | Original   | Podcast outro                      |

### Stage 2: Final Wrap (3 parts)

| Part | Video                   | Description    |
| ---- | ----------------------- | -------------- |
| 1    | `Final_Video_Intro.mp4` | Campaign intro |
| 2    | Stitched Podcast Video  | From Stage 1   |
| 3    | `Final_Video_Outro.mp4` | Campaign outro |

## Layouts

### Full-Screen Layout

Used for parts 1, 2, 3, 5, 7, 8, 9:

- Video plays at 1920x1080 (full resolution)
- Original or replaced audio

### Podcast Zoom Layout

Used for parts 4 and 6 (Q&A segments):

- Background: `Podcast_BG.jpg` (1920x1080)
- BluSanta (left): 640x720 at position (140, 180)
- Doctor (right): 640x720 at position (1140, 180)
- Audio: BluSanta's original audio
- Duration: Trimmed to shorter of the two videos

## Audio Processing

### ElevenLabs Audio Overlays

- **ONE audio file** generated: "Doctor [First] [Last]"
- **Used twice**: Parts 2 and 8
- Video trimmed to match audio duration

### Nodding Duration Matching

- Part 4 (nodding1): Trimmed to match DrVideo1 duration
- Part 6 (nodding2): Trimmed to match DrVideo2 duration

## Payload Structure

```json
{
  "intro_path": "gs://.../1_Const_Intro.mp4",
  "outro_path": "gs://.../9_Const_outro_Blusanta_Thank you.mp4",
  "final_intro_path": "gs://.../Final_Video_Intro.mp4",
  "final_outro_path": "gs://.../Final_Video_Outro.mp4",
  "podcast_background": "gs://.../Podcast_BG.jpg",

  "assets_actor_paths": [
    "2_Doctor_Placeholder.mp4",
    "3_Const_Question_1.mp4",
    "4_Blusanta_Noding.mp4",
    "5_Const_Question_2.mp4",
    "6_Blusanta_Noding.mp4",
    "7_Const_Blusanta_Thank you.mp4",
    "8_Doctor_Plc_Blusanta_Thank you.mp4"
  ],

  "assets_doctor_paths": [
    null,
    null,
    "DrVideo1.mp4",
    null,
    "DrVideo2.mp4",
    null,
    null
  ],

  "audio_overlays": [
    {
      "segment_index": 0,
      "audio_path": "name.mp3",
      "trim_video_to_audio": true
    },
    {
      "segment_index": 6,
      "audio_path": "name.mp3",
      "trim_video_to_audio": true
    }
  ],

  "nodding_segments": [
    { "nodding_index": 2, "match_duration_of": 2 },
    { "nodding_index": 4, "match_duration_of": 4 }
  ],

  "final_upload_path": "gs://.../final.mp4"
}
```

## Implementation Files

### Backend

- `ErisBluSanta/backend/utils/constants.js` - Config and payload builder
- `ErisBluSanta/backend/routes/blusanta-generation.js` - Orchestration

### Stitching VM

- `blusanta_zoom_stitch.py` - Two-stage stitching with podcast layout
- Deploy to `video-stitch-blusanta` VM

### Test

- `test-blusanta-zoom.py` - Local test script
- `ErisBluSanta/videos/` - Test assets folder

## Key Features

1. **Podcast Zoom Layout**: Side-by-side view for Q&A segments only
2. **Full-Screen Layout**: All other segments play at full resolution
3. **Audio Overlay**: Same ElevenLabs audio used twice (efficient)
4. **Dynamic Duration**: Nodding videos adapt to doctor response length
5. **Two-Stage Process**: Podcast video first, then wrap with intro/outro

## FFmpeg Commands

### Audio Replacement

```bash
ffmpeg -i video.mp4 -i audio.mp3 -t <audio_dur> \
  -map 0:v -map 1:a -c:v libx264 -c:a aac -shortest output.mp4
```

### Podcast Zoom Layout

```bash
ffmpeg -loop 1 -i Podcast_BG.jpg -i blusanta.mp4 -i doctor.mp4 \
  -filter_complex "[0:v]scale=1920:1080[bg]; \
                   [1:v]scale=640:720[left]; \
                   [2:v]scale=640:720[right]; \
                   [bg][left]overlay=x=140:y=180[tmp]; \
                   [tmp][right]overlay=x=1140:y=180[v]" \
  -map "[v]" -map 1:a -t <min_dur> output.mp4
```

### Concatenation

```bash
ffmpeg -f concat -safe 0 -i concat_list.txt \
  -c:v libx264 -crf 23 -c:a aac output.mp4
```

## Deployment Steps

1. Upload assets to GCS:

   ```
   gsutil cp ErisBluSanta/videos/* gs://blusanta-campaign-videos/blusanta/constant-videos/english/
   ```

2. Deploy stitching script to VM:

   ```
   gcloud compute scp blusanta_zoom_stitch.py video-stitch-blusanta:~/zoom_stitch.py
   ```

3. Test with debug payload:

   ```
   curl -X POST http://<vm-ip>:8080/stitching \
     -H "Authorization: Bearer <token>" \
     -d @test_payload.json
   ```

4. Trigger via backend:
   ```
   POST /api/blusanta/initiate-video-stitching
   ```

## Troubleshooting

### Audio Overlays Not Working

- Check ElevenLabs audio file exists at specified path
- Verify `trim_video_to_audio: true` is set
- Check ffmpeg logs for audio codec errors

### Podcast Zoom Layout Issues

- Verify Podcast_BG.jpg is 1920x1080
- Check video scaling (should be 640x720)
- Validate overlay positions (140,180 and 1140,180)

### Duration Mismatches

- Nodding videos should be longer than doctor videos
- Check `match_duration_of` indices are correct
- Verify doctor video files exist and are valid

### Concat Failures

- Ensure all segments have same codec/resolution
- Check concat_list.txt file paths are absolute
- Verify all intermediate files exist before concat
