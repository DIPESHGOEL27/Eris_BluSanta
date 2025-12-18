"""
Local test for BluSanta Zoom Stitching
Tests the podcast layout with side-by-side zoom for Q&A segments
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(__file__))

from blusanta_zoom_stitch import blusanta_video_stitching

# Test payload - mimics what the backend sends
test_payload = {
    # Podcast intro/outro (full-screen)
    "intro_path": "file://c:/Users/Dipesh_Goel/AI Video Training/ErisBluSanta/videos/1_Const_Intro.mp4",
    "outro_path": "file://c:/Users/Dipesh_Goel/AI Video Training/ErisBluSanta/videos/9_Const_outro_Blusanta_Thank you.mp4",
    
    # Final wrap intro/outro
    "final_intro_path": "file://c:/Users/Dipesh_Goel/AI Video Training/ErisBluSanta/videos/Final_Video_Intro.mp4",
    "final_outro_path": "file://c:/Users/Dipesh_Goel/AI Video Training/ErisBluSanta/videos/Final_Video_Outro.mp4",
    
    # Podcast background for zoom layout
    "podcast_background": "file://c:/Users/Dipesh_Goel/AI Video Training/ErisBluSanta/videos/Podcast_BG.jpg",
    
    # Actor/BluSanta videos (7 middle parts)
    "assets_actor_paths": [
        "file://c:/Users/Dipesh_Goel/AI Video Training/ErisBluSanta/videos/2_Doctor_Placeholder.mp4",
        "file://c:/Users/Dipesh_Goel/AI Video Training/ErisBluSanta/videos/3_Const_Question_1.mp4",
        "file://c:/Users/Dipesh_Goel/AI Video Training/ErisBluSanta/videos/4_Blusanta_Noding.mp4",
        "file://c:/Users/Dipesh_Goel/AI Video Training/ErisBluSanta/videos/5_Const_Question_2.mp4",
        "file://c:/Users/Dipesh_Goel/AI Video Training/ErisBluSanta/videos/6_Blusanta_Noding.mp4",
        "file://c:/Users/Dipesh_Goel/AI Video Training/ErisBluSanta/videos/7_Const_Blusanta_Thank you.mp4",
        "file://c:/Users/Dipesh_Goel/AI Video Training/ErisBluSanta/videos/8_Doctor_Plc_Blusanta_Thank you.mp4",
    ],
    
    # Doctor videos (only indices 2 and 4 are non-null)
    # You'll need to provide actual doctor response video URLs
    "assets_doctor_paths": [
        None,  # 0: Doctor placeholder - no doctor video
        None,  # 1: Question 1 - no doctor video
        "gs://blusanta-campaign-videos/blusanta/results/e99998_12345678_video1.mp4",  # 2: REPLACE with actual doctor video 1
        None,  # 3: Question 2 - no doctor video
        "gs://blusanta-campaign-videos/blusanta/results/e99998_12345678_video2.mp4",  # 4: REPLACE with actual doctor video 2
        None,  # 5: Thank you const - no doctor video
        None,  # 6: Thank you placeholder - no doctor video
    ],
    
    # Audio overlays (ElevenLabs "Doctor [Name]" audio for parts 2 and 8)
    "audio_overlays": [
        {
            "segment_index": 0,  # Part 2 (Doctor placeholder)
            "audio_path": "gs://blusanta-campaign-videos/blusanta/audio/names/english/e99998_12345678_name.mp3",
            "trim_video_to_audio": True
        },
        {
            "segment_index": 6,  # Part 8 (Thank you placeholder)
            "audio_path": "gs://blusanta-campaign-videos/blusanta/audio/names/english/e99998_12345678_name.mp3",
            "trim_video_to_audio": True
        }
    ],
    
    # Nodding segments (trim to match doctor video duration)
    "nodding_segments": [
        {
            "nodding_index": 2,  # Part 4: Nodding 1
            "match_duration_of": 2  # Match doctor video 1 duration
        },
        {
            "nodding_index": 4,  # Part 6: Nodding 2
            "match_duration_of": 4  # Match doctor video 2 duration
        }
    ],
    
    # Output path
    "final_upload_path": "gs://blusanta-campaign-videos/blusanta/debug/test_zoom_final.mp4",
    
    # Webhook (optional for local test)
    "webhook_url": None,
    
    "additional_data": {
        "id": 1,
        "final_video_url": "https://storage.googleapis.com/blusanta-campaign-videos/blusanta/debug/test_zoom_final.mp4"
    }
}

if __name__ == "__main__":
    print("=" * 80)
    print("BluSanta Zoom Stitching Test")
    print("=" * 80)
    print("\nNOTE: You need to replace doctor video URLs in the test payload")
    print("      with actual GCS URLs before running this test.\n")
    
    # Uncomment to run the test
    # result = blusanta_video_stitching(test_payload)
    # print(f"\nTest result: {'SUCCESS' if result else 'FAILED'}")
