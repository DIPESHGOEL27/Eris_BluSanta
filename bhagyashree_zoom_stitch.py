import logging
import warnings
import os
import subprocess
import time
import tempfile
import shutil
import requests

from moviepy.editor import VideoFileClip, concatenate_videoclips, AudioFileClip
from moviepy.audio.fx.all import audio_fadeout
from utils.subtitles_generator import generate_subtitles
from utils.logging_config import logger, log_session_breaker

warnings.filterwarnings('ignore')

logger.info("Successfully imported all the libraries for stitching!")

CURR_DIR = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(CURR_DIR, "assets")

def get_duration(file_path):
    duration_cmd_format = "ffprobe -hide_banner -loglevel error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 {}".format(file_path)
    return float(subprocess.check_output(duration_cmd_format, shell=True))

def process_video(video_path, target_duration, loop=True):
    base_name = os.path.basename(video_path)
    output_path = os.path.join(os.path.dirname(video_path), base_name.replace('.mp4', '_processed.mp4'))
    
    video_duration = get_duration(video_path)
    if loop and video_duration < target_duration:
        loop_cmd = (
            'ffmpeg -hide_banner -loglevel error -stream_loop -1 -i "{input_video}" '
            '-t {target_duration} -c:v h264 -crf 21 -preset fast -pix_fmt yuv420p '
            '-c:a aac -ar 16000 -ac 1 -y "{output_video}"'
        ).format(input_video=video_path, target_duration=target_duration, output_video=output_path)
    else:
        loop_cmd = "ffmpeg -hide_banner -loglevel error -i {} -c:v h264 -crf 21 -preset fast -pix_fmt yuv420p -c:a aac -ar 16000 -ac 1 -t {} -y {}".format(
            video_path, target_duration, output_path)

    subprocess.run(loop_cmd, shell=True, check=True)
    return output_path

