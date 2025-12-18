"""
BluSanta Video Stitching Service
================================

This module handles the complete video stitching pipeline for BluSanta personalized
medical campaign videos. It creates a podcast-style video by combining pre-recorded
constant videos with doctor response videos and personalized audio.

VIDEO STRUCTURE (9 parts):
--------------------------
1. 1_Const_Intro.mp4                    - Full screen constant intro
2. 2_Doctor_Placeholder.mp4             - Full screen with ElevenLabs audio replacement
3. 3_Const_Question_1.mp4               - Full screen constant question
4. 4_Blusanta_Noding.mp4 + Dr Video 1   - Podcast Q/A zoom layout (side-by-side)
5. 5_Const_Question_2.mp4               - Full screen constant question
6. 6_Blusanta_Noding.mp4 + Dr Video 2   - Podcast Q/A zoom layout (side-by-side)
7. 7_Const_Blusanta_Thank you.mp4       - Full screen constant thank you
8. 8_Doctor_Plc_Blusanta_Thank you.mp4  - Full screen with SAME ElevenLabs audio
9. 9_Const_outro_Blusanta_Thank you.mp4 - Full screen constant outro

FINAL VIDEO STRUCTURE:
----------------------
[Final_Video_Intro.mp4] + [9-part Podcast Video] + [Final_Video_Outro.mp4]

Author: BluSanta Campaign Team
Version: 2.0.0 (Production)
"""

import os
import json
import logging
import subprocess
import requests
import shutil
import tempfile
import threading
import time
from typing import Dict, List, Optional, Tuple, Any
from google.cloud import storage
from flask import Flask, request, jsonify

# ==============================================================================
# LOGGING CONFIGURATION
# ==============================================================================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - [%(funcName)s] %(message)s'
)
logger = logging.getLogger(__name__)

# ==============================================================================
# SUBTITLE GENERATION FUNCTIONS
# ==============================================================================

def generate_subtitles_with_deepgram(video_path: str, language: str = 'en') -> str:
    """
    Generates subtitles from a video file using Deepgram Nova-3 API.
    
    Uses Deepgram Nova-3 for high-quality transcription with word-level timestamps.
    
    Args:
        video_path: Path to the input video file
        language: Language code ('en' for English, 'hi' for Hindi)
    
    Returns:
        str: Path to the generated .ass subtitle file
    """
    try:
        DEEPGRAM_API_KEY = "e73a2b27da0a3752d423b2174d5b6b398cdd8969"
        if not DEEPGRAM_API_KEY:
            logger.warning("DEEPGRAM_API_KEY not found, skipping subtitle generation")
            return None
        
        # Extract audio from video
        audio_path = video_path.replace(".mp4", "_audio.mp3")
        audio_cmd = [
            "ffmpeg", "-hide_banner", "-loglevel", "error",
            "-i", video_path,
            "-vn", "-acodec", "mp3",
            "-y", audio_path
        ]
        subprocess.run(audio_cmd, check=True)
        
        # Transcribe with Deepgram Nova-3 API
        logger.info(f"Transcribing audio with Deepgram Nova-3 API: {audio_path}")
        
        # Healthcare keyterms for better recognition
        keyterms = [
            "BluSanta", "diabetes", "type 1 diabetes", "type 2 diabetes",
            "insulin", "blood sugar", "glucose", "lifestyle diseases",
            "allergies", "symptoms", "preventive measures", "medication",
            "diet", "exercise", "wellness", "health"
        ]
        
        # Call Deepgram API with audio file
        with open(audio_path, "rb") as audio_file:
            # Build params with keyterms
            params = {
                "model": "nova-3",
                "language": language,
                "punctuate": "true",
                "smart_format": "true",
                "paragraphs": "true",
                "utterances": "true",
                "diarize": "false",  # Single speaker per segment
                "filler_words": "false"  # Remove uh, um for cleaner subtitles
            }
            # Add keyterms for better medical term recognition
            for term in keyterms:
                params.setdefault("keyterms", []).append(term) if isinstance(params.get("keyterms"), list) else None
            
            response = requests.post(
                "https://api.deepgram.com/v1/listen",
                headers={
                    "Authorization": f"Token {DEEPGRAM_API_KEY}",
                    "Content-Type": "audio/mp3"
                },
                params=params,
                data=audio_file
            )
        
        if response.status_code != 200:
            logger.error(f"Deepgram API error: {response.status_code} - {response.text}")
            return None
        
        result = response.json()
        
        # Extract word-level timestamps
        words = result.get("results", {}).get("channels", [{}])[0].get("alternatives", [{}])[0].get("words", [])
        
        if not words:
            logger.warning("No words with timestamps returned from Deepgram")
            return None
        
        # Generate ASS subtitle file
        subtitles_dir = os.path.join(os.path.dirname(video_path), 'subtitles')
        os.makedirs(subtitles_dir, exist_ok=True)
        
        video_name = os.path.splitext(os.path.basename(video_path))[0]
        subtitle_path = os.path.join(subtitles_dir, f"{video_name}.ass")
        
        # ASS file content with proper newlines
        script_info = (
            "[Script Info]\n"
            "Title: Generated Subtitles\n"
            "Original Script: Deepgram Nova-3 API\n"
            "ScriptType: v4.00\n"
            "PlayResX: 1920\n"
            "PlayResY: 1080\n\n"
        )
        
        # Original whisper-style subtitle formatting
        # BorderStyle=3 (opaque box), Outline=1, Shadow=1
        # Alignment=2 (bottom center), MarginV=110 (distance from bottom)
        styles_info = (
            "[V4+ Styles]\n"
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
            "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
            "Alignment, MarginL, MarginR, MarginV, Encoding\n"
            "Style: Default, Arial, 40, &H00FFFFFF, &H000000FF, &H00000000, &H00000000, 0, 0, 0, 0, 100, 100, "
            "0, 0, 3, 1, 1, 2, 30, 30, 110, 1\n\n"
        )
        
        events_header = (
            "[Events]\n"
            "Format: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
        )
        
        content = [script_info, styles_info, events_header]
        
        # Build subtitle cues from word timestamps
        # Use punctuated_word for proper punctuation and capitalization
        # Rules: max 50 chars per line, min 1s duration, max 5s duration
        MAX_CHARS = 50
        MIN_DURATION = 1.0
        MAX_DURATION = 5.0
        
        i = 0
        while i < len(words):
            start = words[i]["start"]
            # Use punctuated_word if available (has punctuation), fallback to word
            text = words[i].get("punctuated_word", words[i]["word"])
            end = words[i]["end"]
            j = i + 1
            
            # Accumulate words until char limit or duration limit
            while j < len(words):
                next_word = words[j].get("punctuated_word", words[j]["word"])
                candidate = text + " " + next_word
                duration = words[j]["end"] - start
                
                # Stop if exceeds char limit or duration limit
                if len(candidate) > MAX_CHARS or duration > MAX_DURATION:
                    break
                
                text = candidate
                end = words[j]["end"]
                j += 1
            
            # Ensure minimum duration
            if (end - start) < MIN_DURATION:
                end = start + MIN_DURATION
            
            # Add slight padding to end
            end += 0.05
            
            start_time = format_ass_timestamp(start)
            end_time = format_ass_timestamp(end)
            
            # Escape special characters for ASS format
            safe_text = text.strip().replace('\\', '\\\\').replace('{', '{{').replace('}', '}}')
            
            dialogue = f"Dialogue: Marked=0,{start_time},{end_time},Default,,0,0,0,,{safe_text}\n"
            content.append(dialogue)
            
            i = j
        
        with open(subtitle_path, 'w', encoding='utf-8') as f:
            f.write(''.join(content))
        
        logger.info(f"Subtitles generated: {subtitle_path}")
        
        # Cleanup audio file
        if os.path.exists(audio_path):
            os.remove(audio_path)
        
        return subtitle_path
        
    except Exception as e:
        logger.error(f"Subtitle generation failed: {e}")
        return None


