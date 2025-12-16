const { google } = require("googleapis");

// Define the Google Sheets API credentials and spreadsheet details
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = "Sheet1";

/**
 * Add a row to the Google Sheet for QC tracking
 */
async function addRowToSheet(rowData) {
  console.log("[SHEET] Adding row:", rowData);

  const auth = new google.auth.JWT({
    keyFile: process.env.GCP_KEY_FILE,
    scopes: SCOPES,
  });

  const sheets = google.sheets({ version: "v4", auth });

  const request = {
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    resource: {
      values: [rowData],
    },
  };

  try {
    const response = await sheets.spreadsheets.values.append(request);
    console.log("[SHEET] ✅ Row added:", response.data);
    return response.data;
  } catch (error) {
    console.error("[SHEET] ❌ Error adding row:", error);
    throw error;
  }
}

/**
 * Read data from the Google Sheet
 */
async function readSheetData(startRow = 2, endRow = 1000) {
  console.log(`[SHEET] Reading data from row ${startRow} to ${endRow}`);

  const auth = new google.auth.JWT({
    keyFile: process.env.GCP_KEY_FILE,
    scopes: SCOPES,
  });

  const sheets = google.sheets({ version: "v4", auth });

  try {
    const range = `${SHEET_NAME}!A${startRow}:T${endRow}`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
    });

    const rows = response.data.values || [];
    console.log(`[SHEET] ✅ Read ${rows.length} rows`);
    return rows;
  } catch (error) {
    console.error("[SHEET] ❌ Error reading data:", error);
    throw error;
  }
}

/**
 * Update sheet by assessment ID
 */
async function updateSheetByAssessmentId(assessmentId, updates) {
  console.log(`[SHEET] Updating assessment ID ${assessmentId}:`, updates);

  const auth = new google.auth.JWT({
    keyFile: process.env.GCP_KEY_FILE,
    scopes: SCOPES,
  });

  const sheets = google.sheets({ version: "v4", auth });

  try {
    // First, find the row with this assessment ID
    const allRows = await readSheetData();
    const rowIndex = allRows.findIndex((row) => row[0] == assessmentId);

    if (rowIndex === -1) {
      console.log(`[SHEET] ⚠️ Assessment ID ${assessmentId} not found`);
      return false;
    }

    const actualRowNumber = rowIndex + 2; // +2 because: 1 for header, 1 for 0-index
    console.log(`[SHEET] Found assessment at row ${actualRowNumber}`);

    // Prepare batch update for multiple columns
    const updateData = [];

    // Column N (14): Final video link
    if (updates.final_video_url) {
      updateData.push({
        range: `${SHEET_NAME}!N${actualRowNumber}`,
        values: [[updates.final_video_url]],
      });
    }

    // Column O (15): Video Generated on
    if (updates.video_generated_on) {
      updateData.push({
        range: `${SHEET_NAME}!O${actualRowNumber}`,
        values: [[updates.video_generated_on]],
      });
    }

    // Column P (16): Status
    if (updates.status !== undefined) {
      updateData.push({
        range: `${SHEET_NAME}!P${actualRowNumber}`,
        values: [[updates.status]],
      });
    }

    // Column Q (17): Reason for Re-upload
    if (updates.reason_for_reupload !== undefined) {
      updateData.push({
        range: `${SHEET_NAME}!Q${actualRowNumber}`,
        values: [[updates.reason_for_reupload]],
      });
    }

    // Column R (18): Hindi Pronunciation
    if (updates.hindi_pronunciation !== undefined) {
      updateData.push({
        range: `${SHEET_NAME}!R${actualRowNumber}`,
        values: [[updates.hindi_pronunciation]],
      });
    }

    // Column S (19): Regenerated?
    if (updates.regenerated !== undefined) {
      updateData.push({
        range: `${SHEET_NAME}!S${actualRowNumber}`,
        values: [[updates.regenerated]],
      });
    }

    // Column T (20): Comments
    if (updates.comments !== undefined) {
      updateData.push({
        range: `${SHEET_NAME}!T${actualRowNumber}`,
        values: [[updates.comments]],
      });
    }

    if (updateData.length === 0) {
      console.log("[SHEET] No updates to apply");
      return false;
    }

    // Perform batch update
    const batchUpdateRequest = {
      spreadsheetId: SPREADSHEET_ID,
      resource: {
        valueInputOption: "RAW",
        data: updateData,
      },
    };

    const response = await sheets.spreadsheets.values.batchUpdate(
      batchUpdateRequest
    );

    console.log(
      `[SHEET] ✅ Updated ${response.data.totalUpdatedCells} cells for assessment ID ${assessmentId}`
    );
    return true;
  } catch (error) {
    console.error("[SHEET] ❌ Error updating sheet:", error);
    throw error;
  }
}

module.exports = {
  addRowToSheet,
  readSheetData,
  updateSheetByAssessmentId,
};