def zoom_stitch(left_video, right_video, zoom_bg, output_video, driving_flag, emp_name, font_path, text_font_path):
    try:
        duration_left = get_duration(left_video)
        duration_right = get_duration(right_video)
        transition_duration = 1.0  
        target_duration = duration_right + transition_duration

        if driving_flag not in ['left', 'right']:
            raise ValueError("Invalid driving_flag. Use 'left' or 'right'.")

        # Process the left video to match the target duration
        updated_left_video = process_video(left_video, target_duration, loop=True)
        left_video = updated_left_video

        # Define constants
        full_width = 1920
        small_width = 900
        full_height = 1080
        small_height = 540
        target_x = 30
        target_y = 266
        duration_right_plus_transition = duration_right + transition_duration

        width_expr = (
            "if(lt(t,{transition_duration}),"
            "{full_width}-0.5*(1-cos(PI*t/{transition_duration}))*({full_width}-{small_width}),"
            "if(lt(t,{duration_right}),"
            "{small_width},"
            "if(lt(t,{duration_right_plus_transition}),"
            "{small_width}+0.5*(1-cos(PI*(t-{duration_right})/{transition_duration}))*({full_width}-{small_width}),"
            "{full_width})))"
        ).format(
            transition_duration=transition_duration,
            full_width=full_width,
            small_width=small_width,
            duration_right=duration_right,
            duration_right_plus_transition=duration_right_plus_transition
        )

        height_expr = (
            "if(lt(t,{transition_duration}),"
            "{full_height}-0.5*(1-cos(PI*t/{transition_duration}))*({full_height}-{small_height}),"
            "if(lt(t,{duration_right}),"
            "{small_height},"
            "if(lt(t,{duration_right_plus_transition}),"
            "{small_height}+0.5*(1-cos(PI*(t-{duration_right})/{transition_duration}))*({full_height}-{small_height}),"
            "{full_height})))"
        ).format(
            transition_duration=transition_duration,
            full_height=full_height,
            small_height=small_height,
            duration_right=duration_right,
            duration_right_plus_transition=duration_right_plus_transition
        )

        overlay_y_expr = (
            "if(lt(t,{transition_duration}),"
            "0.5*(1 - cos(PI*t/{transition_duration}))*{target_y},"
            "if(lt(t,{duration_right}),"
            "{target_y},"
            "if(lt(t,{duration_right_plus_transition}),"
            "{target_y} - 0.5*(1 - cos(PI*(t - {duration_right})/{transition_duration}))*{target_y},"
            "0)))"
        ).format(
            transition_duration=transition_duration,
            duration_right=duration_right,
            duration_right_plus_transition=duration_right_plus_transition,
            target_y=target_y
        )

        overlay_x_expr_left = (
            "if(lt(t,{transition_duration}),"
            "0.5*(1 - cos(PI*t/{transition_duration}))*{target_x},"
            "if(lt(t,{duration_right}),"
            "{target_x},"
            "if(lt(t,{duration_right_plus_transition}),"
            "{target_x} - 0.5*(1 - cos(PI*(t - {duration_right})/{transition_duration}))*{target_x},"
            "0)))"
        ).format(
            transition_duration=transition_duration,
            duration_right=duration_right,
            duration_right_plus_transition=duration_right_plus_transition,
            target_x=target_x
        )

        overlay_x_expr_right = (
            "if(lt(t,{transition_duration}),"
            "{full_width} - 0.5*(1 - cos(PI*t/{transition_duration}))*({full_width}-{target_x_right}),"
            "if(lt(t,{duration_right}),"
            "{target_x_right},"
            "if(lt(t,{duration_right_plus_transition}),"
            "{target_x_right} + 0.5*(1 - cos(PI*(t - {duration_right})/{transition_duration}))*({full_width}-{target_x_right}),"
            "{full_width})))"
        ).format(
            transition_duration=transition_duration,
            full_width=full_width,
            target_x_right=980,
            duration_right=duration_right,
            duration_right_plus_transition=duration_right_plus_transition
        )
        # Build the FFmpeg command
        stitch_cmd = (
            'ffmpeg -hide_banner -loglevel error -i "{bg_img}" -i "{left_video}" -i "{right_video}" '
            '-filter_complex "'
            '[0:v]scale=1920:1080[background]; '
            '[1:v]setsar=1,setpts=PTS-STARTPTS,'
            'pad=iw+20:ih+20:10:10:white,'
            'scale=\'{width_expr}\':\'{height_expr}\':eval=frame[left_scaled]; '
            '[background][left_scaled]overlay=x=\'{overlay_x_expr_left}\':y=\'{overlay_y_expr}\'[tmp1]; '
            '[2:v]setsar=1,setpts=PTS-STARTPTS,'
            'pad=iw+20:ih+20:10:10:white,'
            'scale=900:540[right_scaled]; '
            '[tmp1][right_scaled]overlay=x=\'{overlay_x_expr_right}\':y=266,format=yuv420p[final_output]; '
            '[final_output]drawtext=text=\'Host\':x=50:y=769:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=15:'
            'fontfile={font_path}:enable=\'between(t,{transition_duration},{duration_right})\'[v1]; '
            '[v1]drawtext=text=\'{emp_name}\':x=1000:y=765:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=15:'
            'fontfile={font_path}:enable=\'between(t,{transition_duration},{duration_right})\'[v2]; '
            '[v2]drawtext=text=\'Making hassle-free insulin initiation possible for all\':x=(w-text_w)/2:y=100:fontsize=60:fontcolor=white:'
            'fontfile={text_font_path}:alpha=\'if(lt(t,5),1,if(lt(t,6),1-(t-5),0))\'[v_final]" '
            '-map "[v_final]" '
            '-map "2:a" '
            '-y "{output_video}"'
        ).format(
            bg_img=zoom_bg,
            left_video=left_video,
            right_video=right_video,
            width_expr=width_expr,
            height_expr=height_expr,
            overlay_y_expr=overlay_y_expr,
            overlay_x_expr_left=overlay_x_expr_left,
            overlay_x_expr_right=overlay_x_expr_right,
            font_path=font_path,
            transition_duration=transition_duration,
            duration_right=duration_right,
            emp_name=emp_name,
            text_font_path=text_font_path,
            output_video=output_video
        )

        # Run the FFmpeg command
        subprocess.run(stitch_cmd, shell=True, check=True)
        logger.info("Stitching completed for {}".format(output_video))

    except Exception as e:
        logger.info("Error {} occurred in the request".format(e))
    finally:
        if os.path.exists(updated_left_video):
            os.remove(updated_left_video)