def generate_template_subtitles(video_path: str, template_type: str, doctor_first_name: str) -> str:
    """
    Generates template-based subtitles for greeting/thank-you segments.
    
    These segments have a fixed script with only the doctor's name varying.
    Using templates ensures the doctor's name is spelled correctly (not transcribed).
    
    Args:
        video_path: Path to the video file (used for output path)
        template_type: Either 'greeting' (plc_000) or 'thankyou' (plc_001)
        doctor_first_name: The doctor's first name to insert
    
    Returns:
        str: Path to the generated .ass subtitle file
    """
    try:
        # Get video duration using ffprobe
        probe_cmd = [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", video_path
        ]
        result = subprocess.run(probe_cmd, capture_output=True, text=True)
        video_duration = float(result.stdout.strip()) if result.stdout.strip() else 4.0
        
        # Define templates with timing
        if template_type == 'greeting':
            # plc_000: "Dr. <name>, welcome, and thank you for joining us today."
            # Split into readable chunks
            subtitle_cues = [
                {"start": 0.0, "end": min(1.8, video_duration * 0.45), 
                 "text": f"Dr. {doctor_first_name}, welcome,"},
                {"start": min(1.8, video_duration * 0.45), "end": video_duration, 
                 "text": "and thank you for joining us today."}
            ]
        elif template_type == 'thankyou':
            # plc_001: "Thank you, Dr. <name>,"
            subtitle_cues = [
                {"start": 0.0, "end": video_duration, 
                 "text": f"Thank you, Dr. {doctor_first_name},"}
            ]
        else:
            logger.warning(f"Unknown template type: {template_type}")
            return None
        
        # Generate ASS subtitle file
        subtitles_dir = os.path.join(os.path.dirname(video_path), 'subtitles')
        os.makedirs(subtitles_dir, exist_ok=True)
        
        video_name = os.path.splitext(os.path.basename(video_path))[0]
        subtitle_path = os.path.join(subtitles_dir, f"{video_name}.ass")
        
        # ASS file header
        script_info = (
            "[Script Info]\n"
            "Title: Template Subtitles\n"
            "Original Script: BluSanta Template\n"
            "ScriptType: v4.00\n"
            "PlayResX: 1920\n"
            "PlayResY: 1080\n\n"
        )
        
        styles_info = (
            "[V4+ Styles]\n"
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
            "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
            "Alignment, MarginL, MarginR, MarginV, Encoding\n"
            "Style: Default, Arial, 40, &H00FFFFFF, &H000000FF, &H00000000, &H00000000, 0, 0, 0, 0, 100, 100, "
            "0, 0, 3, 1, 1, 2, 30, 30, 110, 1\n\n"
        )
        
        events_header = (
            "[Events]\n"
            "Format: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
        )
        
        content = [script_info, styles_info, events_header]
        
        for cue in subtitle_cues:
            start_time = format_ass_timestamp(cue["start"])
            end_time = format_ass_timestamp(cue["end"])
            safe_text = cue["text"].replace('\\', '\\\\').replace('{', '{{').replace('}', '}}')
            dialogue = f"Dialogue: Marked=0,{start_time},{end_time},Default,,0,0,0,,{safe_text}\n"
            content.append(dialogue)
        
        with open(subtitle_path, 'w', encoding='utf-8') as f:
            f.write(''.join(content))
        
        logger.info(f"Template subtitles generated for {template_type}: {subtitle_path}")
        return subtitle_path
        
    except Exception as e:
        logger.error(f"Template subtitle generation failed: {e}")
        return None


def format_ass_timestamp(seconds: float) -> str:
    """
    Formats timestamp to ASS format (H:MM:SS.CC).
    
    Args:
        seconds: Time in seconds
    
    Returns:
        str: Time in ASS timestamp format
    """
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    centiseconds = int((secs - int(secs)) * 100)
    return f"{hours:01}:{minutes:02}:{int(secs):02}.{centiseconds:02}"


def apply_subtitles_to_video(video_path: str, subtitle_path: str, output_path: str) -> str:
    """
    Apply ASS subtitles to a video using FFmpeg.
    
    Args:
        video_path: Path to input video
        subtitle_path: Path to .ass subtitle file
        output_path: Path for output video with subtitles
    
    Returns:
        str: Path to output video
    """
    if not subtitle_path or not os.path.exists(subtitle_path):
        logger.info("No subtitles to apply, copying video as-is")
        shutil.copy(video_path, output_path)
        return output_path
    
    # Escape subtitle path for FFmpeg
    safe_sub_path = subtitle_path.replace('\\', '/').replace(':', '\\:')
    
    cfg = VIDEO_CONFIG
    
    # Use stream copy for audio, only re-encode video with subtitles
    # This preserves exact timing from input video
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error",
        "-i", video_path,
        "-vf", f"ass={safe_sub_path}",
        # Re-encode video (required for subtitle burn-in)
        "-c:v", cfg['codec'],
        "-preset", cfg['preset'],
        "-crf", str(cfg['crf']),
        "-pix_fmt", cfg['pix_fmt'],
        # Copy audio stream exactly (preserves timing)
        "-c:a", "copy",
        "-y", output_path
    ]
    
    try:
        subprocess.run(cmd, check=True, timeout=600)
        logger.info(f"Subtitles applied: {output_path}")
        return output_path
    except subprocess.TimeoutExpired:
        logger.error(f"Subtitle application timed out for {video_path}")
        shutil.copy(video_path, output_path)
        return output_path
    except Exception as e:
        logger.error(f"Failed to apply subtitles: {e}")
        shutil.copy(video_path, output_path)
        return output_path

# ==============================================================================
# FLASK APPLICATION SETUP
# ==============================================================================
app = Flask(__name__)

# Machine status tracking for concurrent request handling
# Note: In production, consider using Redis or a proper state management solution
os.environ["machine_status"] = "free"

# Authentication token for API security
AUTH_TOKEN = os.getenv(
    "AI_SERVICE_AUTH_TOKEN",
    "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiZTMxZjE2YTVlMTQzYTBkZTExMjkifQ.pWDOEeQy1M8C_4sazA3Vm3VIFN59DoeZBfGC2bXxrLs"
)

# ==============================================================================
# DIRECTORY CONFIGURATION
# ==============================================================================
# Base directory for all operations
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(BASE_DIR, "assets")
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
TEMP_DIR = os.path.join(BASE_DIR, "temp")

# Ensure directories exist
for directory in [ASSETS_DIR, OUTPUT_DIR, TEMP_DIR]:
    os.makedirs(directory, exist_ok=True)

# ==============================================================================
# VIDEO ENCODING CONSTANTS
# ==============================================================================
# Standardized video parameters to ensure consistent concatenation
VIDEO_CONFIG = {
    "width": 1920,
    "height": 1080,
    "fps": 25,
    "codec": "libx264",
    "preset": "fast",
    "crf": 23,
    "pix_fmt": "yuv420p",
    "audio_codec": "aac",
    "audio_rate": 44100,
    "audio_channels": 2,
    "audio_bitrate": "128k"
}

# Podcast layout constants for side-by-side zoom effect
PODCAST_LAYOUT = {
    "full_width": 1920,
    "full_height": 1080,
    "small_width": 900,       # Width of each participant in podcast mode
    "small_height": 540,      # Height of each participant in podcast mode
    "left_x": 30,             # X position for left (BluSanta) video
    "left_y": 266,            # Y position for both videos in podcast mode
    "right_x": 980,           # X position for right (Doctor) video
    "transition_duration": 1.0,  # Zoom animation duration in seconds
    "border_width": 10,       # White border around each video
}


# ==============================================================================
# FILE DOWNLOAD/UPLOAD UTILITIES
# ==============================================================================

def download_file(url: str, destination: str) -> bool:
    """
    Downloads a file from various sources (GCS, HTTP, or local filesystem).

    Supports:
    - gs://bucket/path   : Google Cloud Storage
    - http(s)://...      : Web URLs
    - file:///path       : Local filesystem (explicit)
    - /path/to/file      : Local filesystem (implicit)

    Args:
        url: Source URL/path of the file to download
        destination: Local path where the file should be saved

    Returns:
        bool: True if download successful, False otherwise

    Raises:
        Exception: If download fails critically
    """
    try:
        # Ensure destination directory exists
        dest_dir = os.path.dirname(destination)
        if dest_dir:
            os.makedirs(dest_dir, exist_ok=True)

        if url.startswith("gs://"):
            # Google Cloud Storage download
            bucket_name = url.split("/")[2]
            blob_name = "/".join(url.split("/")[3:])

            storage_client = storage.Client()
            bucket = storage_client.bucket(bucket_name)
            blob = bucket.blob(blob_name)
            blob.download_to_filename(destination)

        elif url.startswith("http://") or url.startswith("https://"):
            # HTTP/HTTPS download with streaming
            response = requests.get(url, stream=True, timeout=300)
            response.raise_for_status()

            with open(destination, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)

        elif url.startswith("file://"):
            # Explicit local file reference
            src = url.replace("file://", "")
            shutil.copy(src, destination)

        else:
            # Assume it's a local path
            if os.path.exists(url):
                shutil.copy(url, destination)
            else:
                raise FileNotFoundError(f"Local file not found: {url}")

        logger.info(f"Downloaded: {url} -> {destination}")
        return True

    except Exception as e:
        logger.error(f"Download failed for {url}: {e}")
        raise


def upload_file(local_path: str, destination_url: str) -> str:
    """
    Uploads a file to Google Cloud Storage.

    Args:
        local_path: Path to the local file to upload
        destination_url: GCS destination URL (gs://bucket/path)

    Returns:
        str: Public HTTPS URL of the uploaded file

    Raises:
        Exception: If upload fails
    """
    if not destination_url.startswith("gs://"):
        logger.warning(f"Non-GCS destination, returning as-is: {destination_url}")
        return destination_url

    try:
        bucket_name = destination_url.split("/")[2]
        blob_name = "/".join(destination_url.split("/")[3:])

        storage_client = storage.Client()
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(blob_name)

        # Upload with progress logging
        blob.upload_from_filename(local_path)

        public_url = f"https://storage.googleapis.com/{bucket_name}/{blob_name}"
        logger.info(f"Uploaded: {local_path} -> {public_url}")

        return public_url

    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise


# ==============================================================================
# FFMPEG UTILITY FUNCTIONS
# ==============================================================================

def get_media_duration(file_path: str) -> float:
    """
    Gets the duration of a media file in seconds using ffprobe.

    Args:
        file_path: Path to the video/audio file

    Returns:
        float: Duration in seconds, or 0.0 if detection fails
    """
    try:
        cmd = [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            file_path
        ]
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=30
        )
        duration = float(result.stdout.strip())
        logger.debug(f"Duration of {os.path.basename(file_path)}: {duration:.2f}s")
        return duration

    except (ValueError, subprocess.TimeoutExpired) as e:
        logger.warning(f"Could not get duration for {file_path}: {e}")
        return 0.0


