/**
 * BluSanta Voice Clone Creator (v2)
 *
 * Uses axios for better multipart/form-data handling
 *
 * Prerequisites:
 *   - ffmpeg installed and in PATH
 *   - Node.js 18+
 *   - ElevenLabs API key
 *
 * Usage:
 *   node create-voice-clone-v2.js
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const https = require("https");

// Configuration
const ELEVENLABS_API_KEY =
  process.env.ELEVENLABS_API_KEY ||
  "sk_1feb432a033b0b140f81c9785954b73b09cdddc332143440cf4e076ae68cf678";
const VOICE_NAME = "BluSanta";
const VOICE_DESCRIPTION =
  "BluSanta character voice for personalized video greetings";

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
  console.log("🎅 BluSanta Voice Clone Creator (v2)");
  console.log("====================================\n");

  // Check for ffmpeg
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    console.log("✅ ffmpeg found");
  } catch (error) {
    console.error(
      "❌ ffmpeg not found. Please install ffmpeg and add it to PATH"
    );
    process.exit(1);
  }

  // Create audio output directory
  if (!fs.existsSync(AUDIO_OUTPUT_DIR)) {
    fs.mkdirSync(AUDIO_OUTPUT_DIR, { recursive: true });
  }

  // Step 1: Extract audio from videos (if not already done)
  console.log("\n📹 Checking audio samples...\n");
  const audioFiles = [];

  for (const video of TRAINING_VIDEOS) {
    const videoPath = path.join(VIDEOS_DIR, video);
    const audioFileName = video.replace(".mp4", ".mp3");
    const audioPath = path.join(AUDIO_OUTPUT_DIR, audioFileName);

    if (!fs.existsSync(videoPath)) {
      console.log(`⚠️  Skipping: ${video} (not found)`);
      continue;
    }

    // Check if already extracted
    if (fs.existsSync(audioPath)) {
      console.log(`  ✅ Already exists: ${audioFileName}`);
      audioFiles.push(audioPath);
      continue;
    }

    console.log(`  Extracting: ${video}`);

    try {
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
      "\n❌ No audio files found. Please check your videos directory."
    );
    process.exit(1);
  }

  console.log(`\n✅ ${audioFiles.length} audio files ready\n`);

  // Step 2: Create voice clone using ElevenLabs API with raw HTTP
  console.log("🎙️  Creating ElevenLabs voice clone...\n");

  try {
    const voiceId = await createVoiceCloneRaw(audioFiles);

    console.log("\n====================================");
    console.log("✅ Voice Clone Created Successfully!");
    console.log("====================================\n");
    console.log(`Voice Name: ${VOICE_NAME}`);
    console.log(`Voice ID:   ${voiceId}`);
    console.log("\n📋 Update your backend/.env file:");
    console.log(`   ELEVENLABS_VOICE_ID=${voiceId}`);

    // Save voice ID
    fs.writeFileSync(
      path.join(__dirname, "voice-id.txt"),
      `BluSanta Voice ID: ${voiceId}\nCreated: ${new Date().toISOString()}\n`
    );
  } catch (error) {
    console.error("❌ Failed to create voice clone:", error.message);
    process.exit(1);
  }
}

function createVoiceCloneRaw(audioFiles) {
  return new Promise((resolve, reject) => {
    const boundary =
      "----WebKitFormBoundary" + Math.random().toString(36).substring(2);

    // Build multipart form data manually
    let body = "";

    // Add name field
    body += `--${boundary}\r\n`;
    body += 'Content-Disposition: form-data; name="name"\r\n\r\n';
    body += `${VOICE_NAME}\r\n`;

    // Add description field
    body += `--${boundary}\r\n`;
    body += 'Content-Disposition: form-data; name="description"\r\n\r\n';
    body += `${VOICE_DESCRIPTION}\r\n`;

    // Add remove_background_noise field
    body += `--${boundary}\r\n`;
    body +=
      'Content-Disposition: form-data; name="remove_background_noise"\r\n\r\n';
    body += "true\r\n";

    // Convert string part to buffer
    const stringPart = Buffer.from(body, "utf8");

    // Prepare file parts
    const fileParts = [];
    for (const audioPath of audioFiles) {
      const fileName = path.basename(audioPath);
      const fileContent = fs.readFileSync(audioPath);

      const fileHeader = Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="files"; filename="${fileName}"\r\n` +
          `Content-Type: audio/mpeg\r\n\r\n`,
        "utf8"
      );

      const fileEnd = Buffer.from("\r\n", "utf8");

      fileParts.push(fileHeader, fileContent, fileEnd);
      console.log(
        `  Adding: ${fileName} (${(fileContent.length / 1024).toFixed(1)} KB)`
      );
    }

    // Final boundary
    const endBoundary = Buffer.from(`--${boundary}--\r\n`, "utf8");

    // Combine all parts
    const fullBody = Buffer.concat([stringPart, ...fileParts, endBoundary]);

    console.log(
      `\n  Total upload size: ${(fullBody.length / 1024 / 1024).toFixed(2)} MB`
    );
    console.log("  Uploading to ElevenLabs...");

    const options = {
      hostname: "api.elevenlabs.io",
      port: 443,
      path: "/v1/voices/add",
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": fullBody.length,
      },
    };

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            const result = JSON.parse(data);
            resolve(result.voice_id);
          } catch (e) {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        } else {
          reject(new Error(`API Error ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.write(fullBody);
    req.end();
  });
}

// Run
main().catch(console.error);