def get_stream_duration(file_path, stream_type):
    """Returns the duration of the video or audio stream in seconds."""
    cmd = [
        'ffprobe', '-v', 'error',
        '-select_streams', stream_type,
        '-show_entries', 'stream=duration',
        '-of', 'csv=p=0', file_path
    ]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return float(result.stdout.strip())

def video_generator(assets_actor, assets_doctor, zoom_bg, output_dir, emp_name=None, sub_dir=None, font_path=None, text_font_path=None, bg_music=None, vid_lang=None):
    try:
        driving_flag = 'left'
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)

        actor_files = sorted([f for f in os.listdir(assets_actor) if f.endswith('.mp4')])
        doctor_files = sorted([f for f in os.listdir(assets_doctor) if f.endswith('.mp4')])

        if len(actor_files) != len(doctor_files):
            raise ValueError("The number of actor and doctor videos must be the same.")

        intermediate_outputs = []
        logger.info("Stitching in progress...")
        for i in range(len(actor_files)):
            actor_video = os.path.join(assets_actor, actor_files[i])
            doctor_video = os.path.join(assets_doctor, doctor_files[i])

            output_video = os.path.join(output_dir, 'intermediate_{}.mp4'.format(i))
            if driving_flag == 'right':
                doctor_video_upd = doctor_video.replace('.mp4', '_upd.mp4')
                update_cmd = (
                    'ffmpeg -hide_banner -loglevel error -i {} '
                    '-vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1/1" '
                    '-r 25 -c:v h264 -pix_fmt yuv420p -c:a aac -ar 16000 -ac 1 -y {}'
                ).format(doctor_video, doctor_video_upd)
                subprocess.run(update_cmd, shell=True, check=True)
                zoom_stitch(actor_video, doctor_video_upd, zoom_bg, output_video, driving_flag, emp_name, font_path, text_font_path)
            else:
                shutil.copy(actor_video, output_video)
                logger.info("Intermediate video saved at {}".format(output_video))

            intermediate_outputs.append(output_video)

            # Alternate the driving flag
            driving_flag = 'right' if driving_flag == 'left' else 'left'

        # Add subtitles to the intermediate outputs
        sub_intermediate_outputs = []
        for input_video in intermediate_outputs:
            out_video = input_video.replace(".mp4", "_with_sub.mp4")
            video_name = os.path.basename(input_video)
            if video_name.startswith('intermediate_0') or video_name.startswith('intermediate_6'):
                output_sub_path = os.path.join(sub_dir, video_name).replace(".mp4" ,".ass")
            elif video_name.startswith('intermediate_2') or video_name.startswith('intermediate_4'):
                shutil.copy(input_video, out_video)
                logger.info("Subbed Intermediate video saved at {}".format(out_video))
                sub_intermediate_outputs.append(out_video)
                continue
            else:
                output_sub_path = generate_subtitles(video_path=input_video, output_format='ass', language=vid_lang)
            sub_cmd = 'ffmpeg -hide_banner -loglevel error -i {input_video} -i {output_sub_path} -vf "ass={output_sub_path}" {output_video}'.format(input_video=input_video, output_sub_path=output_sub_path, output_video=out_video)
            subprocess.run(sub_cmd, shell=True, check=True)
            logger.info("Subbed Intermediate video saved at {}".format(out_video))
            sub_intermediate_outputs.append(out_video)
        
        # Video is longer, so add a delay to the audio
        for out_video in sub_intermediate_outputs:
            int_vid = out_video.replace('.mp4', "_1.mp4")
            diff_time = ((get_stream_duration(out_video, "v:0") - get_stream_duration(out_video, "a:0")))
            if diff_time > 0:
                cmd = ('ffmpeg -hide_banner -loglevel error -i {} -af "apad=pad_dur={}" -c:v copy -c:a aac -y {}').format(out_video, diff_time, int_vid)
                # logger.info("Adding audio delay: {}".format(cmd))
                subprocess.run(cmd, shell=True, check=True)
                cmd = ('mv {} {}').format(int_vid, out_video)
                subprocess.run(cmd, shell=True, check=True)

        # Final stitch of all intermediate outputs
        final_output_path = os.path.join(output_dir, 'final_video.mp4')
        temp_output_path = os.path.join(output_dir, 'temp_fin_video.mp4')

        final_stitching(sub_intermediate_outputs, final_output_path, temp_output_path)

        logger.info("Final video stitching complete!!! \nFinal video saved at {}".format(final_output_path))

    except Exception as e: 
        logger.info("Error {} occurred in the request".format(e))
    
    finally:
        for video in intermediate_outputs:
            if os.path.exists(video):
                os.remove(video)
        os.remove(temp_output_path)