def run_ffmpeg(cmd: List[str], description: str = "FFmpeg operation") -> bool:
    """
    Executes an FFmpeg command with proper error handling and logging.

    Args:
        cmd: List of command arguments for FFmpeg
        description: Human-readable description for logging

    Returns:
        bool: True if successful, False otherwise

    Raises:
        subprocess.CalledProcessError: If FFmpeg fails
    """
    logger.info(f"Executing: {description}")
    logger.debug(f"Command: {' '.join(cmd)}")

    try:
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=1200  # 20 minute timeout for long operations
        )

        if result.returncode != 0:
            logger.error(f"FFmpeg error: {result.stderr}")
            raise subprocess.CalledProcessError(result.returncode, cmd, result.stderr)

        return True

    except subprocess.TimeoutExpired:
        logger.error(f"FFmpeg timeout for: {description}")
        raise


def standardize_video(input_path: str, output_path: str) -> str:
    """
    Standardizes a video to consistent encoding parameters for seamless concatenation.

    This is CRITICAL for proper video concatenation. All videos must have:
    - Same resolution: 1920x1080
    - Same frame rate: 25 fps
    - Same pixel format: yuv420p
    - Same audio sample rate: 44100 Hz
    - Same audio channels: 2 (stereo)

    Args:
        input_path: Path to the source video
        output_path: Path for the standardized output

    Returns:
        str: Path to the standardized video
    """
    cfg = VIDEO_CONFIG

    cmd = [
        "ffmpeg", "-y",
        "-hide_banner", "-loglevel", "warning",
        "-i", input_path,
        # Video filter: scale with padding to maintain aspect ratio
        "-vf", (
            f"scale={cfg['width']}:{cfg['height']}:"
            "force_original_aspect_ratio=decrease,"
            f"pad={cfg['width']}:{cfg['height']}:(ow-iw)/2:(oh-ih)/2,"
            "setsar=1"
        ),
        # Video encoding
        "-r", str(cfg['fps']),
        "-c:v", cfg['codec'],
        "-preset", cfg['preset'],
        "-crf", str(cfg['crf']),
        "-pix_fmt", cfg['pix_fmt'],
        # Audio encoding
        "-c:a", cfg['audio_codec'],
        "-ar", str(cfg['audio_rate']),
        "-ac", str(cfg['audio_channels']),
        "-b:a", cfg['audio_bitrate'],
        output_path
    ]

    run_ffmpeg(cmd, f"Standardizing video: {os.path.basename(input_path)}")
    return output_path


def fit_video_to_audio_duration(video_path: str, audio_path: str, output_path: str) -> str:
    """
    Intelligently fits video duration to match audio duration using frame sampling.
    
    Uses a combination of techniques to avoid visible jumps:
    1. If audio is longer than video: Speed down video slightly (up to 0.85x), then duplicate frames
    2. If audio is shorter than video: Speed up video slightly (up to 1.15x), then drop frames
    
    The approach prioritizes smooth playback over exact frame matching.
    
    Args:
        video_path: Path to the source video
        audio_path: Path to the audio file to match duration
        output_path: Path for the output video
    
    Returns:
        str: Path to the fitted video (without audio - audio added separately)
    """
    cfg = VIDEO_CONFIG
    
    video_duration = get_media_duration(video_path)
    audio_duration = get_media_duration(audio_path)
    
    if video_duration <= 0 or audio_duration <= 0:
        logger.warning(f"Invalid durations (video: {video_duration}, audio: {audio_duration}), using simple loop")
        return None
    
    ratio = audio_duration / video_duration
    logger.info(f"Video-Audio fit: video={video_duration:.2f}s, audio={audio_duration:.2f}s, ratio={ratio:.3f}")
    
    # Determine the best fitting strategy
    if 0.85 <= ratio <= 1.15:
        # Within 15% - just adjust playback speed (PTS manipulation)
        # setpts=PTS/speed_factor where speed_factor > 1 slows down, < 1 speeds up
        speed_factor = ratio
        logger.info(f"Using speed adjustment only: {speed_factor:.3f}x")
        
        cmd = [
            "ffmpeg", "-y",
            "-hide_banner", "-loglevel", "warning",
            "-i", video_path,
            "-vf", (
                f"setpts={speed_factor}*PTS,"
                f"scale={cfg['width']}:{cfg['height']}:"
                "force_original_aspect_ratio=decrease,"
                f"pad={cfg['width']}:{cfg['height']}:(ow-iw)/2:(oh-ih)/2,"
                "setsar=1"
            ),
            "-r", str(cfg['fps']),
            "-c:v", cfg['codec'],
            "-preset", cfg['preset'],
            "-crf", str(cfg['crf']),
            "-pix_fmt", cfg['pix_fmt'],
            "-an",  # No audio in intermediate file
            "-t", str(audio_duration),
            output_path
        ]
        run_ffmpeg(cmd, f"Speed adjusting video: {os.path.basename(output_path)}")
        
    elif ratio > 1.15:
        # Audio is significantly longer - slow down video + loop smoothly
        # First slow down to 0.85x, then calculate remaining needed duration
        slow_factor = min(ratio, 1.25)  # Max 1.25x slowdown (80% speed)
        remaining_ratio = ratio / slow_factor
        
        logger.info(f"Audio longer: slow to {slow_factor:.3f}x, then loop if needed (remaining ratio: {remaining_ratio:.3f})")
        
        if remaining_ratio > 1.05:
            # Need to loop - use concat with crossfade for smoothness
            # Calculate how many loops needed
            loops_needed = int(remaining_ratio) + 1
            
            cmd = [
                "ffmpeg", "-y",
                "-hide_banner", "-loglevel", "warning",
                "-stream_loop", str(loops_needed - 1),
                "-i", video_path,
                "-vf", (
                    f"setpts={slow_factor}*PTS,"
                    f"scale={cfg['width']}:{cfg['height']}:"
                    "force_original_aspect_ratio=decrease,"
                    f"pad={cfg['width']}:{cfg['height']}:(ow-iw)/2:(oh-ih)/2,"
                    "setsar=1"
                ),
                "-r", str(cfg['fps']),
                "-c:v", cfg['codec'],
                "-preset", cfg['preset'],
                "-crf", str(cfg['crf']),
                "-pix_fmt", cfg['pix_fmt'],
                "-an",
                "-t", str(audio_duration),
                output_path
            ]
        else:
            cmd = [
                "ffmpeg", "-y",
                "-hide_banner", "-loglevel", "warning",
                "-i", video_path,
                "-vf", (
                    f"setpts={slow_factor}*PTS,"
                    f"scale={cfg['width']}:{cfg['height']}:"
                    "force_original_aspect_ratio=decrease,"
                    f"pad={cfg['width']}:{cfg['height']}:(ow-iw)/2:(oh-ih)/2,"
                    "setsar=1"
                ),
                "-r", str(cfg['fps']),
                "-c:v", cfg['codec'],
                "-preset", cfg['preset'],
                "-crf", str(cfg['crf']),
                "-pix_fmt", cfg['pix_fmt'],
                "-an",
                "-t", str(audio_duration),
                output_path
            ]
        run_ffmpeg(cmd, f"Extending video with slowdown: {os.path.basename(output_path)}")
        
    else:
        # ratio < 0.85 - Audio is significantly shorter, speed up video + drop frames
        speed_factor = max(ratio, 0.75)  # Max 1.33x speedup (75% of original duration)
        
        logger.info(f"Audio shorter: speed up to {speed_factor:.3f}x (speedup: {1/speed_factor:.2f}x)")
        
        cmd = [
            "ffmpeg", "-y",
            "-hide_banner", "-loglevel", "warning",
            "-i", video_path,
            "-vf", (
                f"setpts={speed_factor}*PTS,"
                f"scale={cfg['width']}:{cfg['height']}:"
                "force_original_aspect_ratio=decrease,"
                f"pad={cfg['width']}:{cfg['height']}:(ow-iw)/2:(oh-ih)/2,"
                "setsar=1"
            ),
            "-r", str(cfg['fps']),
            "-c:v", cfg['codec'],
            "-preset", cfg['preset'],
            "-crf", str(cfg['crf']),
            "-pix_fmt", cfg['pix_fmt'],
            "-an",
            "-t", str(audio_duration),
            output_path
        ]
        run_ffmpeg(cmd, f"Shortening video with speedup: {os.path.basename(output_path)}")
    
    return output_path


