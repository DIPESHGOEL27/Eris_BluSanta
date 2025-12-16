const express = require("express");
const fetch = require("node-fetch");
const db = require("../db/database");
const { sendWhatsAppTemplate } = require("../utils/gupshup");
const {
  ADMIN_PHONE,
  AI_SERVICE_AUTH_TOKEN,
  BLUSANTA_CONFIG,
  servers,
} = require("../utils/constants");
const { updateSheetByAssessmentId } = require("../utils/sheet");
const {
  getExternalIP,
  stopVMs,
  ensureVMsRunning,
  convertHttpUrlToGsUrl,
  validateGcsObjects,
  validateGcsObject,
} = require("../utils/gcp");
const {
  generateAndUploadNameAudio,
  checkElevenLabsQuota,
} = require("../utils/elevenlabs");
const { sentenceCaseName } = require("../utils");

const router = express.Router();
const commonPath = "/blusanta";

/**
 * ===========================================
 * BLUSANTA VIDEO GENERATION PIPELINE
 * ===========================================
 *
 * VIDEO SEQUENCE (9 parts):
 * 1. 1_Const_Intro.mp4              - Constant intro
 * 2. 2_Doctor_Placeholder.mp4       - Placeholder (audio replaced by ElevenLabs "Doctor [Name]")
 * 3. 3_Const_Question_1.mp4         - Constant question 1
 * 4. 4_Blusanta_Noding.mp4          - Nodding (duration = Doctor response 1)
 * 5. 5_Const_Question_2.mp4         - Constant question 2
 * 6. 6_Blusanta_Noding.mp4          - Nodding (duration = Doctor response 2)
 * 7. 7_Const_Blusanta_Thank you.mp4 - Constant thank you
 * 8. 8_Doctor_Plc_Blusanta_Thank you.mp4 - Placeholder (audio replaced by SAME ElevenLabs audio)
 * 9. 9_Const_outro_Blusanta_Thank you.mp4 - Constant outro
 *
 * KEY DIFFERENCES FROM BHAGYASHREE:
 * 1. NO MUSETALK VM - Uses pre-recorded constant/placeholder videos
 * 2. ELEVENLABS TTS - Generates ONE audio "Doctor [Name]" used in BOTH placeholders
 * 3. 2 DOCTOR VIDEOS - Only 2 response videos from doctor (not 4)
 * 4. AUDIO OVERLAY - Both placeholder videos get their audio replaced by SAME ElevenLabs audio
 * 5. NODDING TRIM - Nodding videos trimmed to match doctor video duration
 *
 * PIPELINE STAGES:
 * 1. Audio Generation: ElevenLabs generates "Doctor [Name]" audio
 * 2. Video Stitching: Combines 9 video parts with audio overlays (same audio for both placeholders)
 */

/**
 * Global lock to prevent parallel audio generation
 */
let audioGenerationInProgress = false;

/**
 * BluSanta Audio Generation Endpoint
 * Generates ONE audio file using ElevenLabs:
 * - "Doctor [Name]" - Used for BOTH Part 2 and Part 8 placeholder videos
 */