def final_stitching(sub_intermediate_outputs, final_output_path, temp_output_path, fadeout_duration=1):
    """
    Stitch multiple video clips into a single video with audio fade-out at the end of each clip, 
    then normalize audio with FFmpeg.

    Parameters:
    - sub_intermediate_outputs (list of str): Paths to the input video files.
    - final_output_path (str): Path to save the final stitched video.
    - temp_output_path (str): Temporary file path for the intermediate stitched video.
    - fadeout_duration (float): Duration of the fade-out effect in seconds.
    """
    logger.info("Final stitching in progress...")
    clips = []

    # Load all video clips and apply fade-out to audio
    for idx, video_path in enumerate(sub_intermediate_outputs):
        try:
            clip = VideoFileClip(video_path)
            if clip.audio:
                # Apply fade-out effect to the audio
                clip = clip.set_audio(audio_fadeout(clip.audio, fadeout_duration))
            clips.append(clip)
        except Exception as e:
            logger.info("Error loading or processing clip {}: {}".format(video_path, e))

    if not clips:
        logger.info("No valid clips found for stitching. Aborting.")
        return

    try:
        # Concatenate video clips
        final_clip = concatenate_videoclips(clips, method='compose')

        # Write the intermediate video with processed audio
        final_clip.write_videofile(
            temp_output_path,
            codec='libx264',
            audio_codec='aac',
            audio_bitrate='128k'
        )

        # Apply loudnorm filter using FFmpeg
        ffmpeg_command = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel", "error", 
            "-i", temp_output_path,
            "-c:v", "libx264",
            "-crf", "21",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "128k",
            "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
            final_output_path
        ]

        subprocess.run(ffmpeg_command, check=True)

    except subprocess.CalledProcessError as e:
        logger.info("FFmpeg error: {}".format(e))

    except Exception as e:
        logger.info("Error during video stitching: {}".format(e))

    finally:
        # Release resources
        for clip in clips:
            clip.close()
        if 'final_clip' in locals():
            final_clip.close()

