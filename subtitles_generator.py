mport os
import re
import time
import openai
import sys
import subprocess

# Add the parent directory of the current file to the system path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.logging_config import logger

# Initialize OpenAI API key
from dotenv import load_dotenv
load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")

def transcribe_with_whisper_api(audio_path, video_language='en'):
    """
    Transcribes the audio using OpenAI's Whisper API with a provided prompt for context.
    
    Parameters:
    - audio_path (str): Path to the audio file to transcribe.
    - audio_language (str): Language of the audio (default is 'en' for English).
    Returns:
    - result (dict): Transcription result from the Whisper API.
    """
    if not os.path.exists(audio_path):
        raise FileNotFoundError("Audio file '{}' not found.".format(audio_path))

    logger.info("Uploading and transcribing audio '{}' with Whisper API...".format(audio_path))

    # Define the conversation prompt
    context_prompt = (
        "This video is a conversation in hinglish(mix of hindi and english language) between a doctor and an actor discussing common lifestyle diseases such as "
        "allergies. The doctor explains the causes, symptoms, and preventive measures for "
        "these diseases. The conversation includes discussions on healthy eating, exercise, and medication as part of "
        "the treatment plan. The actor asks questions about specific lifestyle changes that can help manage these "
        "conditions, and the doctor provides medical advice, focusing on remedies like diet modifications, regular "
        "physical activity, and stress management. Return the final transcript in english letters i.e. if there is hindi word then convert it into english like वेलनेस -> wellness, हमारी -> humari"
    )

    # Transcription request
    with open(audio_path, "rb") as audio_file:
        transcript = openai.Audio.transcribe(
            model="whisper-1",
            file=audio_file,
            response_format="verbose_json",
            timestamp_granularities=["word"],
            # language=video_language
            # ,
            prompt=context_prompt
        )
    print(transcript)
    return transcript

def generate_subtitles(video_path, output_format='ass', language='en'):
    """
    Generates subtitles from a video file using the Whisper API.

    Parameters:
    - video_path (str): Path to the input video file.
    - output_format (str): Subtitle format ('ass' by default).

    Returns:
    - output_subtitle_path (str): Path to the generated subtitle file.
    """
    audio_path = video_path.replace(".mp4","_audio.mp3")
    audio_ext_cmd = "ffmpeg -hide_banner -loglevel error -i {} -vn -acodec mp3 -y {}".format(video_path, audio_path)
    subprocess.run(audio_ext_cmd, shell=True, check=True)
    result = transcribe_with_whisper_api(audio_path)
    # rr = "const_002.json"
    # import json
    # print(f"rr: {rr}")
    # with open(rr, 'r') as f:
    #     result = json.load(f)

    # Define output subtitle file path
    subtitles_dir = os.path.join(os.path.dirname(video_path), 'subtitles')
    os.makedirs(subtitles_dir, exist_ok=True)
    video_name = os.path.splitext(os.path.basename(video_path))[0]
    subtitle_filename = '{}.{}'.format(video_name, output_format)
    output_subtitle_path = os.path.join(subtitles_dir, subtitle_filename)

    # Store constant content in variables
    script_info = (
        "[Script Info]\n"
        "Title: Generated Subtitles\n"
        "Original Script: Whisper API\n"
        "ScriptType: v4.00\n"
        "PlayResX: 1920\n"
        "PlayResY: 1080\n\n"
    )

    styles_info = (
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
        "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, "
        "MarginR, MarginV, Encoding\n"
        "Style: Default, Arial, 40, &H00FFFFFF, &H000000FF, &H00000000, &H00000000, 0, 0, 0, 0, 100, 100, 0, 0, 3, "
        "1, 1, 2, 30, 30, 110, 1\n\n"
    )

    events_header = (
        "[Events]\n"
        "Format: Marked, Start, End, Style, Name, MarginL, MarginR, "
        "MarginV, Effect, Text\n"
    )

    # Prepare content to write to the ASS file
    content = [script_info, styles_info, events_header]

    # Define the replacements for the actor's name
    name_replacements = {
        r'\blakshman\b': 'Laxman',
        r'\blaksman\b': 'Laxman',
        r'\bluckshman\b': 'Laxman',
        r'\bluxman\b': 'Laxman',
        r'\blaxman\b': 'Laxman',
        r'\blaxmen\b': 'Laxman',
        r'\blakshmen\b': 'Laxman',
        r'\blakshmaan\b': 'Laxman',
        r'\blaxmaan\b': 'Laxman',
        r'\bluckshmaan\b': 'Laxman',
        r'\blukshman\b': 'Laxman',
        r'\bluckshman\b': 'Laxman',
        r'\blaksmaan\b': 'Laxman',
        r'\brashman\b': 'Laxman',
        r'\brakshman\b': 'Laxman',
        r'\brashmaan\b': 'Laxman',
        r'\brakshmaan\b': 'Laxman',
        r'\bVBS\b': 'VVS',
        r'\bBBS\b': 'VVS',
    }

    # Correct the subtitles
    for segment in result['segments']:
        start_time = format_ass_timestamp(segment['start'])
        end_time = format_ass_timestamp(segment['end'])

        corrected_text = segment['text']
        # Replace actor's name variants
        for pattern, replacement in name_replacements.items():
            corrected_text = re.sub(pattern, replacement, corrected_text, flags=re.IGNORECASE)

        safe_text = corrected_text.replace('\\', '\\\\').replace('{', '{{').replace('}', '}}')

        dialogue = "Dialogue: Marked=0,{},{},Default,,0,0,0,,{}\n".format(start_time, end_time, safe_text)
        content.append(dialogue)

    with open(output_subtitle_path, 'w') as ass_file:
        logger.info("Saving subtitles to '{}'...".format(output_subtitle_path))
        ass_file.writelines(content)

    logger.info("Subtitles generated successfully!")
    return output_subtitle_path

def format_ass_timestamp(seconds):
    """
    Formats timestamp to ASS format (H:MM:SS.CC).
    
    Parameters:
    - seconds (float): Time in seconds.
    
    Returns:
    - formatted (str): Time in ASS timestamp format.
    """
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    seconds = int(seconds % 60)
    milliseconds = int((seconds - int(seconds)) * 100)
    return "{:01}:{:02}:{:02}.{:02}".format(hours, minutes, seconds, milliseconds)

if __name__ == '__main__':
    st = time.time()
    output_ass = generate_subtitles(video_path='/home/ubuntu/Downloads/ffmpeg-server/hindi/static_2_upd.mp4')
    end = time.time()
    logger.info("Generated subtitles: {} and Time taken is : {}".format(output_ass, end - st))