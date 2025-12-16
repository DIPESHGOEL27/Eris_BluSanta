/**
 * BluSanta Background Worker
 * Polls database for pending assessments and triggers audio/video generation
 * Run with: node worker.js
 */

const fetch = require("node-fetch");
const db = require("./db/database");
const { BLUSANTA_CONFIG } = require("./utils/constants");

const POLL_INTERVAL = 60 * 1000; // Check every 60 seconds
const BASE_URL = process.env.BACKEND_URL || "http://localhost:3001";

console.log(`[BLUSANTA WORKER] Starting worker...`);
console.log(`[BLUSANTA WORKER] Poll interval: ${POLL_INTERVAL / 1000}s`);
console.log(`[BLUSANTA WORKER] Backend URL: ${BASE_URL}`);

/**
 * Check for pending audio generation
 */
async function checkAudioGeneration() {
  return new Promise((resolve) => {
    db.all(
      `SELECT COUNT(*) as count FROM assessments 
       WHERE audio_generation = 0 AND avatar_name = ?`,
      [BLUSANTA_CONFIG.avatarName],
      async (err, rows) => {
        if (err) {
          console.error(
            `[BLUSANTA WORKER] DB error checking audio:`,
            err.message
          );
          return resolve();
        }

        const count = rows[0]?.count || 0;
        if (count > 0) {
          console.log(
            `[BLUSANTA WORKER] 🎤 Found ${count} assessment(s) pending audio generation`
          );
          try {
            const response = await fetch(
              `${BASE_URL}/api/blusanta/initiate-audio-generation`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
              }
            );

            if (response.ok) {
              const result = await response.json();
              console.log(
                `[BLUSANTA WORKER] ✅ Audio generation triggered:`,
                result.message
              );
            } else {
              console.error(
                `[BLUSANTA WORKER] ❌ Audio trigger failed:`,
                response.statusText
              );
            }
          } catch (error) {
            console.error(
              `[BLUSANTA WORKER] ❌ Error triggering audio:`,
              error.message
            );
          }
        }

        resolve();
      }
    );
  });
}

/**
 * Check for pending video stitching
 */
async function checkVideoStitching() {
  return new Promise((resolve) => {
    db.all(
      `SELECT COUNT(*) as count FROM assessments 
       WHERE audio_generation = 1 AND video_stitch = 0 AND avatar_name = ?`,
      [BLUSANTA_CONFIG.avatarName],
      async (err, rows) => {
        if (err) {
          console.error(
            `[BLUSANTA WORKER] DB error checking stitching:`,
            err.message
          );
          return resolve();
        }

        const count = rows[0]?.count || 0;
        if (count > 0) {
          console.log(
            `[BLUSANTA WORKER] 🎬 Found ${count} assessment(s) pending video stitching`
          );
          try {
            const response = await fetch(
              `${BASE_URL}/api/blusanta/initiate-video-stitching`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
              }
            );

            if (response.ok) {
              const result = await response.json();
              console.log(
                `[BLUSANTA WORKER] ✅ Video stitching triggered:`,
                result.message
              );
            } else {
              console.error(
                `[BLUSANTA WORKER] ❌ Stitching trigger failed:`,
                response.statusText
              );
            }
          } catch (error) {
            console.error(
              `[BLUSANTA WORKER] ❌ Error triggering stitching:`,
              error.message
            );
          }
        }

        resolve();
      }
    );
  });
}

/**
 * Main worker loop
 */
async function runWorker() {
  console.log(
    `[BLUSANTA WORKER] 🔍 Checking for pending assessments at ${new Date().toISOString()}`
  );

  try {
    await checkAudioGeneration();
    await checkVideoStitching();
  } catch (error) {
    console.error(`[BLUSANTA WORKER] ❌ Error in worker loop:`, error.message);
  }

  // Schedule next check
  setTimeout(runWorker, POLL_INTERVAL);
}

// Start the worker
runWorker();

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log(`\n[BLUSANTA WORKER] 🛑 Shutting down worker...`);
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log(`\n[BLUSANTA WORKER] 🛑 Shutting down worker...`);
  process.exit(0);
});