def replace_audio_and_trim(video_path: str, audio_path: str, output_path: str, use_smart_fit: bool = True) -> str:
    """
    Replaces the audio track of a video and fits video to match audio duration.

    Used for placeholder videos where the original audio is replaced with
    ElevenLabs-generated personalized audio ("Doctor [Name]").

    The video fitting uses intelligent frame sampling:
    - Speed adjustment (up to ±15%) for smooth playback
    - Frame duplication/looping for longer audio
    - Frame dropping for shorter audio
    - Avoids visible jumps at loop points

    Args:
        video_path: Path to the source video
        audio_path: Path to the replacement audio (MP3/AAC)
        output_path: Path for the output video
        use_smart_fit: Use intelligent fitting (default True). If False, uses simple loop/trim.

    Returns:
        str: Path to the output video with replaced audio
    """
    cfg = VIDEO_CONFIG

    # Get audio duration for fitting
    audio_duration = get_media_duration(audio_path)
    if audio_duration <= 0:
        logger.warning(f"Invalid audio duration, using 5 seconds default")
        audio_duration = 5.0

    logger.info(f"Replacing audio, target duration: {audio_duration:.2f}s")

    if use_smart_fit:
        # Use intelligent video fitting
        temp_video = output_path.replace('.mp4', '_fitted.mp4')
        fitted_video = fit_video_to_audio_duration(video_path, audio_path, temp_video)
        
        if fitted_video and os.path.exists(fitted_video):
            # Combine fitted video with audio
            cmd = [
                "ffmpeg", "-y",
                "-hide_banner", "-loglevel", "warning",
                "-i", fitted_video,
                "-i", audio_path,
                "-map", "0:v",
                "-map", "1:a",
                "-c:v", "copy",  # Video already encoded
                "-c:a", cfg['audio_codec'],
                "-ar", str(cfg['audio_rate']),
                "-ac", str(cfg['audio_channels']),
                "-b:a", cfg['audio_bitrate'],
                "-shortest",
                output_path
            ]
            run_ffmpeg(cmd, f"Combining fitted video with audio: {os.path.basename(output_path)}")
            
            # Clean up temp file
            if os.path.exists(temp_video):
                os.remove(temp_video)
            
            return output_path
    
    # Fallback: Simple loop/trim approach
    cmd = [
        "ffmpeg", "-y",
        "-hide_banner", "-loglevel", "warning",
        "-stream_loop", "-1",
        "-i", video_path,
        "-i", audio_path,
        "-map", "0:v",
        "-map", "1:a",
        "-vf", (
            f"scale={cfg['width']}:{cfg['height']}:"
            "force_original_aspect_ratio=decrease,"
            f"pad={cfg['width']}:{cfg['height']}:(ow-iw)/2:(oh-ih)/2,"
            "setsar=1"
        ),
        "-r", str(cfg['fps']),
        "-c:v", cfg['codec'],
        "-preset", cfg['preset'],
        "-crf", str(cfg['crf']),
        "-pix_fmt", cfg['pix_fmt'],
        "-c:a", cfg['audio_codec'],
        "-ar", str(cfg['audio_rate']),
        "-ac", str(cfg['audio_channels']),
        "-b:a", cfg['audio_bitrate'],
        "-shortest",
        "-t", str(audio_duration),
        output_path
    ]

    run_ffmpeg(cmd, f"Replacing audio: {os.path.basename(output_path)}")
    return output_path


def loop_video_to_duration(video_path: str, target_duration: float, output_path: str) -> str:
    """
    Loops or trims a video to match a target duration.

    Used for nodding videos that need to match the duration of doctor response videos.

    Args:
        video_path: Path to the source video to loop/trim
        target_duration: Desired output duration in seconds
        output_path: Path for the output video

    Returns:
        str: Path to the looped/trimmed video
    """
    cfg = VIDEO_CONFIG

    cmd = [
        "ffmpeg", "-y",
        "-hide_banner", "-loglevel", "warning",
        # Loop video infinitely
        "-stream_loop", "-1",
        "-i", video_path,
        # Standardization filter
        "-vf", (
            f"scale={cfg['width']}:{cfg['height']}:"
            "force_original_aspect_ratio=decrease,"
            f"pad={cfg['width']}:{cfg['height']}:(ow-iw)/2:(oh-ih)/2,"
            "setsar=1"
        ),
        # Video encoding
        "-r", str(cfg['fps']),
        "-c:v", cfg['codec'],
        "-preset", cfg['preset'],
        "-crf", str(cfg['crf']),
        "-pix_fmt", cfg['pix_fmt'],
        # Audio encoding
        "-c:a", cfg['audio_codec'],
        "-ar", str(cfg['audio_rate']),
        "-ac", str(cfg['audio_channels']),
        "-b:a", cfg['audio_bitrate'],
        # Trim to target duration
        "-t", str(target_duration),
        output_path
    ]

    run_ffmpeg(cmd, f"Looping video to {target_duration:.2f}s")
    return output_path


# ==============================================================================
# PODCAST ZOOM SEGMENT CREATION
# ==============================================================================