def remote_video_stitching(input_obj): 
    try:
        start = time.time()
        os.environ["machine_status"] = "busy"  
        curr_dir = tempfile.TemporaryDirectory(prefix="temp_")
        local_assets_actor = os.path.join(curr_dir.name, 'assets_actor')
        local_assets_doctor = os.path.join(curr_dir.name, 'assets_doctor')
        zoom_bg = os.path.join(curr_dir.name, 'zoom_bg.png')
        font_file_path = os.path.join(curr_dir.name, 'Lato-Regular.ttf')
        text_font_file_path = os.path.join(curr_dir.name, 'Montserrat-SemiBold.ttf')
        final_local_video_path = os.path.join(curr_dir.name, 'final_video.mp4')

        sub_name=input_obj["subtitle_name"]
        subtitles_dir = os.path.join(curr_dir.name, 'subtitles')
        os.makedirs(subtitles_dir, exist_ok=True) 
        inter_sub_0 = os.path.join(subtitles_dir, 'intermediate_0.ass')
        inter_sub_1 = os.path.join(subtitles_dir, 'intermediate_6.ass')

        logger.info("Downloading assets...")
        download_from_cloud(input_obj["background_image"], zoom_bg, folder=False)
        download_from_cloud(input_obj["font_path"], font_file_path, folder=False)
        download_from_cloud(input_obj["text_font_path"], text_font_file_path, folder=False)
        download_from_cloud(input_obj["subtitle_files"], subtitles_dir, folder=True)
        for i, video_gcp_url in enumerate(input_obj["assets_actor_paths"]):
            video_path = os.path.join(local_assets_actor, 'video_{:02}.mp4'.format(i))
            download_from_cloud(video_gcp_url, video_path, folder=False)

        for i, video_gcp_url in enumerate(input_obj["assets_doctor_paths"]):
            video_path = os.path.join(local_assets_doctor, 'video_{:02}.mp4'.format(i))
            download_from_cloud(video_gcp_url, video_path, folder=False)

        video_lang = input_obj["video_language"]
        input_output_file1 = inter_sub_0
        input_output_file2 = inter_sub_1
        if video_lang == "en": 
            target_line_file1 = "Dialogue: Marked=0,0:00:34.00,0:00:38.00,Default,,0,0,0,, Hello Dr. Chaitanya, thank you for joining us today."
            new_line_file1 = "Dialogue: Marked=0,0:00:34.00,0:00:38.00,Default,,0,0,0,, Hello {}, thank you for joining us today.".format(sub_name)

            target_line_file2 = "Dialogue: Marked=0,0:00:00.00,0:00:03.00,Default,,0,0,0,, Thank you, Dr. Chaitanya, for sharing the facts with us."
            new_line_file2 = "Dialogue: Marked=0,0:00:00.00,0:00:03.00,Default,,0,0,0,, Thank you, {}, for sharing the facts with us.".format(sub_name)
        
        elif video_lang == "hi":
            target_line_file1 = "Dialogue: Marked=0,0:00:47.00,0:00:51.20,Default,,0,0,0,, Namaskar, Dr. Chaitanya, thanks for joining us."
            new_line_file1 = "Dialogue: Marked=0,0:00:47.00,0:00:51.20,Default,,0,0,0,, Namaskar, {}, thanks for joining us.".format(sub_name)

            target_line_file2 = "Dialogue: Marked=0,0:00:00.00,0:00:05.00,Default,,0,0,0,, Thank you, Dr. Chaitanya for sharing this information with us."
            new_line_file2 = "Dialogue: Marked=0,0:00:00.00,0:00:05.00,Default,,0,0,0,, Thank you, {} for sharing this information with us.".format(sub_name)

        def modify_file_in_place(file_path, target_line, new_line):
            # Read the content of the file into memory
            with open(file_path, 'r', encoding='utf-8') as file:
                lines = file.readlines()

            # Modify the lines in memory
            with open(file_path, 'w', encoding='utf-8') as file:
                for line in lines:
                    if line.strip() == target_line:
                        file.write(new_line + '\n')  # Write the modified line
                    else:
                        file.write(line)  # Write other lines unchanged

        # Modify both files in place
        modify_file_in_place(input_output_file1, target_line_file1, new_line_file1)
        modify_file_in_place(input_output_file2, target_line_file2, new_line_file2)
        logger.info("Both sub files have been updated successfully.")

        video_generator(local_assets_actor, local_assets_doctor, zoom_bg, curr_dir.name, emp_name=input_obj["employee_name"], sub_dir=subtitles_dir, font_path=font_file_path, text_font_path=text_font_file_path, vid_lang=video_lang)
        upload_to_cloud(final_local_video_path, input_obj["final_upload_path"])
        end = time.time()
        logger.info("Video Stitching Time: {}".format(round(end - start, 2)))
        handle_response(input_obj, success=True)
    
    except Exception as e: 
        logger.info("Error {} occurred in the request".format(e))
        handle_response(input_obj, success=False)

    finally:
        os.environ["machine_status"] = "free"

def s3_to_https(s3_uri):
    if not s3_uri.startswith("s3://"):
        raise ValueError("Invalid S3 URI. Must start with 's3://'.")

    s3_path = s3_uri[5:]
    bucket_name, *object_path = s3_path.split("/", 1)

    if not object_path:
        raise ValueError("Invalid S3 URI. No object path found.")

    https_url = "https://{bucket}.s3.us-east-1.amazonaws.com/{path}".format(
        bucket=bucket_name, path=object_path[0]
    )
    return https_url

