"""
BluSanta Video Stitching - Simplified FFmpeg approach
"""

import os
import tempfile
import time
import subprocess
import logging
import requests
import shutil

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [INFO] %(message)s")

def download_from_gcp(gcp_url, local_path):
    if gcp_url is None or str(gcp_url).lower() in ["none", "null", ""]:
        return None
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    cmd = f'gcloud storage cp -r "{gcp_url}" "{local_path}"'
    logger.info(f"Downloading: {gcp_url}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        logger.error(f"Download failed: {result.stderr}")
        return None
    return local_path

def upload_to_gcp(local_path, gcp_path):
    cmd = f'gcloud storage cp "{local_path}" "{gcp_path}"'
    logger.info(f"Uploading to: {gcp_path}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"Upload failed: {result.stderr}")
    logger.info("Upload completed successfully")

def blusanta_video_stitching(input_obj):
    work_dir = None
    webhook_url = input_obj.get("webhook_url")
    additional_data = input_obj.get("additional_data", {})
    
    try:
        start = time.time()
        os.environ["machine_status"] = "busy"
        work_dir = tempfile.mkdtemp(prefix="blusanta_")
        
        logger.info("=== BluSanta Video Stitching Started ===")
        logger.info(f"Working directory: {work_dir}")
        
        actor_paths = input_obj.get("assets_actor_paths", [])
        doctor_paths = input_obj.get("assets_doctor_paths", [])
        intro_path = input_obj.get("intro_path")
        outro_path = input_obj.get("outro_path")
        final_upload_path = input_obj.get("final_upload_path")
        
        logger.info(f"Actor videos: {len(actor_paths)}")
        
        # Download intro
        local_intro = None
        if intro_path:
            local_intro = os.path.join(work_dir, "intro.mp4")
            if not download_from_gcp(intro_path, local_intro):
                local_intro = None
        
        # Download actor videos
        local_actors = []
        for i, url in enumerate(actor_paths):
            local_path = os.path.join(work_dir, f"actor_{i:02d}.mp4")
            if download_from_gcp(url, local_path):
                local_actors.append(local_path)
            else:
                raise Exception(f"Failed to download actor video {i}")
        
        logger.info(f"Downloaded {len(local_actors)} actor videos")
        
        # Download doctor videos
        local_doctors = {}
        for i, url in enumerate(doctor_paths):
            if url and str(url).lower() not in ["none", "null", ""]:
                local_path = os.path.join(work_dir, f"doctor_{i:02d}.mp4")
                if download_from_gcp(url, local_path):
                    local_doctors[i] = local_path
        
        logger.info(f"Downloaded {len(local_doctors)} doctor videos")
        
        # Download outro
        local_outro = None
        if outro_path:
            local_outro = os.path.join(work_dir, "outro.mp4")
            if not download_from_gcp(outro_path, local_outro):
                local_outro = None
        
        # Build video sequence
        video_sequence = []
        if local_intro and os.path.exists(local_intro):
            video_sequence.append(local_intro)
        
        for i, actor_path in enumerate(local_actors):
            video_sequence.append(actor_path)
            if i in local_doctors:
                video_sequence.append(local_doctors[i])
        
        if local_outro and os.path.exists(local_outro):
            video_sequence.append(local_outro)
        
        logger.info(f"Total videos: {len(video_sequence)}")
        
        # Create concat file
        concat_list = os.path.join(work_dir, "concat_list.txt")
        with open(concat_list, "w") as f:
            for vp in video_sequence:
                f.write(f"file '{vp}'\n")
        
        # Concatenate
        final_output = os.path.join(work_dir, "final_video.mp4")
        concat_cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "warning",
            "-f", "concat", "-safe", "0", "-i", concat_list,
            "-c:v", "libx264", "-crf", "23", "-preset", "fast",
            "-c:a", "aac", "-b:a", "128k", "-pix_fmt", "yuv420p",
            final_output
        ]
        logger.info("Concatenating with FFmpeg...")
        result = subprocess.run(concat_cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise Exception(f"FFmpeg failed: {result.stderr}")
        
        if not os.path.exists(final_output):
            raise Exception("Final video not created")
        
        logger.info(f"Final video: {os.path.getsize(final_output)} bytes")
        
        # Upload
        upload_to_gcp(final_output, final_upload_path)
        
        # Webhook
        if webhook_url:
            logger.info(f"Calling webhook: {webhook_url}")
            try:
                resp = requests.post(webhook_url, json={"additional_data": additional_data}, timeout=30)
                logger.info(f"Webhook response: {resp.status_code}")
            except Exception as e:
                logger.error(f"Webhook failed: {e}")
        
        logger.info(f"=== Complete in {time.time()-start:.2f}s ===")
        return True
        
    except Exception as e:
        logger.error(f"Error: {e}")
        import traceback
        traceback.print_exc()
        if webhook_url:
            try:
                requests.post(webhook_url, json={"additional_data": additional_data, "error": str(e)}, timeout=10)
            except:
                pass
        return False
    
    finally:
        os.environ["machine_status"] = "free"
        if work_dir and os.path.exists(work_dir):
            try:
                shutil.rmtree(work_dir)
            except:
                pass