router.post(`${commonPath}/initiate-audio-generation`, async (req, res) => {
  // Check if audio generation is already in progress
  if (audioGenerationInProgress) {
    console.log("[BLUSANTA] ⚠️ Audio generation already in progress, skipping");
    return res.status(200).json({
      message: "Audio generation already in progress",
    });
  }

  // Set lock
  audioGenerationInProgress = true;
  console.log("[BLUSANTA] 🔒 Audio generation lock acquired");

  const { language } = req.body;
  console.log(
    `[BLUSANTA] 🎤 Initiating audio generation at ${new Date().toISOString()}`
  );

  // Query for pending assessments
  let queryBase = `SELECT * FROM assessments WHERE audio_generation = 0 AND avatar_name = ?`;
  const queryParams = [BLUSANTA_CONFIG.avatarName];

  if (language) {
    queryBase += ` AND video_language = ?`;
    queryParams.push(language);
  }

  queryBase += ` ORDER BY created_at ASC`;

  db.all(queryBase, queryParams, async (err, rows) => {
    if (err) {
      console.error("[BLUSANTA] ❌ DB error:", err.message);
      audioGenerationInProgress = false;
      return res.status(500).json({ message: "Database error" });
    }

    if (!rows.length) {
      console.log("[BLUSANTA] ℹ️ No assessments pending audio generation");
      audioGenerationInProgress = false;
      return res.status(200).json({ message: "No pending assessments." });
    }

    res.status(200).json({
      message: `Processing ${rows.length} assessments for audio generation.`,
    });

    // Check ElevenLabs quota before processing (need 1 audio file per assessment)
    try {
      const quota = await checkElevenLabsQuota();
      console.log(
        `[BLUSANTA] 📊 ElevenLabs quota: ${quota.remainingCharacters} characters remaining`
      );

      // Estimate ~50 characters per audio (just "Doctor [Name]") * 1 audio file per assessment
      if (quota.remainingCharacters < rows.length * 50) {
        console.error("[BLUSANTA] ❌ Insufficient ElevenLabs quota");
        audioGenerationInProgress = false;
        return;
      }
    } catch (quotaError) {
      console.error(
        "[BLUSANTA] ⚠️ Could not check ElevenLabs quota:",
        quotaError.message
      );
      // Continue anyway - will fail on individual requests if quota is exceeded
    }

    console.log(
      `[BLUSANTA] ✅ Found ${rows.length} assessment(s) pending audio generation`
    );

    // Process each assessment
    for (let index = 0; index < rows.length; index++) {
      const assessment = rows[index];
      const {
        id,
        employee_code,
        video_language,
        dr_code,
        dr_first_name,
        dr_last_name,
        name_pronunciation,
      } = assessment;

      console.log(
        `[BLUSANTA] 🎤 Processing ${index + 1}/${rows.length} - ID: ${id}`
      );

      try {
        // Use user-provided pronunciation, or fall back to name
        const pronunciationText =
          name_pronunciation ||
          `${sentenceCaseName(dr_first_name)} ${sentenceCaseName(
            dr_last_name
          )}`;

        console.log(
          `[BLUSANTA] 🎤 Generating audio file for: "Doctor ${pronunciationText}"`
        );

        // Generate TWO audio files using ElevenLabs:
        // 1. "Doctor <first name>" for plc_000.mp4 (segment 1)
        // 2. "Thank you Doctor <first name>" for plc_001.mp4 (segment 6)
        const audioUrls = await generateAndUploadNameAudio({
          namePronunciation: pronunciationText,
          employeeCode: employee_code,
          drCode: dr_code,
          language: video_language,
        });

        console.log(`[BLUSANTA] ✅ Greeting audio: ${audioUrls.greetingUrl}`);
        console.log(`[BLUSANTA] ✅ Thank you audio: ${audioUrls.thankYouUrl}`);

        // Update database - mark audio generation complete
        db.run(
          `UPDATE assessments SET audio_generation = 1 WHERE id = ?`,
          [id],
          (updateErr) => {
            if (updateErr) {
              console.error(
                `[BLUSANTA] ❌ DB error updating ID ${id}:`,
                updateErr.message
              );
            } else {
              console.log(`[BLUSANTA] ✅ Marked audio complete for ID ${id}`);
            }
          }
        );

        // Small delay between requests to avoid rate limiting
        if (index < rows.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(
          `[BLUSANTA] ❌ Error generating audio for ID ${id}:`,
          error.message
        );

        // Update DB to mark as failed
        db.run(
          `UPDATE assessments SET audio_generation = -1, error_message = ? WHERE id = ?`,
          [`Audio generation failed: ${error.message}`, id],
          (err) => {
            if (err) console.error(`[BLUSANTA] ❌ DB error:`, err.message);
          }
        );
      }
    }

    // Trigger video stitching after all audio is generated
    console.log(
      "[BLUSANTA] 🎬 Audio generation complete, triggering stitching..."
    );

    try {
      await fetch(
        `http://localhost:3001/api/blusanta/initiate-video-stitching`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ language }),
        }
      );
    } catch (triggerError) {
      console.error(
        "[BLUSANTA] ⚠️ Failed to trigger stitching:",
        triggerError.message
      );
    }

    audioGenerationInProgress = false;
    console.log("[BLUSANTA] 🔓 Audio generation lock released");
  });
});