def handle_response(request_data, success=True):
    webhook_url = request_data.get("webhook_url" if success else "failure_webhook_url", "")
    s3_final_upload_path = request_data.get("final_upload_path", "")
    http_final_upload_path = s3_to_https(s3_final_upload_path)
    if webhook_url:
        response_data = {
            "final_upload_path": http_final_upload_path,
            "employee_name": request_data.get("employee_name", ""),
            "additional_data": request_data.get("additional_data", "")
        }
        logger.info("Sending {} response, json: {}".format("success" if success else "failure", response_data))
        try:
            x = requests.post(webhook_url, json=response_data)
            logger.info("Webhook_url: {}".format(webhook_url))
            logger.info("{} webhook response {}".format("Success" if success else "Failure", x.text))
        except Exception as e:
            logger.info("Error sending {} webhook: {}".format("success" if success else "failure", str(e)))
    else:
        logger.info("No Webhook URL received in the request!")

def download_from_cloud(source_uri, target_dir, folder=True, data_cloud="aws"):
    logger.info('Downloading from cloud {} to {}'.format(source_uri, target_dir))
    if data_cloud == "gcp":
        if folder:
            source_uri = os.path.join(source_uri, '*')
        download_cmd = "gcloud storage cp -r {} {}".format(source_uri,target_dir)
        subprocess.run(download_cmd, shell=True, check=True)
    elif data_cloud == "aws":
        if folder:
            download_cmd = "aws s3 cp --recursive {} {}".format(source_uri, target_dir)
        else:
            download_cmd = "aws s3 cp {} {}".format(source_uri, target_dir)
        logger.info('Command is {}'.format(download_cmd))
        subprocess.run(download_cmd, shell=True, check=True)
    else:
        raise ValueError("Unsupported cloud provider")

def upload_to_cloud(local_file, remote_uri, cloud="aws"):
    """Upload assets to cloud storage."""
    if cloud == "gcp":
        upload_cmd = "gcloud storage cp {} {}".format(local_file, remote_uri)
        subprocess.run(upload_cmd, shell=True, check=True)
    elif cloud == "aws":
        upload_cmd = "aws s3 cp {} {}".format(local_file, remote_uri)
        subprocess.run(upload_cmd, shell=True, check=True)
    else:
        raise ValueError("Unsupported cloud provider")

if __name__ == '__main__':
    t1 = time.time()
    # actor_video = "/home/ubuntu/Downloads/MuseTalk/test_eris/interviewer_intro.mp4"
    # doctor_video = "/home/ubuntu/Downloads/MuseTalk/test_eris/interviewee_silent.mp4"
    # output_video = os.path.join(os.path.dirname(actor_video), 'final_output_right.mp4')
    
    assets_actor = '/home/ubuntu/Downloads/ffmpeg-server/assets/assets_actor_upd2'
    assets_doctor = '/home/ubuntu/Downloads/ffmpeg-server/assets/assets_doctor_upd2'
    zoom_bg = "/home/ubuntu/Downloads/MuseTalk/test_eris/assets/bg_zoom.png"
    output_dir = os.path.join(CURR_DIR, 'out_dir')
    emp_name = "Dr. Biswajeeta Sahu Rajnikanth Yadav"
    sub_name = "Dr. Shalin"
    font_file_path = "/home/ubuntu/Downloads/ffmpeg-server/assets/Lato-Regular.ttf"
    text_font_file_path = "/home/ubuntu/Downloads/ffmpeg-server/assets/Lato-Regular.ttf"
    video_lang = 'en'

    input_dict = {
        'assets_actor': assets_actor,
        'assets_doctor': assets_doctor,
        'zoom_bg': zoom_bg,
        'output_dir': output_dir,
        'emp_name': emp_name,
        'sub_name': sub_name,
        'font_path': font_file_path,
        'text_font_path': text_font_file_path,
        'vid_lang': video_lang
    }

    video_generator(**input_dict)
    t2 = time.time()
    logger.info("Video Stitching Time: {}".format(round(t2 - t1, 2)))