def create_podcast_zoom_segment(
    bg_image: str,
    blusanta_video: str,
    doctor_video: str,
    output_path: str,
    doctor_name: str,
    font_path: Optional[str] = None
) -> str:
    """
    Creates a podcast-style zoom segment with side-by-side layout and smooth animations.

    This function creates the signature BluSanta podcast Q/A format where:
    - BluSanta (interviewer) appears on the left with zoom animation
    - Doctor (interviewee) appears on the right
    - Both have white borders and name labels
    - Background image is visible behind participants

    Animation Sequence:
    1. [0 - transition_duration]: BluSanta zooms from full screen to podcast position
    2. [transition_duration - doctor_end]: Both participants visible in podcast layout
    3. [doctor_end - end]: BluSanta zooms back to full screen

    The zoom uses cosine interpolation for smooth, professional-looking animations:
    Formula: 0.5 * (1 - cos(PI * t / duration))

    Args:
        bg_image: Path to podcast background image (Podcast_BG.jpg)
        blusanta_video: Path to BluSanta nodding video
        doctor_video: Path to doctor response video (drives the timing)
        output_path: Path for the output video
        doctor_name: Doctor's name for the label (e.g., "DR. JOHN SMITH")
        font_path: Path to font file for labels (optional)

    Returns:
        str: Path to the created podcast segment
    """
    layout = PODCAST_LAYOUT
    cfg = VIDEO_CONFIG

    # Doctor video duration drives the entire segment timing
    # First, transcode doctor video to ensure compatible audio codec
    # Some videos have unsupported audio codecs like 'apac' that cause FFmpeg failures
    job_temp_dir = os.path.dirname(output_path)
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
    
    try:
        subprocess.run(transcode_cmd, check=True, capture_output=True, text=True)
        doctor_video = doctor_video_transcoded  # Use transcoded version
        logger.info(f"✓ Doctor video transcoded successfully")
    except subprocess.CalledProcessError as e:
        logger.warning(f"Audio transcoding failed: {e.stderr}, continuing with original video")
        # If transcoding fails, try to continue with original
    
    duration = get_media_duration(doctor_video)
    if duration <= 0:
        raise ValueError(f"Invalid doctor video duration: {duration}")

    logger.info(f"Creating podcast segment, duration: {duration:.2f}s")

    # Animation timing constants
    trans = layout['transition_duration']
    duration_right = duration
    duration_plus_trans = duration_right + trans

    # Total segment duration: includes entry animation, content, and exit animation
    total_duration = duration_plus_trans + trans

    # First, loop the BluSanta video to match the total segment duration
    looped_blusanta = blusanta_video.replace(".mp4", "_looped.mp4")
    loop_video_to_duration(blusanta_video, total_duration, looped_blusanta)

    # Get border width from layout
    border = layout['border_width']

    # -------------------------------------------------------------------------
    # COSINE INTERPOLATION EXPRESSIONS FOR SMOOTH ZOOM ANIMATION
    # Formula: 0.5 * (1 - cos(PI * t / duration))
    # This creates smooth ease-in-out transitions
    # -------------------------------------------------------------------------

    # Use exact dimensions from Bhagyashree implementation
    # The border is added via pad filter BEFORE scaling, so we use the final target sizes directly
    # small_width/height = 900x540 (final size INCLUDING the scaled border)
    # full_width/height = 1920x1080 (full screen size INCLUDING the scaled border)
    full_width = layout['full_width']     # 1920
    full_height = layout['full_height']   # 1080
    small_width = layout['small_width']   # 900
    small_height = layout['small_height'] # 540

    # Width expression: Full -> Small -> Full (with zoom-in animation)
    # Matches Bhagyashree exactly - uses full dimensions, not content dimensions
    width_expr = (
        f"if(lt(t,{trans}),"
        # Phase 1: Zoom in from full width to small width (smooth entry)
        f"{full_width}-0.5*(1-cos(PI*t/{trans}))*"
        f"({full_width}-{small_width}),"
        f"if(lt(t,{duration_plus_trans}),"
        # Phase 2: Stay at small width during doctor response
        f"{small_width},"
        f"if(lt(t,{duration_plus_trans}+{trans}),"
        # Phase 3: Zoom out from small width to full width (smooth exit)
        f"{small_width}+0.5*(1-cos(PI*(t-{duration_plus_trans})/{trans}))*"
        f"({full_width}-{small_width}),"
        # Phase 4: Stay at full width
        f"{full_width})))"
    )

    # Height expression: Full -> Small -> Full (matching width animation)
    height_expr = (
        f"if(lt(t,{trans}),"
        f"{full_height}-0.5*(1-cos(PI*t/{trans}))*"
        f"({full_height}-{small_height}),"
        f"if(lt(t,{duration_plus_trans}),"
        f"{small_height},"
        f"if(lt(t,{duration_plus_trans}+{trans}),"
        f"{small_height}+0.5*(1-cos(PI*(t-{duration_plus_trans})/{trans}))*"
        f"({full_height}-{small_height}),"
        f"{full_height})))"
    )

    # Y position expression: 0 -> target_y -> 0 (matching zoom timing)
    overlay_y_expr = (
        f"if(lt(t,{trans}),"
        f"0.5*(1-cos(PI*t/{trans}))*{layout['left_y']},"
        f"if(lt(t,{duration_plus_trans}),"
        f"{layout['left_y']},"
        f"if(lt(t,{duration_plus_trans}+{trans}),"
        f"{layout['left_y']}-0.5*(1-cos(PI*(t-{duration_plus_trans})/{trans}))*{layout['left_y']},"
        f"0)))"
    )

    # X position for left (BluSanta) video: 0 -> target_x -> 0 (matching zoom timing)
    overlay_x_left = (
        f"if(lt(t,{trans}),"
        f"0.5*(1-cos(PI*t/{trans}))*{layout['left_x']},"
        f"if(lt(t,{duration_plus_trans}),"
        f"{layout['left_x']},"
        f"if(lt(t,{duration_plus_trans}+{trans}),"
        f"{layout['left_x']}-0.5*(1-cos(PI*(t-{duration_plus_trans})/{trans}))*{layout['left_x']},"
        f"0)))"
    )

    # X position for right (Doctor) video: offscreen -> target_x -> offscreen (matching zoom timing)
    overlay_x_right = (
        f"if(lt(t,{trans}),"
        f"{layout['full_width']}-0.5*(1-cos(PI*t/{trans}))*"
        f"({layout['full_width']}-{layout['right_x']}),"
        f"if(lt(t,{duration_plus_trans}),"
        f"{layout['right_x']},"
        f"if(lt(t,{duration_plus_trans}+{trans}),"
        f"{layout['right_x']}+0.5*(1-cos(PI*(t-{duration_plus_trans})/{trans}))*"
        f"({layout['full_width']}-{layout['right_x']}),"
        f"{layout['full_width']})))"
    )

    # -------------------------------------------------------------------------
    # BUILD FFMPEG FILTER COMPLEX
    # -------------------------------------------------------------------------

    # Doctor label should show full name with "DR." prefix
    # Strip any existing "DR." or "Dr." prefix to avoid "DR. DR."
    clean_name = doctor_name.upper() if doctor_name else "DOCTOR"
    clean_name = clean_name.replace("DR.", "").replace("DR ", "").strip()
    doctor_label = f"DR. {clean_name}" if clean_name else "DR. DOCTOR"

    # Build the filter_complex string
    # 
    # BORDER CONSISTENCY STRATEGY (matching Bhagyashree exactly):
    # 
    # Bhagyashree approach: pad=iw+20:ih+20:10:10:white THEN scale
    # This means:
    # - Border is added to the SOURCE video dimensions
    # - Then the entire bordered video is scaled to target size
    # - Border thickness scales proportionally with the video
    #
    # For consistent borders in podcast mode, both source videos must have:
    # 1. Same aspect ratio as target (16:9 for 900x540)
    # 2. Similar dimensions so border scaling is similar
    #
    # The fix: Pre-scale both videos to a consistent intermediate size with 16:9 aspect ratio
    # BEFORE adding the border. This ensures when border is added and then scaled to final size,
    # both videos have identical border thickness.
    #
    # Intermediate size: Use 880x495 (16:9 aspect ratio, close to 900x540)
    # After adding 10px border: 900x515
    # Final scale to: 900x540 (podcast) or 1920x1080 (full screen with animation)
    
    # Use 16:9 aspect ratio for intermediate scaling to avoid distortion
    intermediate_width = 880
    intermediate_height = 495  # 880 / 1.778 ≈ 495 (maintains 16:9)
    
    filter_parts = [
        # Scale background image to 1920x1080
        f"[0:v]scale={cfg['width']}:{cfg['height']},setsar=1[background]",

        # Process left (BluSanta) video
        # Step 1: Pre-scale to consistent 880x495 (maintains 16:9 aspect)
        # Step 2: Add 10px white border → becomes 900x515
        # Step 3: Scale to final animated dimensions with 16:9 constraint
        (
            f"[1:v]setsar=1,setpts=PTS-STARTPTS,"
            f"scale={intermediate_width}:{intermediate_height}:force_original_aspect_ratio=increase,"
            f"crop={intermediate_width}:{intermediate_height},"
            f"pad=iw+{2*border}:ih+{2*border}:{border}:{border}:white,"
            f"scale='{width_expr}':'{height_expr}':eval=frame[left_scaled]"
        ),

        # Overlay left video on background with animated position
        f"[background][left_scaled]overlay=x='{overlay_x_left}':y='{overlay_y_expr}'[tmp1]",

        # Process right (Doctor) video  
        # Step 1: Pre-scale to consistent 880x495 (same as left video)
        # Step 2: Add 10px white border → becomes 900x515
        # Step 3: Scale to final 900x540 (matches left video in podcast mode)
        (
            f"[2:v]setsar=1,setpts=PTS-STARTPTS,"
            f"scale={intermediate_width}:{intermediate_height}:force_original_aspect_ratio=increase,"
            f"crop={intermediate_width}:{intermediate_height},"
            f"pad=iw+{2*border}:ih+{2*border}:{border}:{border}:white,"
            f"scale={small_width}:{small_height}[right_scaled]"
        ),

        # Overlay right video at fixed Y position with animated X
        (
            f"[tmp1][right_scaled]overlay=x='{overlay_x_right}':y={layout['left_y']},"
            f"format={cfg['pix_fmt']}[vbase]"
        )
    ]

    # Add name labels if font is provided
    if font_path and os.path.exists(font_path):
        # Escape font path for FFmpeg (replace backslashes)
        safe_font_path = font_path.replace("\\", "/").replace(":", "\\\\:")

        # Label for BluSanta (left side) - shown during podcast zoom
        filter_parts.append(
            f"[vbase]drawtext=text='BLU SANTA':"
            f"x=50:y=760:fontsize=32:fontcolor=white:"
            f"box=1:boxcolor=black@0.7:boxborderw=15:"
            f"fontfile='{safe_font_path}':"
            f"enable='between(t,{trans},{duration_plus_trans})'[v_text1]"
        )

        # Label for Doctor (right side) - shown during podcast zoom
        filter_parts.append(
            f"[v_text1]drawtext=text='{doctor_label}':"
            f"x=1000:y=760:fontsize=32:fontcolor=white:"
            f"box=1:boxcolor=black@0.7:boxborderw=15:"
            f"fontfile='{safe_font_path}':"
            f"enable='between(t,{trans},{duration_plus_trans})'[v]"
        )
    else:
        # No font - add labels without font (using default)
        filter_parts.append(
            f"[vbase]drawtext=text='BLU SANTA':"
            f"x=50:y=760:fontsize=32:fontcolor=white:"
            f"box=1:boxcolor=black@0.7:boxborderw=15:"
            f"enable='between(t,{trans},{duration_plus_trans})'[v_text1]"
        )
        filter_parts.append(
            f"[v_text1]drawtext=text='{doctor_label}':"
            f"x=1000:y=760:fontsize=32:fontcolor=white:"
            f"box=1:boxcolor=black@0.7:boxborderw=15:"
            f"enable='between(t,{trans},{duration_plus_trans})'[v]"
        )

    filter_complex = ";".join(filter_parts)

    # -------------------------------------------------------------------------
    # BUILD AND RUN FFMPEG COMMAND
    # -------------------------------------------------------------------------
    
    # Write filter_complex to a file to avoid command-line length issues
    # FFmpeg can fail with "Invalid argument" if filter_complex is too long
    # Get temp directory from output_path (it's in the same directory)
    job_temp_dir = os.path.dirname(output_path)
    filter_script_path = os.path.join(job_temp_dir, 'filter_script.txt')
    with open(filter_script_path, 'w', encoding='utf-8') as f:
        f.write(filter_complex)

    cmd = [
        "ffmpeg", "-y",
        "-hide_banner", "-loglevel", "warning",
        # Input 0: Background image (looped)
        "-loop", "1", "-i", bg_image,
        # Input 1: BluSanta nodding video (looped to duration)
        "-i", looped_blusanta,
        # Input 2: Doctor video
        "-i", doctor_video,
        # Apply filter complex from script file (avoids command-line length issues)
        "-filter_complex_script", filter_script_path,
        # Map video from filter output
        "-map", "[v]",
        # Map audio from doctor video (input 2)
        # Audio plays from start, pad with silence at the end for exit animation
        "-map", "2:a",
        # Pad audio at END only to match total duration (for exit animation)
        "-af", f"apad=whole_dur={total_duration}",
        # Duration includes entry animation, doctor speaking, and exit animation  
        "-t", str(total_duration),
        # Video encoding
        "-c:v", cfg['codec'],
        "-preset", cfg['preset'],
        "-crf", str(cfg['crf']),
        "-pix_fmt", cfg['pix_fmt'],
        "-r", str(cfg['fps']),
        # Audio encoding
        "-c:a", cfg['audio_codec'],
        "-ar", str(cfg['audio_rate']),
        "-ac", str(cfg['audio_channels']),
        "-b:a", cfg['audio_bitrate'],
        output_path
    ]

    run_ffmpeg(cmd, f"Creating podcast zoom segment: {os.path.basename(output_path)}")

    # Cleanup temporary looped video
    if os.path.exists(looped_blusanta):
        try:
            os.remove(looped_blusanta)
        except:
            pass

    return output_path


