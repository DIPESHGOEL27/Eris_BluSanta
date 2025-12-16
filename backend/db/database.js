const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const dataDir = path.resolve(__dirname, "../data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Create a new database or connect to an existing one
const dbName = process.env.DB_NAME || "blusanta_assessments.db";
const dbPath = path.resolve(dataDir, dbName);
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error connecting to database:", err.message);
  } else {
    console.log(`Connected to the ${dbName} database.`);

    // Enable WAL mode for better concurrent access
    db.run(`PRAGMA journal_mode = WAL;`, (walErr) => {
      if (walErr) {
        console.error("Error enabling WAL mode:", walErr.message);
      } else {
        console.log("SQLite WAL mode enabled for better concurrency");
      }
    });

    // Reduce busy timeout and enable better read consistency
    db.run(`PRAGMA busy_timeout = 5000;`); // Wait up to 5 seconds if DB is locked
    db.run(`PRAGMA synchronous = NORMAL;`); // Balance between safety and performance

    // Create tables if they don't exist
    db.run(`
      CREATE TABLE IF NOT EXISTS assessments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_code TEXT NOT NULL,
        employee_name TEXT,
        employee_mobile TEXT,
        dr_code TEXT NOT NULL,
        dr_first_name TEXT NOT NULL,
        dr_last_name TEXT NOT NULL,
        dr_mobile TEXT NOT NULL,
        video_language TEXT NOT NULL,
        name_pronunciation TEXT DEFAULT NULL,
        avatar_name TEXT DEFAULT 'blusanta',
        audio_generation BOOLEAN DEFAULT 0,
        video_generation BOOLEAN DEFAULT 0,
        video_stitch BOOLEAN DEFAULT 0,
        final_video_url TEXT DEFAULT NULL,
        error_message TEXT DEFAULT NULL,
        is_regenerated BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        assessment_id INTEGER,
        video_key TEXT NOT NULL,
        video_url TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (assessment_id) REFERENCES assessments (id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS stitching_servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        machine_name TEXT NOT NULL UNIQUE,
        zone TEXT NOT NULL,
        active BOOLEAN DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // handle for migration of new columns
    const alterTableWithLogging = (columnDefinition) => {
      const columnName = columnDefinition.split(" ")[0];
      const sql = `ALTER TABLE assessments ADD COLUMN ${columnDefinition}`;
      db.run(sql, (err) => {
        if (err) {
          if (err.message.includes("duplicate column name")) {
            console.log(`ℹ️ Column '${columnName}' already exists. Skipping.`);
          } else {
            console.error(
              `❌ Failed to add column '${columnName}':`,
              err.message
            );
          }
        } else {
          console.log(`✅ Column '${columnName}' added successfully.`);
        }
      });
    };

    // Migration columns
    alterTableWithLogging("name_pronunciation TEXT DEFAULT NULL");
    alterTableWithLogging("error_message TEXT DEFAULT NULL");
    alterTableWithLogging("is_regenerated BOOLEAN DEFAULT 0");
    alterTableWithLogging("video_generated_on TEXT DEFAULT NULL");
  }
});

// Close the database connection on process exit
process.on("SIGINT", () => {
  db.close((err) => {
    if (err) {
      console.error("Error closing database:", err.message);
    } else {
      console.log("Database connection closed.");
    }
    process.exit(0);
  });
});

module.exports = db;
