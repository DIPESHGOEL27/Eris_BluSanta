import os
import json
import logging
import subprocess
import requests
import shutil
from google.cloud import storage
from flask import Flask, request, jsonify
import threading
import time

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Flask App
app = Flask(__name__)
os.environ["machine_status"] = "free"
AUTH_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiZTMxZjE2YTVlMTQzYTBkZTExMjkifQ.pWDOEeQy1M8C_4sazA3Vm3VIFN59DoeZBfGC2bXxrLs"

# Constants
ASSETS_DIR = "assets"
OUTPUT_DIR = "output"
TEMP_DIR = "temp"

os.makedirs(ASSETS_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)

def download_file(url, destination):
    """Downloads a file from gs://, http://, or file://."""
    if url.startswith("gs://"):
        bucket_name = url.split("/")[2]
        blob_name = "/".join(url.split("/")[3:])
        storage_client = storage.Client()
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(blob_name)
        blob.download_to_filename(destination)
    elif url.startswith("http"):
        response = requests.get(url, stream=True)
        with open(destination, 'wb') as f:
            shutil.copyfileobj(response.raw, f)
    elif url.startswith("file://"):
        src = url.replace("file://", "")
        shutil.copy(src, destination)
    else:
        # Assume local path
        shutil.copy(url, destination)
    logger.info(f"Downloaded {url} to {destination}")

def upload_file(local_path, destination_url):
    """Uploads a file to gs://."""
    if destination_url.startswith("gs://"):
        bucket_name = destination_url.split("/")[2]
        blob_name = "/".join(destination_url.split("/")[3:])
        storage_client = storage.Client()
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(blob_name)
        blob.upload_from_filename(local_path)
        # blob.make_public()
        return f"https://storage.googleapis.com/{bucket_name}/{blob_name}"
    return destination_url

def get_media_duration(file_path):
    cmd = [
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", file_path
    ]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        return float(result.stdout.strip())
    except:
        return 0.0

def standardize_video(input_path, output_path):
    """Standardize video to 1920x1080, 25fps, aac 44100Hz stereo."""
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "warning",
        "-i", input_path,
        "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1",
        "-r", "25",
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-ar", "44100", "-ac", "2",
        output_path
    ]
    logger.info(f"Standardizing {input_path} -> {output_path}")
    subprocess.run(cmd, check=True)

def replace_audio_and_trim(video_path, audio_path, output_path):
    """Replaces audio and trims video to audio duration."""
    audio_dur = get_media_duration(audio_path)
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "warning",
        "-stream_loop", "-1", "-i", video_path,
        "-i", audio_path,
        "-map", "0:v", "-map", "1:a",
        "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1",
        "-r", "25",
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-ar", "44100", "-ac", "2",
        "-shortest", "-t", str(audio_dur),
        output_path
    ]
    logger.info(f"Replacing audio in {video_path} -> {output_path}")
    subprocess.run(cmd, check=True)

def create_podcast_zoom_segment(bg_image, blusanta_video, doctor_video, output_path):
    """Creates zoom segment with Doctor audio."""
    duration = get_media_duration(doctor_video)
    
    # Layout: BG, Left: BluSanta, Right: Doctor
    # Scale overlays to height 800
    filter_complex = (
        f"[1:v]scale=-1:800[v1];"
        f"[2:v]scale=-1:800[v2];"
        f"[0:v][v1]overlay=100:140[bg1];"
        f"[bg1][v2]overlay=1000:140[v]"
    )

    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "warning",
        "-loop", "1", "-i", bg_image,
        "-i", blusanta_video,
        "-i", doctor_video,
        "-filter_complex", filter_complex,
        "-map", "[v]",
        "-map", "2:a",  # Doctor audio
        "-t", str(duration),
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-ar", "44100", "-ac", "2",
        output_path
    ]
    logger.info(f"Creating zoom segment {output_path}")
    subprocess.run(cmd, check=True)