/**
 * Stitching queue state management
 */
let stitchingQueueActive = false;
let currentStitchingAssessmentId = null;

/**
 * BluSanta Video Stitching Endpoint
 *
 * Combines 9 video parts:
 * - 7 constant/placeholder BluSanta videos
 * - 2 doctor response videos
 * - 2 ElevenLabs audio overlays (name + thank you)
 * - Nodding videos trimmed to match doctor video duration
 */
router.post(`${commonPath}/initiate-video-stitching`, async (req, res) => {
  const { language } = req.body;

  console.log(
    `[BLUSANTA] 🎬 Initiating video stitching at ${new Date().toISOString()}`
  );

  // Check if stitching queue is already active
  if (stitchingQueueActive) {
    console.log("[BLUSANTA] ℹ️ Stitching queue already active");
    return res.status(200).json({
      message: "Stitching queue already active",
      queue_active: true,
      current_assessment: currentStitchingAssessmentId,
    });
  }

  res.status(200).json({
    message: "Video stitching initiated, processing in background.",
  });

  // Start stitching servers
  console.log(`[BLUSANTA] 🟠 Ensuring stitching servers are running...`);
  await ensureVMsRunning(servers);

  let ips = await Promise.all(
    servers.map((server) => getExternalIP(server.zone, server.name))
  );
  console.log("[BLUSANTA] ✅ Stitching servers IPs:", ips);

  // Helper functions
  function dbAllAsync(query, params = []) {
    return new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  function dbGetAsync(query, params = []) {
    return new Promise((resolve, reject) => {
      db.get(query, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async function processVideoStitching() {
    stitchingQueueActive = true;
    console.log("[BLUSANTA] 🎬 Stitching queue activated - FIFO mode");

    try {
      while (true) {
        // Query for pending assessments
        const queryBase = `
          SELECT 
            assessments.*,
            json_group_array(
              json_object(
                'video_key', videos.video_key,
                'video_url', videos.video_url
              )
            ) AS videos
          FROM assessments
          LEFT JOIN videos ON videos.assessment_id = assessments.id
          WHERE video_stitch = 0 AND audio_generation = 1 AND avatar_name = ?
          GROUP BY assessments.id
          ORDER BY assessments.created_at ASC
        `;

        let rows;
        try {
          rows = await dbAllAsync(queryBase, [BLUSANTA_CONFIG.avatarName]);
        } catch (err) {
          console.error("[BLUSANTA] ❌ DB error:", err.message);
          break;
        }

        if (!rows.length) {
          console.log("[BLUSANTA] ℹ️ No assessments pending stitching");
          break;
        }

        // Parse videos JSON
        rows.forEach((row) => {
          try {
            const videosArr = JSON.parse(row.videos);
            row.videos = {};
            videosArr.forEach((v) => {
              if (v.video_key && v.video_url) {
                row.videos[v.video_key] = v.video_url;
              }
            });
          } catch {
            row.videos = {};
          }
        });

        console.log(`[BLUSANTA] 🟠 Found ${rows.length} assessments in queue`);

        // Check for free stitching server
        const freeIps = await Promise.all(
          ips.map(async (ip) => {
            try {
              const response = await fetch(`http://${ip}:8080/status`, {
                method: "GET",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${AI_SERVICE_AUTH_TOKEN}`,
                },
              });
              const data = await response.json();
              const parsedData =
                typeof data === "string" ? JSON.parse(data) : data;
              return parsedData?.status === "free" ? ip : null;
            } catch (error) {
              console.error(
                `[BLUSANTA] Error checking server ${ip}:`,
                error.message
              );
              return null;
            }
          })
        );

        const availableIps = freeIps.filter((ip) => ip !== null);

        if (!availableIps.length) {
          console.log("[BLUSANTA] ⚠️ No free stitching servers, waiting...");
          await ensureVMsRunning(servers);
          ips = await Promise.all(
            servers.map((server) => getExternalIP(server.zone, server.name))
          );
          await new Promise((resolve) => setTimeout(resolve, 2 * 60 * 1000));
          continue;
        }

        // Process first assessment in queue (FIFO)
        const assessment = rows[0];
        const {
          id,
          employee_code,
          video_language,
          dr_code,
          dr_first_name,
          dr_last_name,
          videos,
        } = assessment;

        currentStitchingAssessmentId = id;
        console.log(
          `[BLUSANTA] 🎬 Processing ID: ${id} (${employee_code}/${dr_code})`
        );

        const ip = availableIps[0];

        // Get GCS paths for the TWO ElevenLabs audio files
        const langFolder = video_language === "Hindi" ? "hindi" : "english";
        const greetingAudioPath = `gs://${BLUSANTA_CONFIG.gcs.bucket}/blusanta/audio/names/${langFolder}/${employee_code}_${dr_code}_greeting.mp3`;
        const thankYouAudioPath = `gs://${BLUSANTA_CONFIG.gcs.bucket}/blusanta/audio/names/${langFolder}/${employee_code}_${dr_code}_thankyou.mp3`;

        // Get doctor video URLs (only 2 videos now)
        const drVideo1Url = convertHttpUrlToGsUrl(videos.video1).replace(
          / /g,
          "%20"
        );
        const drVideo2Url = convertHttpUrlToGsUrl(videos.video2).replace(
          / /g,
          "%20"
        );

        // Validate all required files exist
        console.log(`[BLUSANTA] 🔍 Validating assets for ID ${id}...`);

        const filesToValidate = [
          greetingAudioPath, // "Doctor <first name>" audio for plc_000 (segment 1)
          thankYouAudioPath, // "Thank you Doctor <first name>" audio for plc_001 (segment 6)
          drVideo1Url, // Doctor response 1 (segment 3)
          drVideo2Url, // Doctor response 2 (segment 5)
        ];

        let validationResult;
        try {
          validationResult = await validateGcsObjects(filesToValidate);
        } catch (validationError) {
          console.error(
            `[BLUSANTA] ❌ Validation error for ID ${id}:`,
            validationError.message
          );
          db.run(
            `UPDATE assessments SET video_stitch = -1, error_message = ? WHERE id = ?`,
            [`Validation failed: ${validationError.message}`, id]
          );
          currentStitchingAssessmentId = null;
          continue;
        }

        if (!validationResult.allValid) {
          const failedFiles = validationResult.results
            .filter((r) => !r.valid)
            .map((r) => `${r.url} - ${r.error}`)
            .join("; ");

          console.error(
            `[BLUSANTA] ❌ Validation failed for ID ${id}:`,
            failedFiles
          );
          db.run(
            `UPDATE assessments SET video_stitch = -1, error_message = ? WHERE id = ?`,
            [`Missing files: ${failedFiles}`, id]
          );
          currentStitchingAssessmentId = null;
          continue;
        }

        console.log(`[BLUSANTA] ✅ All files validated for ID ${id}`);

        // Get final video path
        const finalVideoGcsPath = `gs://${
          BLUSANTA_CONFIG.gcs.bucket
        }/${BLUSANTA_CONFIG.gcs.getFinalVideoPath(
          video_language,
          employee_code,
          dr_code
        )}`.replace(/ /g, "%20");

        const finalVideoHttpUrl = `https://storage.googleapis.com/${
          BLUSANTA_CONFIG.gcs.bucket
        }/${BLUSANTA_CONFIG.gcs.getFinalVideoPath(
          video_language,
          employee_code,
          dr_code
        )}`.replace(/ /g, "%20");

        /**
         * BUILD STITCHING PAYLOAD
         * Using the helper function from constants.js
         * TWO different audio files for TWO different placeholders
         */
        const stitchingData = BLUSANTA_CONFIG.stitching.buildStitchingPayload({
          language: video_language,
          drFirstName: dr_first_name,
          drLastName: dr_last_name,
          greetingAudioUrl: greetingAudioPath, // "Doctor <first name>" for segment 1
          thankYouAudioUrl: thankYouAudioPath, // "Thank you Doctor <first name>" for segment 6
          drVideo1Url: drVideo1Url,
          drVideo2Url: drVideo2Url,
          finalUploadPath: finalVideoGcsPath,
          webhookUrl: `http://${BLUSANTA_CONFIG.backendVm.externalIP}:${BLUSANTA_CONFIG.backendVm.backendPort}/api/blusanta/update-after-stitching`,
          additionalData: {
            id: id,
            final_video_url: finalVideoHttpUrl,
            drFirstName: dr_first_name,
            drLastName: dr_last_name,
          },
        });

        console.log(
          `[BLUSANTA] 🟠 Sending stitching request for ID ${id} to ${ip}`
        );
        console.log(
          "[BLUSANTA] Stitching data:",
          JSON.stringify(stitchingData, null, 2)
        );

        try {
          const response = await fetch(`http://${ip}:8080/stitching`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${AI_SERVICE_AUTH_TOKEN}`,
            },
            body: JSON.stringify(stitchingData),
          });

          if (!response.ok) {
            console.error(
              `[BLUSANTA] ❌ Stitching request failed: ${response.statusText}`
            );
            await new Promise((resolve) => setTimeout(resolve, 30 * 1000));
            continue;
          }

          const result = await response.json();
          console.log(
            `[BLUSANTA] ✅ Stitching request sent for ID ${id}:`,
            result
          );

          // Wait for completion (poll database)
          console.log(`[BLUSANTA] ⏳ Waiting for stitching completion...`);

          let stitchComplete = false;
          let maxWaitMinutes = 40;
          let waitedSeconds = 0;

          while (!stitchComplete && waitedSeconds < maxWaitMinutes * 60) {
            await new Promise((resolve) => setTimeout(resolve, 10 * 1000));
            waitedSeconds += 10;

            try {
              const row = await dbGetAsync(
                `SELECT video_stitch FROM assessments WHERE id = ?`,
                [id]
              );

              if (row && row.video_stitch === 1) {
                stitchComplete = true;
                console.log(`[BLUSANTA] ✅ ID ${id} stitching completed!`);
                currentStitchingAssessmentId = null;
                break;
              }

              // Check if server returned to free (indicating failure)
              if (waitedSeconds % 30 === 0 && waitedSeconds > 60) {
                try {
                  const statusResponse = await fetch(
                    `http://${ip}:8080/status`,
                    {
                      headers: {
                        Authorization: `Bearer ${AI_SERVICE_AUTH_TOKEN}`,
                      },
                    }
                  );
                  const statusData = await statusResponse.json();

                  if (statusData.status === "free") {
                    console.error(
                      `[BLUSANTA] ❌ Server free but stitch incomplete for ID ${id}`
                    );
                    currentStitchingAssessmentId = null;
                    break;
                  }
                } catch (statusErr) {
                  // Continue waiting
                }
              }

              console.log(
                `[BLUSANTA] ⏳ Waiting for ID ${id} (${waitedSeconds}s)...`
              );
            } catch (dbErr) {
              console.error(`[BLUSANTA] ❌ DB error:`, dbErr.message);
            }
          }

          if (!stitchComplete) {
            console.error(
              `[BLUSANTA] ⚠️ ID ${id} timed out after ${maxWaitMinutes} minutes`
            );
            db.run(
              `UPDATE assessments SET video_stitch = -1, error_message = ? WHERE id = ?`,
              [`Stitching timeout after ${maxWaitMinutes} minutes`, id]
            );
            currentStitchingAssessmentId = null;
          }
        } catch (error) {
          console.error(
            `[BLUSANTA] ❌ Error stitching ID ${id}:`,
            error.message
          );
          await new Promise((resolve) => setTimeout(resolve, 30 * 1000));
        }

        // Brief pause before next
        await new Promise((resolve) => setTimeout(resolve, 5 * 1000));
      }
    } catch (error) {
      console.error("[BLUSANTA] ❌ Fatal error in stitching queue:", error);
    } finally {
      stitchingQueueActive = false;
      currentStitchingAssessmentId = null;
      console.log("[BLUSANTA] 🛑 Stitching queue deactivated");
    }
  }

  processVideoStitching();
});

/**
 * Update After Stitching Endpoint
 * Called by webhook from stitching service
 */
router.post(`${commonPath}/update-after-stitching`, async (req, res) => {
  const { additional_data } = req.body;
  const { id, final_video_url } = additional_data || {};

  console.log(`[BLUSANTA] Received stitching completion for ID: ${id}`);
  console.log(`[BLUSANTA] Final video URL: ${final_video_url}`);

  if (!id || !final_video_url) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: id or final_video_url",
    });
  }

  res.status(200).json({
    success: true,
    message: "Stitching completion acknowledged",
  });

  try {
    const timestamp = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
    });

    db.run(
      `UPDATE assessments SET final_video_url = ?, video_stitch = 1, video_generated_on = ? WHERE id = ?`,
      [final_video_url, timestamp, id],
      async (err) => {
        if (err) {
          console.error(`[BLUSANTA] ❌ DB error for ID ${id}:`, err.message);
          return;
        }

        console.log(
          `[BLUSANTA] ✅ Updated final_video_url for ID ${id} at ${timestamp}`
        );

        // Check if this is a regenerated video
        db.get(
          `SELECT is_regenerated FROM assessments WHERE id = ?`,
          [id],
          async (getErr, assessment) => {
            if (getErr) {
              console.error(
                `[BLUSANTA] ⚠️ Error checking regeneration status:`,
                getErr.message
              );
            }

            // Update Google Sheet
            try {
              const sheetUpdates = {
                final_video_url: final_video_url,
                video_generated_on: timestamp,
              };

              // If this is a regenerated video, mark "Regenerated?" as "Yes"
              if (assessment && assessment.is_regenerated === 1) {
                sheetUpdates.regenerated = "Yes";
                console.log(
                  `[BLUSANTA] ℹ️ This is a regenerated video for ID ${id}`
                );
              }

              await updateSheetByAssessmentId(id, sheetUpdates);

              console.log(`[BLUSANTA] ✅ Sheet updated for ID ${id}`);
            } catch (sheetError) {
              console.error(
                `[BLUSANTA] ⚠️ Sheet update failed:`,
                sheetError.message
              );
            }
          }
        );

        // NOTE: WhatsApp notification is now sent after QC approval via Google Sheets
        // The QC team will review the video and update the "Status" column to "Approved"
        // which triggers the QC automation script to send the WhatsApp notification

        /* COMMENTED OUT - WhatsApp now sent via QC approval workflow
        // Send WhatsApp notification to MR with video link
        try {
          const assessment = await new Promise((resolve, reject) => {
            db.get(
              `SELECT employee_name, employee_mobile, dr_first_name, dr_last_name, dr_code FROM assessments WHERE id = ?`,
              [id],
              (err, row) => {
                if (err) reject(err);
                else resolve(row);
              }
            );
          });

          if (assessment) {
            await sendWhatsAppTemplate({
              templateId: process.env.GUPSHUP_VIDEO_READY_TEMPLATE_ID,
              destinationNumber: assessment.employee_mobile,
              params: [
                assessment.employee_name,
                `${assessment.dr_first_name} ${assessment.dr_last_name}`,
                assessment.dr_code,
                final_video_url,
              ],
            });

            console.log(
              `[BLUSANTA] ✅ Sent video ready WhatsApp to ${assessment.employee_name} at ${assessment.employee_mobile}`
            );
          }
        } catch (waError) {
          console.error(
            `[BLUSANTA] ⚠️ Failed to send WhatsApp notification:`,
            waError.message
          );
        }
        */

        console.log(
          `[BLUSANTA] ℹ️ Video ready for QC review. WhatsApp will be sent after QC approval in Google Sheet.`
        );
      }
    );
  } catch (error) {
    console.error(
      `[BLUSANTA] ❌ Error updating after stitching:`,
      error.message
    );
  }
});

/**
 * QC Approval/Regeneration Endpoint
 * Called by Google Apps Script when QC status is updated
 */
router.post(`${commonPath}/qc-approved-wa`, async (req, res) => {
  const { _id, video_url, status, hindi_pronunciation, reason_for_reupload } =
    req.body;

  console.log(`[BLUSANTA QC] Received QC ${status} for ID: ${_id}`);
  console.log(`[BLUSANTA QC] Video URL: ${video_url}`);
  console.log(
    `[BLUSANTA QC] Hindi Pronunciation: ${hindi_pronunciation || "N/A"}`
  );
  console.log(
    `[BLUSANTA QC] Reason for Re-upload: ${reason_for_reupload || "N/A"}`
  );

  if (!_id || !video_url || !status) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: _id, video_url, or status",
    });
  }

  if (
    status !== "Approved" &&
    status !== "Regenerate" &&
    status !== "Re-upload"
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Invalid status. Must be 'Approved', 'Regenerate', or 'Re-upload'",
    });
  }

  try {
    db.get(
      `SELECT * FROM assessments WHERE id = ?`,
      [_id],
      async (err, assessment) => {
        if (err || !assessment) {
          console.error(
            `[BLUSANTA QC] ❌ Assessment ID ${_id} not found or DB error`
          );
          return res.status(404).json({
            success: false,
            message: "Assessment not found",
          });
        }

        const {
          employee_name,
          employee_mobile,
          dr_first_name,
          dr_last_name,
          dr_code,
        } = assessment;

        if (status === "Approved") {
          // Send WhatsApp notification with video ready template
          await sendWhatsAppTemplate({
            templateId: process.env.GUPSHUP_VIDEO_READY_TEMPLATE_ID,
            destinationNumber: employee_mobile,
            params: [
              employee_name,
              `${dr_first_name} ${dr_last_name}`,
              dr_code,
              video_url,
            ],
          });

          console.log(
            `[BLUSANTA QC] ✅ Approval WhatsApp sent to ${employee_name} at ${employee_mobile}`
          );

          res.status(200).json({
            success: true,
            message: `Video approved. WhatsApp sent to ${employee_name}`,
          });
        } else if (status === "Regenerate") {
          // Update assessment with hindi_pronunciation override and reset flags
          const updatedPronunciation =
            hindi_pronunciation || assessment.name_pronunciation;

          db.run(
            `UPDATE assessments SET 
            audio_generation = 0, 
            video_stitch = 0, 
            final_video_url = NULL, 
            is_regenerated = 1, 
            name_pronunciation = ? 
          WHERE id = ?`,
            [updatedPronunciation, _id],
            async (updateErr) => {
              if (updateErr) {
                console.error(
                  `[BLUSANTA QC] ❌ DB error while resetting assessment ID ${_id}:`,
                  updateErr.message
                );
                return res.status(500).json({
                  success: false,
                  message: "Error resetting assessment for regeneration",
                });
              }

              console.log(
                `[BLUSANTA QC] ✅ ID ${_id} marked for regeneration with pronunciation: ${updatedPronunciation}`
              );

              // Update Google Sheet to mark regenerated = "Yes"
              try {
                await updateSheetByAssessmentId(_id, {
                  regenerated: "Yes",
                });
                console.log(
                  `[BLUSANTA QC] ✅ Sheet updated: Regenerated? = Yes for ID ${_id}`
                );
              } catch (sheetErr) {
                console.error(
                  `[BLUSANTA QC] ⚠️ Failed to update sheet for ID ${_id}:`,
                  sheetErr.message
                );
              }

              res.status(200).json({
                success: true,
                message: `Video marked for regeneration with pronunciation: ${updatedPronunciation}`,
              });
            }
          );
        } else if (status === "Re-upload") {
          // Send re-upload WhatsApp message with reason
          if (!reason_for_reupload) {
            return res.status(400).json({
              success: false,
              message:
                "Reason for re-upload is required when status is 'Re-upload'",
            });
          }

          await sendWhatsAppTemplate({
            templateId: process.env.GUPSHUP_VIDEO_REUPLOAD_TEMPLATE_ID,
            destinationNumber: employee_mobile,
            params: [
              employee_name, // {{1}} - Employee name (Hi {{1}})
              dr_code, // {{2}} - Doctor Code
              `${dr_first_name} ${dr_last_name}`, // {{3}} - Doctor Name
              reason_for_reupload, // {{4}} - Reason for re-upload
            ],
          });

          console.log(
            `[BLUSANTA QC] ✅ Re-upload WhatsApp sent to ${employee_name} at ${employee_mobile} with reason: ${reason_for_reupload}`
          );

          res.status(200).json({
            success: true,
            message: `Re-upload notification sent to ${employee_name}`,
          });
        }
      }
    );
  } catch (error) {
    console.error(`[BLUSANTA QC] ❌ Error:`, error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

/**
 * Retry Pending Assessments Endpoint
 * Can be called periodically (via cron) to retry stuck assessments
 */
router.post(`${commonPath}/retry-pending-assessments`, async (req, res) => {
  console.log(
    `[BLUSANTA RETRY] Checking for pending assessments at ${new Date().toISOString()}`
  );

  res.status(200).json({
    message: "Retry process initiated",
  });

  try {
    // Check for pending audio generation
    db.all(
      `SELECT COUNT(*) as count FROM assessments WHERE audio_generation = 0 AND avatar_name = ?`,
      [BLUSANTA_CONFIG.avatarName],
      async (err, rows) => {
        if (!err && rows[0].count > 0) {
          console.log(
            `[BLUSANTA RETRY] Found ${rows[0].count} pending audio generation`
          );
          try {
            await fetch(
              `http://localhost:3001/api/blusanta/initiate-audio-generation`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
              }
            );
          } catch (error) {
            console.error(
              `[BLUSANTA RETRY] Error triggering audio:`,
              error.message
            );
          }
        }
      }
    );

    // Check for pending stitching
    db.all(
      `SELECT COUNT(*) as count FROM assessments WHERE audio_generation = 1 AND video_stitch = 0 AND avatar_name = ?`,
      [BLUSANTA_CONFIG.avatarName],
      async (err, rows) => {
        if (!err && rows[0].count > 0) {
          console.log(
            `[BLUSANTA RETRY] Found ${rows[0].count} pending stitching`
          );
          try {
            await fetch(
              `http://localhost:3001/api/blusanta/initiate-video-stitching`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
              }
            );
          } catch (error) {
            console.error(
              `[BLUSANTA RETRY] Error triggering stitching:`,
              error.message
            );
          }
        }
      }
    );
  } catch (error) {
    console.error(`[BLUSANTA RETRY] Error:`, error.message);
  }
});

/**
 * ElevenLabs API Test Endpoint
 */
router.get(`${commonPath}/test-elevenlabs`, async (req, res) => {
  try {
    const quota = await checkElevenLabsQuota();
    res.status(200).json({
      success: true,
      message: "ElevenLabs API is configured",
      quota: quota,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "ElevenLabs API error",
      error: error.message,
    });
  }
});

module.exports = router;
