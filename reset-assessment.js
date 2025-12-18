// Quick script to reset assessment for re-stitching
const Database = require("./backend/db/database");
const db = new Database();

const assessmentId = process.argv[2] || 1;

db.run(
  `UPDATE assessments SET video_stitch = 0, final_video_url = NULL WHERE id = ?`,
  [assessmentId],
  (err) => {
    if (err) {
      console.error("Error:", err);
    } else {
      console.log(`✅ Reset assessment ${assessmentId} - ready for stitching`);
    }
    db.close();
  }
);