def blusanta_video_stitching(payload):
    """
    8-SEGMENT STRUCTURE (Bhagyashree Podcast Pattern):
    ========================================================
    Segment 0: const_000 (Intro + Greeting merged)
    Segment 1: plc_000 (Placeholder with "Doctor <first name>" audio overlay)
    Segment 2: const_001 (Question 1)
    Segment 3: nodding (trimmed to doctor response 1 duration) + doctor_video_1 ZOOM
    Segment 4: const_002 (Question 2)
    Segment 5: nodding (trimmed to doctor response 2 duration) + doctor_video_2 ZOOM
    Segment 6: plc_001 (Placeholder with "Thank you Doctor <first name>" audio overlay)
    Segment 7: const_003 (Final message + Thank you + Outro merged)
    
    TWO AUDIO OVERLAYS:
    - greeting_audio_path: ElevenLabs audio "Doctor <first name>" for segment 1
    - thank_you_audio_path: ElevenLabs audio "Thank you Doctor <first name>" for segment 6
    """
    try:
        logger.info("Starting 8-segment BluSanta stitching with TWO audio overlays...")
        
        # 1. Download Assets
        bg_path = os.path.join(ASSETS_DIR, "bg.jpg")
        download_file(payload["podcast_background"], bg_path)
        
        # Download constant videos (segments 0, 2, 4, 7)
        constant_videos = []
        for i, url in enumerate(payload["constant_video_paths"]):
            path = os.path.join(ASSETS_DIR, f"const_{i}.mp4")
            download_file(url, path)
            constant_videos.append(path)
        logger.info(f"Downloaded {len(constant_videos)} constant videos")
        
        # Download placeholder videos (segments 1, 6)
        placeholder_videos = []
        for i, url in enumerate(payload["placeholder_video_paths"]):
            path = os.path.join(ASSETS_DIR, f"plc_{i}.mp4")
            download_file(url, path)
            placeholder_videos.append(path)
        logger.info(f"Downloaded {len(placeholder_videos)} placeholder videos")
        
        # Download nodding video (segments 3, 5)
        nodding_path = os.path.join(ASSETS_DIR, "nodding.mp4")
        download_file(payload["nodding_video_path"], nodding_path)
        logger.info("Downloaded nodding video")
        
        # Download doctor videos (for zoom segments 3, 5)
        doctor_videos = []
        for i, url in enumerate(payload["doctor_video_paths"]):
            if url:
                path = os.path.join(ASSETS_DIR, f"doctor_{i}.mp4")
                download_file(url, path)
                doctor_videos.append(path)
            else:
                doctor_videos.append(None)
        logger.info(f"Downloaded {len([v for v in doctor_videos if v])} doctor videos")
        
        # Download TWO ElevenLabs audio files
        greeting_audio_path = os.path.join(ASSETS_DIR, "greeting_audio.mp3")
        download_file(payload["greeting_audio_path"], greeting_audio_path)
        logger.info(f"Downloaded greeting audio: {payload['greeting_audio_path']}")
        
        thank_you_audio_path = os.path.join(ASSETS_DIR, "thank_you_audio.mp3")
        download_file(payload["thank_you_audio_path"], thank_you_audio_path)
        logger.info(f"Downloaded thank you audio: {payload['thank_you_audio_path']}")
        
        # 2. Process 8 Segments
        segments = []
        
        # Segment 0: const_000 (Intro + Greeting merged)
        seg0 = os.path.join(TEMP_DIR, "seg0.mp4")
        standardize_video(constant_videos[0], seg0)
        segments.append(seg0)
        logger.info("✅ Segment 0: const_000 processed")
        
        # Segment 1: plc_000 with greeting audio overlay
        seg1 = os.path.join(TEMP_DIR, "seg1.mp4")
        replace_audio_and_trim(placeholder_videos[0], greeting_audio_path, seg1)
        segments.append(seg1)
        logger.info("✅ Segment 1: plc_000 with greeting audio processed")
        
        # Segment 2: const_001 (Question 1)
        seg2 = os.path.join(TEMP_DIR, "seg2.mp4")
        standardize_video(constant_videos[1], seg2)
        segments.append(seg2)
        logger.info("✅ Segment 2: const_001 processed")
        
        # Segment 3: nodding + doctor_video_1 ZOOM
        seg3 = os.path.join(TEMP_DIR, "seg3.mp4")
        create_podcast_zoom_segment(bg_path, nodding_path, doctor_videos[0], seg3)
        segments.append(seg3)
        logger.info("✅ Segment 3: nodding + doctor response 1 ZOOM processed")
        
        # Segment 4: const_002 (Question 2)
        seg4 = os.path.join(TEMP_DIR, "seg4.mp4")
        standardize_video(constant_videos[2], seg4)
        segments.append(seg4)
        logger.info("✅ Segment 4: const_002 processed")
        
        # Segment 5: nodding + doctor_video_2 ZOOM
        seg5 = os.path.join(TEMP_DIR, "seg5.mp4")
        create_podcast_zoom_segment(bg_path, nodding_path, doctor_videos[1], seg5)
        segments.append(seg5)
        logger.info("✅ Segment 5: nodding + doctor response 2 ZOOM processed")
        
        # Segment 6: plc_001 with thank you audio overlay
        seg6 = os.path.join(TEMP_DIR, "seg6.mp4")
        replace_audio_and_trim(placeholder_videos[1], thank_you_audio_path, seg6)
        segments.append(seg6)
        logger.info("✅ Segment 6: plc_001 with thank you audio processed")
        
        # Segment 7: const_003 (Final message + Thank you + Outro merged)
        seg7 = os.path.join(TEMP_DIR, "seg7.mp4")
        standardize_video(constant_videos[3], seg7)
        segments.append(seg7)
        logger.info("✅ Segment 7: const_003 processed")
        
        # 3. Concatenate 8 Segments
        concat_list = os.path.join(TEMP_DIR, "concat_list.txt")
        with open(concat_list, "w") as f:
            for seg in segments:
                f.write(f"file '{os.path.abspath(seg)}'\n")
        
        final_output = os.path.join(OUTPUT_DIR, "final_video.mp4")
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "warning",
            "-f", "concat", "-safe", "0", "-i", concat_list,
            "-c", "copy", final_output
        ]
        logger.info("Concatenating 8 segments...")
        subprocess.run(cmd, check=True)
        
        # 4. Upload
        public_url = upload_file(final_output, payload["final_upload_path"])
        logger.info(f"✅ Final video uploaded to {public_url}")
        
        # 5. Webhook
        if payload.get("webhook_url"):
            requests.post(payload["webhook_url"], json={
                "status": "completed",
                "additional_data": {
                    "id": payload.get("additional_data", {}).get("id"),
                    "final_video_url": public_url
                }
            })
            logger.info("✅ Webhook notification sent")

        return True

    except Exception as e:
        logger.error(f"❌ Stitching failed: {e}")
        if payload.get("webhook_url"):
            requests.post(payload["webhook_url"], json={"status": "failed", "error": str(e)})
        return False
    finally:
        os.environ["machine_status"] = "free"
        
        # Clean up temp files after processing
        try:
            # Clean ASSETS_DIR (downloaded files)
            for f in os.listdir(ASSETS_DIR):
                file_path = os.path.join(ASSETS_DIR, f)
                if os.path.isfile(file_path):
                    os.remove(file_path)
            logger.info(f"✅ Cleaned up assets directory: {ASSETS_DIR}")
        except Exception as cleanup_err:
            logger.warning(f"⚠️ Failed to cleanup assets: {cleanup_err}")
        
        try:
            # Clean TEMP_DIR (processed segments)
            for f in os.listdir(TEMP_DIR):
                file_path = os.path.join(TEMP_DIR, f)
                if os.path.isfile(file_path):
                    os.remove(file_path)
            logger.info(f"✅ Cleaned up temp directory: {TEMP_DIR}")
        except Exception as cleanup_err:
            logger.warning(f"⚠️ Failed to cleanup temp: {cleanup_err}")
        
        try:
            # Clean OUTPUT_DIR (final video after upload)
            for f in os.listdir(OUTPUT_DIR):
                file_path = os.path.join(OUTPUT_DIR, f)
                if os.path.isfile(file_path):
                    os.remove(file_path)
            logger.info(f"✅ Cleaned up output directory: {OUTPUT_DIR}")
        except Exception as cleanup_err:
            logger.warning(f"⚠️ Failed to cleanup output: {cleanup_err}")