def get_stream_duration(file_path: str, stream_type: str) -> float:
    """
    Get duration of a specific stream (video or audio) in a media file.
    
    Args:
        file_path: Path to the media file
        stream_type: Stream selector (e.g., "v:0" for video, "a:0" for audio)
    
    Returns:
        float: Duration in seconds
    """
    cmd = [
        'ffprobe', '-v', 'error',
        '-select_streams', stream_type,
        '-show_entries', 'stream=duration',
        '-of', 'csv=p=0', file_path
    ]
    try:
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        return float(result.stdout.strip())
    except:
        return 0.0


def pad_audio_to_video_duration(video_path: str) -> str:
    """
    Ensures audio and video stream durations match by padding the shorter one.
    
    This is CRITICAL for seamless concatenation:
    - If audio is shorter than video: FFmpeg concat creates black frames to fill the gap
    - If video is shorter than audio: Audio continues after video ends, causing sync issues
    
    Based on Bhagyashree implementation which uses apad=pad_dur to fix audio.
    Extended to also handle video padding using tpad filter.
    
    Args:
        video_path: Path to video file to fix
        
    Returns:
        str: Path to fixed video (same as input, modified in place)
    """
    video_duration = get_stream_duration(video_path, "v:0")
    audio_duration = get_stream_duration(video_path, "a:0")
    
    diff_time = video_duration - audio_duration
    
    if diff_time > 0.01:  # Audio is shorter - pad audio with silence
        logger.info(f"Padding audio: video={video_duration:.3f}s, audio={audio_duration:.3f}s, diff={diff_time:.3f}s")
        
        temp_path = video_path.replace('.mp4', '_apad.mp4')
        
        cmd = [
            'ffmpeg', '-hide_banner', '-loglevel', 'error',
            '-i', video_path,
            '-af', f'apad=pad_dur={diff_time}',
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-y', temp_path
        ]
        
        try:
            subprocess.run(cmd, check=True)
            os.replace(temp_path, video_path)
            logger.info(f"Audio padded successfully: {os.path.basename(video_path)}")
        except Exception as e:
            logger.error(f"Failed to pad audio: {e}")
            if os.path.exists(temp_path):
                os.remove(temp_path)
                
    elif diff_time < -0.01:  # Video is shorter - pad video by extending last frame
        pad_duration = abs(diff_time)
        logger.info(f"Padding video: video={video_duration:.3f}s, audio={audio_duration:.3f}s, pad={pad_duration:.3f}s")
        
        temp_path = video_path.replace('.mp4', '_vpad.mp4')
        
        # Use tpad filter to extend video by holding the last frame
        cmd = [
            'ffmpeg', '-hide_banner', '-loglevel', 'error',
            '-i', video_path,
            '-vf', f'tpad=stop_mode=clone:stop_duration={pad_duration}',
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-c:a', 'copy',
            '-y', temp_path
        ]
        
        try:
            subprocess.run(cmd, check=True)
            os.replace(temp_path, video_path)
            logger.info(f"Video padded successfully: {os.path.basename(video_path)}")
        except Exception as e:
            logger.error(f"Failed to pad video: {e}")
            if os.path.exists(temp_path):
                os.remove(temp_path)
    
    return video_path


def concatenate_videos(input_videos: List[str], output_path: str) -> str:
    """
    Concatenates multiple videos into a single output using FFmpeg concat filter.

    IMPORTANT: All input videos MUST be standardized to the same parameters
    before concatenation. This function uses the concat filter (not demuxer)
    which allows for re-encoding to ensure consistent output.

    Args:
        input_videos: List of paths to videos to concatenate (in order)
        output_path: Path for the concatenated output video

    Returns:
        str: Path to the concatenated video
    """
    if not input_videos:
        raise ValueError("No videos to concatenate")

    if len(input_videos) == 1:
        shutil.copy(input_videos[0], output_path)
        return output_path

    logger.info(f"Concatenating {len(input_videos)} videos...")
    
    # Pad audio to match video duration for each input (prevents black frames at boundaries)
    # This matches Bhagyashree's approach in zoom_stitch.py
    for video in input_videos:
        pad_audio_to_video_duration(video)

    cfg = VIDEO_CONFIG

    # Build input arguments
    input_args = []
    for video in input_videos:
        input_args.extend(["-i", video])

    # Build filter for concat
    # Format: [0:v][0:a][1:v][1:a]...[n:v][n:a]concat=n=N:v=1:a=1[v][a]
    n = len(input_videos)
    filter_inputs = "".join([f"[{i}:v][{i}:a]" for i in range(n)])
    filter_complex = f"{filter_inputs}concat=n={n}:v=1:a=1[v][a]"

    cmd = [
        "ffmpeg", "-y",
        "-hide_banner", "-loglevel", "warning",
    ] + input_args + [
        "-filter_complex", filter_complex,
        "-map", "[v]",
        "-map", "[a]",
        # Re-encode to ensure consistent output
        "-c:v", cfg['codec'],
        "-preset", cfg['preset'],
        "-crf", str(cfg['crf']),
        "-pix_fmt", cfg['pix_fmt'],
        "-r", str(cfg['fps']),
        "-c:a", cfg['audio_codec'],
        "-ar", str(cfg['audio_rate']),
        "-ac", str(cfg['audio_channels']),
        "-b:a", cfg['audio_bitrate'],
        output_path
    ]

    run_ffmpeg(cmd, "Concatenating videos")
    return output_path


# ==============================================================================
# MAIN STITCHING PIPELINE
# ==============================================================================

