const express = require("express");
const { Storage } = require("@google-cloud/storage");
const router = express.Router();

// Initialize Google Cloud Storage
const storage = new Storage({
  projectId: process.env.GCP_PROJECT_ID,
  keyFilename: process.env.GCP_KEY_FILE,
});

const bucketName = process.env.GCS_BUCKET_NAME;
const bucket = storage.bucket(bucketName);

/**
 * Get a signed URL for uploading video files
 */
router.post("/get-signed-url", async (req, res) => {
  try {
    const { fileName, fileType } = req.body;

    if (!fileName || !fileType) {
      return res.status(400).json({ error: "Missing fileName or fileType" });
    }

    const file = bucket.file(fileName);

    // Generate a signed URL that expires after 15 minutes
    const [signedUrl] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType: fileType,
    });

    console.log(`[STORAGE] ✅ Generated signed URL for: ${fileName}`);

    res.json({ url: signedUrl });
  } catch (error) {
    console.error("[STORAGE] ❌ Error generating signed URL:", error);
    res.status(500).json({ error: "Failed to generate signed URL" });
  }
});

/**
 * Check if a file exists in GCS
 */
router.post("/check-file-exists", async (req, res) => {
  try {
    const { fileName } = req.body;

    if (!fileName) {
      return res.status(400).json({ error: "Missing fileName" });
    }

    const file = bucket.file(fileName);
    const [exists] = await file.exists();

    res.json({ exists: exists });
  } catch (error) {
    console.error("[STORAGE] ❌ Error checking file existence:", error);
    res.status(500).json({ error: "Failed to check file existence" });
  }
});

/**
 * Get file metadata
 */
router.post("/get-file-metadata", async (req, res) => {
  try {
    const { fileName } = req.body;

    if (!fileName) {
      return res.status(400).json({ error: "Missing fileName" });
    }

    const file = bucket.file(fileName);
    const [metadata] = await file.getMetadata();

    res.json({
      name: metadata.name,
      size: metadata.size,
      contentType: metadata.contentType,
      created: metadata.timeCreated,
      updated: metadata.updated,
    });
  } catch (error) {
    console.error("[STORAGE] ❌ Error getting file metadata:", error);
    res.status(500).json({ error: "Failed to get file metadata" });
  }
});

module.exports = router;
