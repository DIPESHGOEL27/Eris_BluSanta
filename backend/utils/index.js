const { isGCSFileExists } = require("./gcp");

/**
 * Check if a GCS file exists
 */
async function checkGCSFileExists(url) {
  return await isGCSFileExists(url);
}

/**
 * Helper function to run a database query with Promise
 */
function getQuery(db, query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

/**
 * Helper function to run a database query that returns all rows
 */
function getAllQuery(db, query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

/**
 * Helper function to run a database write query
 */
function runQuery(db, query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve({ id: this.lastID, changes: this.changes });
      }
    });
  });
}

/**
 * Convert name to sentence case (Title Case per word)
 */
function sentenceCaseName(name) {
  if (!name || typeof name !== "string") return "";
  return name
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

module.exports = {
  isGCSFileExists: checkGCSFileExists,
  getQuery,
  getAllQuery,
  runQuery,
  sentenceCaseName,
};