def blusanta_video_stitching(payload: Dict[str, Any]) -> bool:
    """
    Main video stitching pipeline for BluSanta campaign videos.

    This function orchestrates the complete video creation process:
    1. Downloads all required assets from cloud storage
    2. Creates the 9-part podcast video with zoom effects
    3. Wraps with final intro/outro
    4. Uploads to cloud storage
    5. Sends webhook notification

    Payload Structure:
    {
        "intro_path": "gs://...",          # Podcast intro (part 1)
        "outro_path": "gs://...",          # Podcast outro (part 9)
        "final_intro_path": "gs://...",    # Final video intro wrapper
        "final_outro_path": "gs://...",    # Final video outro wrapper
        "podcast_background": "gs://...",  # Background image for zoom segments
        "font_path": "gs://...",           # Font for labels
        "subtitle_name": "Dr. Name",       # Doctor name for subtitles
        "employee_name": "Dr. Name",       # Doctor name for labels
        "assets_actor_paths": [...],       # 7 BluSanta/constant videos
        "assets_doctor_paths": [...],      # 7 slots (2 have doctor videos, rest null)
        "audio_overlays": [...],           # Audio replacement configuration
        "final_upload_path": "gs://...",   # Output destination
        "webhook_url": "https://...",      # Completion notification URL
        "additional_data": {...}           # Passthrough data for webhook
    }

    Args:
        payload: Stitching configuration dictionary

    Returns:
        bool: True if successful, False otherwise
    """
    # Create unique temp directory for this job
    job_id = str(int(time.time() * 1000))
    job_temp_dir = os.path.join(TEMP_DIR, f"job_{job_id}")
    os.makedirs(job_temp_dir, exist_ok=True)

    try:
        logger.info("=" * 60)
        logger.info("STARTING BLUSANTA VIDEO STITCHING")
        logger.info("=" * 60)
        start_time = time.time()

        # ---------------------------------------------------------------------
        # STEP 1: DOWNLOAD ALL ASSETS
        # ---------------------------------------------------------------------
        logger.info("STEP 1: Downloading assets...")

        # Define local paths for downloaded assets
        intro_path = None
        outro_path = None
        final_intro_path = None
        final_outro_path = None
        bg_path = os.path.join(job_temp_dir, "podcast_bg.jpg")
        font_path = os.path.join(job_temp_dir, "font.ttf") if payload.get("font_path") else None

        # Download main assets (skip None paths for new 8-segment format)
        if payload.get("intro_path"):
            intro_path = os.path.join(job_temp_dir, "intro.mp4")
            download_file(payload["intro_path"], intro_path)
        if payload.get("outro_path"):
            outro_path = os.path.join(job_temp_dir, "outro.mp4")
            download_file(payload["outro_path"], outro_path)
        if payload.get("final_intro_path"):
            final_intro_path = os.path.join(job_temp_dir, "final_intro.mp4")
            download_file(payload["final_intro_path"], final_intro_path)
        if payload.get("final_outro_path"):
            final_outro_path = os.path.join(job_temp_dir, "final_outro.mp4")
            download_file(payload["final_outro_path"], final_outro_path)
        
        download_file(payload["podcast_background"], bg_path)

        if payload.get("font_path"):
            download_file(payload["font_path"], font_path)

        # Download actor videos (7 videos for middle parts)
        actor_videos = []
        for i, url in enumerate(payload["assets_actor_paths"]):
            local_path = os.path.join(job_temp_dir, f"actor_{i}.mp4")
            download_file(url, local_path)
            actor_videos.append(local_path)

        # Download doctor videos (only 2 are non-null, at indices 2 and 4)
        doctor_videos = []
        for i, url in enumerate(payload["assets_doctor_paths"]):
            if url:
                local_path = os.path.join(job_temp_dir, f"doctor_{i}.mp4")
                download_file(url, local_path)
                doctor_videos.append(local_path)
            else:
                doctor_videos.append(None)

        # Download audio overlays (for placeholder videos)
        audio_overlays = []
        for item in payload.get("audio_overlays", []):
            idx = item["segment_index"]
            audio_url = item["audio_path"]
            local_path = os.path.join(job_temp_dir, f"audio_{idx}.mp3")
            download_file(audio_url, local_path)
            audio_overlays.append({
                "segment_index": idx,
                "audio_path": local_path
            })

        # Get doctor name for labels - use database fields directly
        dr_first_name = payload.get("additional_data", {}).get("drFirstName", "")
        dr_last_name = payload.get("additional_data", {}).get("drLastName", "")
        doctor_name = f"{dr_first_name} {dr_last_name}".strip() if dr_first_name or dr_last_name else "Doctor"

        logger.info(f"Downloaded {len(actor_videos)} actor videos, "
                   f"{sum(1 for v in doctor_videos if v)} doctor videos, "
                   f"{len(audio_overlays)} audio overlays")

        # ---------------------------------------------------------------------
        # STEP 2: CREATE THE 8-SEGMENT PODCAST VIDEO
        # ---------------------------------------------------------------------
        logger.info("STEP 2: Processing 8 video segments...")

        segments = []
        
        # Determine number of segments based on whether intro/outro exist
        num_segments = len(actor_videos)
        
        # Process all segments (8 segments for new format, 7 for legacy)
        for i in range(num_segments):
            part_num = i + 1
            actor_vid = actor_videos[i]
            doctor_vid = doctor_videos[i] if i < len(doctor_videos) else None
            output_seg = os.path.join(job_temp_dir, f"p{part_num}.mp4")

            # Check if this segment needs podcast zoom (has doctor video)
            if doctor_vid:
                # PODCAST ZOOM SEGMENTS
                # These show side-by-side BluSanta and Doctor with zoom animation
                
                # Create podcast zoom segment WITHOUT subtitles first
                podcast_temp = os.path.join(job_temp_dir, f"p{part_num}_podcast_temp.mp4")

                create_podcast_zoom_segment(
                    bg_image=bg_path,
                    blusanta_video=actor_vid,
                    doctor_video=doctor_vid,  # Use original doctor video without pre-burned subtitles
                    output_path=podcast_temp,
                    doctor_name=doctor_name,
                    font_path=font_path
                )

                # Generate subtitles for this podcast segment
                try:
                    logger.info(f"Generating subtitles for podcast segment {part_num}...")
                    subtitle_path = generate_subtitles_with_deepgram(podcast_temp, 'en')
                    if subtitle_path and os.path.exists(subtitle_path):
                        podcast_with_subs = os.path.join(job_temp_dir, f"p{part_num}_with_subs.mp4")
                        apply_subtitles_to_video(podcast_temp, subtitle_path, podcast_with_subs)
                        logger.info(f"✅ Applied subtitles to podcast segment {part_num}")
                        # Move the subtitled version to final path
                        shutil.move(podcast_with_subs, output_seg)
                    else:
                        logger.warning(f"⚠️ Subtitle generation failed for segment {part_num}, using without subtitles")
                        shutil.move(podcast_temp, output_seg)
                except Exception as subtitle_error:
                    logger.error(f"❌ Subtitle error for segment {part_num}: {subtitle_error}")
                    logger.warning("⚠️ Using podcast segment without subtitles")
                    shutil.move(podcast_temp, output_seg)

                logger.info(f"Part {part_num} (Podcast Zoom): Created")

            else:
                # Check if this segment needs audio overlay
                needs_audio_overlay = False
                audio_file = None
                template_type = None
                for overlay in audio_overlays:
                    if overlay["segment_index"] == i:
                        needs_audio_overlay = True
                        audio_file = overlay["audio_path"]
                        # Determine template type based on segment index
                        # Segment 1 = plc_000 (greeting), Segment 6 = plc_001 (thankyou)
                        if i == 1:
                            template_type = "greeting"
                        elif i == 6:
                            template_type = "thankyou"
                        break
                
                if needs_audio_overlay and audio_file:
                    # AUDIO OVERLAY SEGMENTS (plc_000 and plc_001)
                    # Replace audio with ElevenLabs generated audio
                    temp_output = output_seg.replace('.mp4', '_temp.mp4')
                    replace_audio_and_trim(actor_vid, audio_file, temp_output)
                    logger.info(f"Part {part_num} (Audio Overlay): Audio replaced")
                    
                    # Generate subtitles for audio overlay segment
                    # Use TEMPLATE subtitles for greeting/thankyou (accurate doctor name)
                    # instead of transcription (which may misspell the name)
                    try:
                        logger.info(f"Generating subtitles for audio overlay segment {part_num}...")
                        if template_type and dr_first_name:
                            # Use template-based subtitles for accurate doctor name
                            logger.info(f"Using template subtitles ({template_type}) with doctor name: {dr_first_name}")
                            subtitle_path = generate_template_subtitles(temp_output, template_type, dr_first_name)
                        else:
                            # Fallback to transcription if no template or name
                            subtitle_path = generate_subtitles_with_deepgram(temp_output, 'en')
                        
                        if subtitle_path and os.path.exists(subtitle_path):
                            overlay_with_subs = temp_output.replace('.mp4', '_with_subs.mp4')
                            apply_subtitles_to_video(temp_output, subtitle_path, overlay_with_subs)
                            logger.info(f"✓ Applied subtitles to audio overlay segment {part_num}")
                            shutil.move(overlay_with_subs, output_seg)
                            if os.path.exists(temp_output):
                                os.remove(temp_output)
                        else:
                            logger.warning(f"⚠ No subtitles generated for segment {part_num}")
                            shutil.move(temp_output, output_seg)
                    except Exception as sub_err:
                        logger.warning(f"⚠ Subtitle error for segment {part_num}: {sub_err}")
                        shutil.move(temp_output, output_seg)
                else:
                    # CONSTANT SEGMENTS
                    # Just standardize without modifications
                    temp_output = output_seg.replace('.mp4', '_temp.mp4')
                    standardize_video(actor_vid, temp_output)
                    logger.info(f"Part {part_num} (Constant): Standardized")
                    
                    # NOTE: Subtitle generation moved to final video (STEP 4B)
                    shutil.move(temp_output, output_seg)

            segments.append(output_seg)

        logger.info(f"Total segments processed: {len(segments)}")

        # ---------------------------------------------------------------------
        # STEP 3: CONCATENATE SEGMENTS INTO FINAL VIDEO
        # ---------------------------------------------------------------------
        logger.info(f"STEP 3: Concatenating {len(segments)} segments...")

        podcast_video = os.path.join(job_temp_dir, "podcast_full.mp4")

        # Guard against missing segments before invoking ffmpeg concat
        missing_segments = [seg for seg in segments if not os.path.exists(seg)]
        if missing_segments:
            missing_list = ", ".join(os.path.basename(seg) for seg in missing_segments)
            raise FileNotFoundError(f"Missing segment files before concat: {missing_list}")

        concatenate_videos(segments, podcast_video)

        # ---------------------------------------------------------------------
        # STEP 4: FINALIZE VIDEO (with or without wrappers)
        # ---------------------------------------------------------------------
        # If intro/outro paths are provided (legacy format), wrap the video
        # Otherwise, the concatenated podcast IS the final video (new 8-segment format)
        
        if final_intro_path and final_outro_path:
            logger.info("STEP 4: Adding final intro/outro wrappers...")
            
            # Standardize final intro/outro
            f_intro = os.path.join(job_temp_dir, "f_intro_std.mp4")
            f_outro = os.path.join(job_temp_dir, "f_outro_std.mp4")
            standardize_video(final_intro_path, f_intro)
            standardize_video(final_outro_path, f_outro)

            # Final concatenation: intro + podcast + outro
            final_output = os.path.join(OUTPUT_DIR, f"final_video_{job_id}.mp4")
            concatenate_videos([f_intro, podcast_video, f_outro], final_output)
        else:
            # No wrappers needed - podcast video IS the final video
            logger.info("STEP 4: No wrappers needed, using concatenated segments as final video")
            final_output = os.path.join(OUTPUT_DIR, f"final_video_{job_id}.mp4")
            # Move podcast_full to final output
            shutil.move(podcast_video, final_output)

        # ---------------------------------------------------------------------
        # STEP 4B: GENERATE AND APPLY SUBTITLES TO FINAL VIDEO
        # ---------------------------------------------------------------------
        # COMMENTED OUT: Subtitles are now pre-burned into const videos
        # and generated per-segment for podcast videos
        # logger.info("STEP 4B: Generating subtitles for final video...")
        # try:
        #     subtitle_path = generate_subtitles_with_deepgram(final_output, 'en')
        #     if subtitle_path and os.path.exists(subtitle_path):
        #         final_with_subtitles = final_output.replace('.mp4', '_with_subs.mp4')
        #         apply_subtitles_to_video(final_output, subtitle_path, final_with_subtitles)
        #         logger.info(f"✅ Applied subtitles to final video")
        #         # Replace original final output with subtitled version
        #         os.replace(final_with_subtitles, final_output)
        #     else:
        #         logger.warning("⚠️ Subtitle generation failed, proceeding without subtitles")
        # except Exception as subtitle_error:
        #     logger.error(f"❌ Subtitle generation error: {subtitle_error}")
        #     logger.warning("⚠️ Proceeding with final video without subtitles")
        logger.info("STEP 4B: Skipped (subtitles pre-burned in const videos + per-segment for podcast)")

        # ---------------------------------------------------------------------
        # STEP 5: UPLOAD TO CLOUD STORAGE
        # ---------------------------------------------------------------------
        logger.info("STEP 5: Uploading final video...")

        public_url = upload_file(final_output, payload["final_upload_path"])

        elapsed_time = time.time() - start_time
        logger.info("=" * 60)
        logger.info(f"STITCHING COMPLETE - Duration: {elapsed_time:.2f}s")
        logger.info(f"Final video: {public_url}")
        logger.info("=" * 60)

        # ---------------------------------------------------------------------
        # STEP 6: SEND WEBHOOK NOTIFICATION
        # ---------------------------------------------------------------------
        if payload.get("webhook_url"):
            try:
                webhook_data = {
                    "status": "completed",
                    "final_video_url": public_url,
                    "processing_time_seconds": elapsed_time,
                    "additional_data": payload.get("additional_data", {})
                }
                response = requests.post(
                    payload["webhook_url"],
                    json=webhook_data,
                    timeout=30
                )
                logger.info(f"Webhook sent: {response.status_code}")
            except Exception as e:
                logger.warning(f"Webhook failed: {e}")

        return True

    except Exception as e:
        logger.error(f"STITCHING FAILED: {e}", exc_info=True)

        # Send failure webhook
        if payload.get("webhook_url"):
            try:
                requests.post(
                    payload["webhook_url"],
                    json={
                        "status": "failed",
                        "error": str(e),
                        "additional_data": payload.get("additional_data", {})
                    },
                    timeout=30
                )
            except:
                pass

        return False

    finally:
        # Cleanup: Set machine status to free
        os.environ["machine_status"] = "free"

        # Cleanup temp files after processing
        try:
            shutil.rmtree(job_temp_dir)
        except:
            pass


