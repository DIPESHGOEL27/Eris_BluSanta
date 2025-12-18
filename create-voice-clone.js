/**
 * BluSanta Voice Clone Creator
 *
 * This script extracts audio from training videos and creates
 * an ElevenLabs Instant Voice Clone (IVC) from the samples.
 *
 * Prerequisites:
 *   - ffmpeg installed and in PATH
 *   - Node.js 18+
 *   - ElevenLabs API key
 *
 * Usage:
 *   node create-voice-clone.js
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const FormData = require("form-data");

// Configuration
const ELEVENLABS_API_KEY =
  process.env.ELEVENLABS_API_KEY || "YOUR_API_KEY_HERE";
const VOICE_NAME = "BluSanta";
const VOICE_DESCRIPTION =
  "BluSanta character voice for personalized video greetings";
const REMOVE_BACKGROUND_NOISE = true;

// Paths
const VIDEOS_DIR = path.join(__dirname, "videos");
const AUDIO_OUTPUT_DIR = path.join(__dirname, "audio-samples");

// Training videos to use
const TRAINING_VIDEOS = [
  "Blue Santa_Training_eng.mp4",
  "Blusanta_Dr Abhishek.mp4",
  "Blusanta_Dr Bhargavi.mp4",
  "Blusanta_Dr Venketshwara.mp4",
  "Blusanta_question-2.mp4",
  "Blusanta_Thank you_Dr Abhishek.mp4",
  "Blusanta_Thank you_Dr Venketshwara.mp4",
  "Blusanta_Thank you_Dr___.mp4",
];

async function main() {
  console.log("🎅 BluSanta Voice Clone Creator");
  console.log("================================\n");

  // Check for API key
  if (ELEVENLABS_API_KEY === "YOUR_API_KEY_HERE") {
    console.error(
      "❌ Please set ELEVENLABS_API_KEY environment variable or update the script"
    );
    console.log("\nUsage:");
    console.log(
      '  $env:ELEVENLABS_API_KEY="your_api_key"; node create-voice-clone.js'
    );
    process.exit(1);
  }

  // Check for ffmpeg
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    console.log("✅ ffmpeg found");
  } catch (error) {
    console.error(
      "❌ ffmpeg not found. Please install ffmpeg and add it to PATH"
    );
    console.log("\nInstall ffmpeg:");
    console.log("  Windows: winget install ffmpeg");
    console.log("  Or download from: https://ffmpeg.org/download.html");
    process.exit(1);
  }

  // Create audio output directory
  if (!fs.existsSync(AUDIO_OUTPUT_DIR)) {
    fs.mkdirSync(AUDIO_OUTPUT_DIR, { recursive: true });
  }

  // Step 1: Extract audio from videos
  console.log("\n📹 Extracting audio from training videos...\n");
  const audioFiles = [];

  for (const video of TRAINING_VIDEOS) {
    const videoPath = path.join(VIDEOS_DIR, video);
    const audioFileName = video.replace(".mp4", ".mp3");
    const audioPath = path.join(AUDIO_OUTPUT_DIR, audioFileName);

    if (!fs.existsSync(videoPath)) {
      console.log(`⚠️  Skipping: ${video} (not found)`);
      continue;
    }

    console.log(`  Extracting: ${video}`);

    try {
      // Extract audio using ffmpeg
      // -y: overwrite output
      // -i: input file
      // -vn: no video
      // -acodec libmp3lame: use MP3 codec
      // -ar 44100: sample rate 44.1kHz
      // -ac 1: mono audio
      // -ab 192k: bitrate 192kbps
      execSync(
        `ffmpeg -y -i "${videoPath}" -vn -acodec libmp3lame -ar 44100 -ac 1 -ab 192k "${audioPath}"`,
        {
          stdio: "ignore",
        }
      );

      audioFiles.push(audioPath);
      console.log(`    ✅ Saved: ${audioFileName}`);
    } catch (error) {
      console.log(`    ❌ Failed: ${error.message}`);
    }
  }

  if (audioFiles.length === 0) {
    console.error(
      "\n❌ No audio files extracted. Please check your videos directory."
    );
    process.exit(1);
  }

  console.log(`\n✅ Extracted ${audioFiles.length} audio files\n`);

  // Step 2: Create voice clone using ElevenLabs API
  console.log("🎙️  Creating ElevenLabs voice clone...\n");

  try {
    const voiceId = await createVoiceClone(audioFiles);

    console.log("\n================================");
    console.log("✅ Voice Clone Created Successfully!");
    console.log("================================\n");
    console.log(`Voice Name: ${VOICE_NAME}`);
    console.log(`Voice ID:   ${voiceId}`);
    console.log("\n📋 Next Steps:");
    console.log("1. Copy the Voice ID above");
    console.log("2. Update your .env file:");
    console.log(`   ELEVENLABS_VOICE_ID=${voiceId}`);
    console.log("\n🔗 View your voice at:");
    console.log(`   https://elevenlabs.io/app/voice-lab`);

    // Save voice ID to file for reference
    fs.writeFileSync(
      path.join(__dirname, "voice-id.txt"),
      `BluSanta Voice ID: ${voiceId}\nCreated: ${new Date().toISOString()}\n`
    );
  } catch (error) {
    console.error("❌ Failed to create voice clone:", error.message);
    if (error.response) {
      console.error("API Response:", error.response);
    }
    process.exit(1);
  }
}

async function createVoiceClone(audioFiles) {
  // Using native fetch (Node 18+) with FormData
  const FormData = (await import("form-data")).default;
  const form = new FormData();

  // Add voice name
  form.append("name", VOICE_NAME);

  // Add description
  form.append("description", VOICE_DESCRIPTION);

  // Add remove background noise option
  form.append("remove_background_noise", REMOVE_BACKGROUND_NOISE.toString());

  // Add labels as JSON string
  form.append(
    "labels",
    JSON.stringify({
      accent: "indian",
      gender: "male",
      use_case: "narration",
      character: "santa",
    })
  );

  // Add audio files
  for (const audioPath of audioFiles) {
    const fileName = path.basename(audioPath);
    const fileBuffer = fs.readFileSync(audioPath);
    form.append("files", fileBuffer, {
      filename: fileName,
      contentType: "audio/mpeg",
    });
    console.log(`  Adding sample: ${fileName}`);
  }

  console.log("\n  Uploading to ElevenLabs...");

  // Make API request
  const response = await fetch("https://api.elevenlabs.io/v1/voices/add", {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      ...form.getHeaders(),
    },
    body: form,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error ${response.status}: ${errorText}`);
  }

  const result = await response.json();

  if (result.requires_verification) {
    console.log(
      "\n⚠️  Voice requires verification. Please check your ElevenLabs dashboard."
    );
  }

  return result.voice_id;
}

// Run the script
main().catch(console.error);