# Flask Routes
def check_auth():
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return False
    token = auth_header.split(" ")[1]
    return token == AUTH_TOKEN

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "machine_status": os.environ.get("machine_status", "free")})

@app.route("/status", methods=["GET"])
def status():
    if not check_auth():
        return jsonify({"detail": "Not authenticated"}), 401
    machine_status = os.environ.get("machine_status", "free")
    return jsonify({"status": machine_status})

@app.route("/stitch", methods=["POST"])
def stitch_legacy():
    return stitch_endpoint()

@app.route("/stitching", methods=["POST"])
def stitch_endpoint():
    if not check_auth():
        return jsonify({"detail": "Not authenticated"}), 401
    
    if os.environ.get("machine_status") == "busy":
        return jsonify({"error": "Machine busy", "status": "busy"}), 503
    
    payload = request.json
    if not payload:
        return jsonify({"error": "No payload"}), 400
    
    os.environ["machine_status"] = "busy"

    def run():
        blusanta_video_stitching(payload)

    thread = threading.Thread(target=run)
    thread.start()

    return jsonify({"status": "processing", "message": "Video stitching started"}), 202

if __name__ == "__main__":
    logger.info("Starting Flask server on port 8080...")
    app.run(host="0.0.0.0", port=8080, debug=False)