# ==============================================================================
# FLASK API ROUTES
# ==============================================================================

def check_auth() -> bool:
    """Validates Bearer token authentication."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return False
    token = auth_header.split(" ")[1]
    return token == AUTH_TOKEN


@app.route("/health", methods=["GET"])
def health():
    """
    Health check endpoint.

    Returns:
        JSON: {"status": "ok", "machine_status": "free"|"busy"}
    """
    return jsonify({
        "status": "ok",
        "machine_status": os.environ.get("machine_status", "free"),
        "timestamp": time.time()
    })


@app.route("/status", methods=["GET"])
def status():
    """
    Authenticated status endpoint.

    Returns:
        JSON: {"status": "free"|"busy"}
    """
    if not check_auth():
        return jsonify({"detail": "Not authenticated"}), 401

    return jsonify({
        "status": os.environ.get("machine_status", "free")
    })


@app.route("/stitch", methods=["POST"])
def stitch_legacy():
    """Legacy endpoint - redirects to /stitching."""
    return stitch_endpoint()


@app.route("/stitching", methods=["POST"])
def stitch_endpoint():
    """
    Main stitching API endpoint - compatible with backend payload structure.

    Accepts POST request with JSON payload from backend and starts video stitching
    in a background thread.

    Request Headers:
        Authorization: Bearer <token>

    Request Body (Backend Format):
        {
            "constant_video_paths": ["gs://...", ...],  # 4 constant videos
            "placeholder_video_paths": ["gs://...", ...],  # 2 placeholder videos
            "nodding_video_path": "gs://...",  # 1 nodding video
            "doctor_video_paths": ["gs://...", ...],  # 2 doctor videos
            "greeting_audio_path": "gs://...",  # ElevenLabs audio 1
            "thank_you_audio_path": "gs://...",  # ElevenLabs audio 2
            "podcast_background": "gs://...",  # Background image
            "final_upload_path": "gs://...",  # Output destination
            "webhook_url": "https://...",  # Completion webhook
            "additional_data": {...}  # Passthrough data
        }

    Returns:
        202: Accepted - stitching started
        400: Bad request - invalid payload
        401: Unauthorized - invalid token
        503: Service unavailable - machine busy
    """
    if not check_auth():
        return jsonify({"detail": "Not authenticated"}), 401

    if os.environ.get("machine_status") == "busy":
        return jsonify({
            "error": "Machine busy",
            "status": "busy",
            "message": "Please try again later or use a different server"
        }), 503

    backend_payload = request.json
    if not backend_payload:
        return jsonify({"error": "No payload provided"}), 400

    # Validate required fields from backend
    required_fields = [
        "constant_video_paths", "placeholder_video_paths", "nodding_video_path",
        "doctor_video_paths", "greeting_audio_path", "thank_you_audio_path",
        "podcast_background", "final_upload_path"
    ]
    missing = [f for f in required_fields if f not in backend_payload]
    if missing:
        return jsonify({
            "error": f"Missing required fields: {missing}"
        }), 400

    try:
        # Convert backend payload to internal format
        # Backend sends 8-segment structure, we need to map to 9-part format
        const_videos = backend_payload["constant_video_paths"]  # 4 videos
        plc_videos = backend_payload["placeholder_video_paths"]  # 2 videos
        nodding_video = backend_payload["nodding_video_path"]
        doctor_videos = backend_payload["doctor_video_paths"]  # 2 videos

        # Map to 8-segment structure (NO intro/outro wrappers):
        # Sequence: const_000, plc_000, const_001, nodding+dr1, const_002, nodding+dr2, plc_001, const_003
        # Intro is merged into const_000, outro is merged into const_003
        
        # Create 8 actor videos for the complete sequence
        actor_videos = [
            const_videos[0],  # Segment 0: const_000 (includes intro + greeting)
            plc_videos[0],    # Segment 1: plc_000 (will get greeting audio overlay)
            const_videos[1],  # Segment 2: const_001
            nodding_video,    # Segment 3: nodding (for zoom with doctor)
            const_videos[2],  # Segment 4: const_002
            nodding_video,    # Segment 5: nodding (for zoom with doctor)
            plc_videos[1],    # Segment 6: plc_001 (will get thank you audio overlay)
            const_videos[3],  # Segment 7: const_003 (includes final message + outro)
        ]

        # Doctor videos array: 8 slots, only indices 3 and 5 have actual videos
        doctor_videos_array = [
            None,                         # Segment 0: no doctor
            None,                         # Segment 1: no doctor
            None,                         # Segment 2: no doctor
            doctor_videos[0],             # Segment 3: ZOOM with doctor response 1
            None,                         # Segment 4: no doctor
            doctor_videos[1],             # Segment 5: ZOOM with doctor response 2
            None,                         # Segment 6: no doctor
            None,                         # Segment 7: no doctor
        ]

        # Audio overlays: indices 1 and 6 get audio replacement (plc_000 and plc_001)
        audio_overlays = [
            {"segment_index": 1, "audio_path": backend_payload["greeting_audio_path"]},
            {"segment_index": 6, "audio_path": backend_payload["thank_you_audio_path"]},
        ]

        # Build internal payload structure (NO intro/outro/final wrappers)
        converted_payload = {
            "intro_path": None,  # No separate intro - merged into const_000
            "outro_path": None,  # No separate outro - merged into const_003
            "final_intro_path": None,  # No final intro wrapper
            "final_outro_path": None,  # No final outro wrapper
            "podcast_background": backend_payload["podcast_background"],
            "font_path": "gs://blusanta-campaign-videos/blusanta/fonts/Montserrat-SemiBold.ttf",  # Professional font for labels
            "assets_actor_paths": actor_videos,
            "assets_doctor_paths": doctor_videos_array,
            "audio_overlays": audio_overlays,
            "final_upload_path": backend_payload["final_upload_path"],
            "webhook_url": backend_payload.get("webhook_url"),
            "additional_data": backend_payload.get("additional_data", {}),
        }

        logger.info(f"Converted backend payload to internal format")
        logger.info(f"Actor videos: {len(actor_videos)}, Doctor videos: 2, Audio overlays: 2")
        
    except Exception as e:
        logger.error(f"Payload conversion error: {e}")
        return jsonify({
            "error": f"Invalid payload structure: {str(e)}"
        }), 400

    # Set machine as busy BEFORE starting thread
    os.environ["machine_status"] = "busy"

    def run_stitching():
        """Background thread function for video stitching."""
        try:
            blusanta_video_stitching(converted_payload)
        except Exception as e:
            logger.error(f"Background stitching failed: {e}")
            os.environ["machine_status"] = "free"

    # Start stitching in background thread
    thread = threading.Thread(target=run_stitching, daemon=True)
    thread.start()

    return jsonify({
        "status": "processing",
        "message": "Video stitching started successfully",
        "job_started_at": time.time()
    }), 202


# ==============================================================================
# MAIN ENTRY POINT
# ==============================================================================

if __name__ == "__main__":
    # Development server configuration
    port = int(os.environ.get("PORT", 8080))
    debug = os.environ.get("DEBUG", "false").lower() == "true"

    logger.info("=" * 60)
    logger.info("BLUSANTA VIDEO STITCHING SERVICE")
    logger.info(f"Starting Flask server on port {port}")
    logger.info(f"Debug mode: {debug}")
    logger.info("=" * 60)

    app.run(host="0.0.0.0", port=port, debug=debug)
