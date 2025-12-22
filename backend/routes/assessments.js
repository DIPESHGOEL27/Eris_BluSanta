const express = require("express");
const router = express.Router();
const db = require("../db/database");
const fetch = require("node-fetch");
const { isGCSFileExists, runQuery, getQuery } = require("../utils");
const { sendWhatsAppTemplate } = require("../utils/gupshup");
const { addRowToSheet } = require("../utils/sheet");
const { BLUSANTA_CONFIG } = require("../utils/constants");

/**
 * BluSanta Assessment Submission Endpoint
 *
 * Receives assessment form data from frontend including:
 * - Employee info (code, name, mobile)
 * - Doctor info (code, first name, last name, mobile)
 * - Name pronunciation (user input for how to pronounce the doctor's name)
 * - Video language
 * - 4 video URLs
 */
router.post("/submit-assessment", async (req, res) => {
  try {
    let {
      employeeCode,
      employeeName,
      employeeMobile,
      drCode,
      drFirstName,
      drLastName,
      drMobile,
      videoLanguage,
      namePronunciation, // NEW: User-provided pronunciation for the name
      videos,
    } = req.body;

    // Trim whitespace to avoid dirty data causing bad filenames/keys
    employeeCode = (employeeCode || "").trim();
    drCode = (drCode || "").trim();
    employeeName = (employeeName || "").trim();
    drFirstName = (drFirstName || "").trim();
    drLastName = (drLastName || "").trim();
    namePronunciation = (namePronunciation || "").trim();

    console.log(`[BLUSANTA] 📥 Received assessment submission:`);
    console.log(`  Employee: ${employeeCode} - ${employeeName}`);
    console.log(`  Doctor: ${drCode} - Dr. ${drFirstName} ${drLastName}`);
    console.log(`  Language: ${videoLanguage}`);
    console.log(`  Name Pronunciation: ${namePronunciation || "Not provided"}`);

    // Validate videos - should be exactly 2
    if (!videos || Object.keys(videos).length !== 2) {
      console.log(
        `[BLUSANTA] ❌ Invalid video submission - expected 2 videos, got ${
          videos ? Object.keys(videos).length : 0
        }`
      );

      await sendWhatsAppTemplate({
        templateId: process.env.GUPSHUP_VIDEO_UPLOAD_FAILURE_TEMPLATE_ID,
        destinationNumber: employeeMobile,
        params: [employeeName, `${drFirstName} ${drLastName}`, drCode],
      });

      return res.status(400).json({
        success: false,
        message:
          "All fields are required and exactly 2 videos must be provided.",
      });
    }

    // Validate name pronunciation is provided
    if (!namePronunciation || namePronunciation.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Name pronunciation is required for audio generation.",
      });
    }

    // Check all video URLs exist in GCS
    for (const [key, url] of Object.entries(videos)) {
      console.log(`[BLUSANTA] 🔍 Checking video ${key}: ${url}`);
      const exists = await isGCSFileExists(url);

      if (!exists) {
        await sendWhatsAppTemplate({
          templateId: process.env.GUPSHUP_VIDEO_UPLOAD_FAILURE_TEMPLATE_ID,
          destinationNumber: employeeMobile,
          params: [employeeName, `${drFirstName} ${drLastName}`, drCode],
        });

        return res.status(400).json({
          success: false,
          message: `Video for key "${key}" not found in Google Cloud Storage.`,
          missingKey: key,
          missingUrl: url,
        });
      }
    }

    // Check if dr_code already exists (for update vs insert)
    const existingAssessment = await new Promise((resolve, reject) => {
      db.get(
        `SELECT id FROM assessments WHERE dr_code = ?`,
        [drCode],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    let assessmentId;

    if (existingAssessment && existingAssessment.id) {
      // Update existing assessment
      console.log(
        `[BLUSANTA] 🔄 Updating existing assessment ID: ${existingAssessment.id}`
      );

      const updateQuery = `
        UPDATE assessments SET
          employee_code = ?, 
          employee_name = ?, 
          employee_mobile = ?, 
          dr_first_name = ?, 
          dr_last_name = ?, 
          dr_mobile = ?, 
          video_language = ?,
          name_pronunciation = ?,
          avatar_name = 'blusanta',
          audio_generation = 0,
          video_generation = 0,
          video_stitch = 0,
          final_video_url = NULL,
          error_message = NULL,
          created_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      await new Promise((resolve, reject) => {
        db.run(
          updateQuery,
          [
            employeeCode,
            employeeName,
            employeeMobile,
            drFirstName,
            drLastName,
            drMobile,
            videoLanguage,
            namePronunciation,
            existingAssessment.id,
          ],
          function (err) {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      assessmentId = existingAssessment.id;

      // Delete existing video records
      await new Promise((resolve, reject) => {
        db.run(
          `DELETE FROM videos WHERE assessment_id = ?`,
          [assessmentId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    } else {
      // Insert new assessment
      console.log(`[BLUSANTA] ➕ Creating new assessment`);

      const insertQuery = `
        INSERT INTO assessments (
          employee_code, 
          employee_name, 
          employee_mobile, 
          dr_code, 
          dr_first_name, 
          dr_last_name, 
          dr_mobile, 
          video_language,
          name_pronunciation,
          avatar_name,
          audio_generation,
          video_generation,
          video_stitch
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const result = await new Promise((resolve, reject) => {
        db.run(
          insertQuery,
          [
            employeeCode,
            employeeName,
            employeeMobile,
            drCode,
            drFirstName,
            drLastName,
            drMobile,
            videoLanguage,
            namePronunciation,
            "blusanta",
            0,
            0,
            0,
          ],
          function (err) {
            if (err) reject(err);
            else resolve({ id: this.lastID });
          }
        );
      });

      assessmentId = result.id;
    }

    // Insert video records
    for (const [key, url] of Object.entries(videos)) {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO videos (assessment_id, video_key, video_url) VALUES (?, ?, ?)`,
          [assessmentId, key, url],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }

    // Add row to Google Sheet for tracking
    // Only populate columns A-O (ID through Video Generated on)
    // Columns P-T (Status, Reason, Hindi Pronunciation, Regenerated, Comments) are for QC team
    const sheetData = [
      assessmentId,
      videoLanguage,
      "blusanta",
      employeeCode,
      employeeName,
      employeeMobile,
      drCode,
      drFirstName,
      drLastName,
      drMobile,
      videos.video1 || "",
      videos.video2 || "",
      new Date().toISOString(),
      "", // final_video_url (Column N) - will be updated when video completes
      "", // video_generated_on (Column O) - will be updated when video completes
    ];

    try {
      await addRowToSheet(sheetData);
      console.log(
        `[BLUSANTA] ✅ Added assessment ${assessmentId} to Google Sheet`
      );
    } catch (sheetError) {
      console.error(
        `[BLUSANTA] ⚠️ Failed to add to sheet:`,
        sheetError.message
      );
      // Continue even if sheet update fails
    }

    // Send WhatsApp notification for successful upload
    try {
      await sendWhatsAppTemplate({
        templateId: process.env.GUPSHUP_VIDEO_UPLOAD_SUCCESS_TEMPLATE_ID,
        destinationNumber: employeeMobile,
        params: [employeeName, `${drFirstName} ${drLastName}`, drCode],
      });
      console.log(
        `[BLUSANTA] ✅ Sent upload success WhatsApp to ${employeeName}`
      );
    } catch (waError) {
      console.error(`[BLUSANTA] ⚠️ Failed to send WhatsApp:`, waError.message);
      // Don't fail the submission if WhatsApp fails
    }

    console.log(`[BLUSANTA] ✅ Assessment ${assessmentId} saved successfully`);

    res.status(200).json({
      success: true,
      message: "Assessment submitted successfully",
      assessmentId: assessmentId,
    });

    // Auto-trigger audio generation in the background (non-blocking)
    console.log(
      `[AUTO-TRIGGER] Initiating audio generation for assessment ${assessmentId} (Language: ${videoLanguage})`
    );

    // Call the audio generation endpoint asynchronously
    try {
      const audioGenResponse = await fetch(
        `http://localhost:${
          process.env.PORT || 3001
        }/api/blusanta/initiate-audio-generation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            language: videoLanguage,
          }),
        }
      );

      if (audioGenResponse.ok) {
        const result = await audioGenResponse.json();
        console.log(
          `[AUTO-TRIGGER] ✅ Audio generation triggered successfully:`,
          result.message
        );
      } else {
        const errorText = await audioGenResponse.text();
        console.error(
          `[AUTO-TRIGGER] ❌ Failed to trigger audio generation: ${audioGenResponse.status} ${audioGenResponse.statusText}`,
          errorText
        );
      }
    } catch (triggerError) {
      console.error(
        `[AUTO-TRIGGER] ❌ Error triggering audio generation:`,
        triggerError.message
      );
    }
  } catch (error) {
    console.error("[BLUSANTA] ❌ Error submitting assessment:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

/**
 * Get assessment by ID
 */
router.get("/assessment/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const assessment = await new Promise((resolve, reject) => {
      db.get(`SELECT * FROM assessments WHERE id = ?`, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!assessment) {
      return res.status(404).json({
        success: false,
        message: "Assessment not found",
      });
    }

    // Get associated videos
    const videos = await new Promise((resolve, reject) => {
      db.all(
        `SELECT video_key, video_url FROM videos WHERE assessment_id = ?`,
        [id],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    assessment.videos = {};
    videos.forEach((v) => {
      assessment.videos[v.video_key] = v.video_url;
    });

    res.status(200).json({
      success: true,
      assessment: assessment,
    });
  } catch (error) {
    console.error("[BLUSANTA] Error fetching assessment:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

/**
 * List all assessments
 */
router.get("/assessments", async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let query = `SELECT * FROM assessments WHERE avatar_name = 'blusanta'`;
    const params = [];

    if (status === "pending") {
      query += ` AND video_stitch = 0`;
    } else if (status === "completed") {
      query += ` AND video_stitch = 1`;
    } else if (status === "failed") {
      query += ` AND video_stitch = -1`;
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const assessments = await new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    res.status(200).json({
      success: true,
      count: assessments.length,
      assessments: assessments,
    });
  } catch (error) {
    console.error("[BLUSANTA] Error fetching assessments:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

module.exports = router;
