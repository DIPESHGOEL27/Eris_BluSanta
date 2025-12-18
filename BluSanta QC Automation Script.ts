/**
 * BluSanta QC Automation Script for Google Sheets
 *
 * SETUP INSTRUCTIONS:
 * 1. Open your BluSanta QC Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Delete any existing code and paste this entire script
 * 4. Click "Save" (disk icon)
 * 5. Click "Run" > "setupTrigger" to set up the onEdit trigger
 * 6. Authorize the script when prompted
 * 7. Test by editing column P (Status) in any row
 *
 * COLUMN MAPPING:
 * A = ID
 * B = Video Language
 * C = Campaign Name
 * D = Employee Code
 * E = Employee Name
 * F = Employee Mobile no.
 * G = Dr. Code
 * H = Dr. First Name
 * I = Dr. Last Name
 * J = Dr. Mobile no.
 * K = Response video 1
 * L = Response video 2
 * M = Response collected on
 * N = Final video link
 * O = Video Generated on
 * P = Status (Approved/Regenerate/Re-upload)
 * Q = Reason for Re-upload
 * R = Hindi Pronunciation
 * S = Regenerated?
 * T = Comments
 */

function onTriggerEdit(e) {
  // Check if event object exists
  Logger.log(e);
  if (!e) {
    Logger.log(
      "No event object passed. This function must be triggered by an onEdit event."
    );
    return;
  }

  // Get the active spreadsheet and the edited range
  const sheet = e.source.getActiveSheet();
  const range = e.range;

  // Check if the edited cell is in column P (column 16) - "Status" column
  if (range.getColumn() === 16) {
    // Get the value of the edited cell
    const editedValue = range.getValue();

    // Logging the edited value
    Logger.log("Edited Status in column P:", editedValue);

    // Only proceed if status is Approved, Regenerate, or Re-upload
    if (
      editedValue !== "Approved" &&
      editedValue !== "Regenerate" &&
      editedValue !== "Re-upload"
    ) {
      Logger.log(
        "Status is not Approved, Regenerate, or Re-upload. Skipping API call."
      );
      return;
    }

    // Get data from the same row
    const row = range.getRow();
    const _id = sheet.getRange(row, 1).getValue(); // Column A - ID
    const videoUrl = sheet.getRange(row, 14).getValue(); // Column N - Final video link
    const reasonForReupload = sheet.getRange(row, 17).getValue() || null; // Column Q - Reason for Re-upload
    const hindiPronunciation = sheet.getRange(row, 18).getValue() || null; // Column R - Hindi Pronunciation

    // Validate required fields
    if (!_id) {
      Logger.log("ID is missing. Cannot proceed.");
      return;
    }

    if (!videoUrl) {
      Logger.log("Final video link is missing. Cannot proceed.");
      return;
    }

    // Special validation for Re-upload status
    if (editedValue === "Re-upload" && !reasonForReupload) {
      Logger.log(
        "Reason for Re-upload is required when Status is 'Re-upload'. Cannot proceed."
      );
      SpreadsheetApp.getUi().alert(
        "Error: Reason for Re-upload (Column Q) is required when Status is 'Re-upload'"
      );
      return;
    }

    // Special validation for Regenerate status
    if (editedValue === "Regenerate" && !hindiPronunciation) {
      Logger.log(
        "Warning: Hindi Pronunciation is recommended for Regenerate status."
      );
    }

    // API endpoint - Update this with your actual backend URL
    // const url = "http://localhost:3001/api/blusanta/qc-approved-wa";
    // For production, use:
    const url = "http://34.171.167.66:3001/api/blusanta/qc-approved-wa";

    // Prepare payload
    const payload = {
      _id: _id,
      video_url: videoUrl,
      status: editedValue,
      hindi_pronunciation: hindiPronunciation,
      reason_for_reupload: reasonForReupload,
    };

    // API request options
    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true, // Prevent script from failing on HTTP errors
    };

    try {
      Logger.log("Sending payload:", JSON.stringify(payload));
      const response = UrlFetchApp.fetch(url, options);
      const responseCode = response.getResponseCode();
      const responseText = response.getContentText();

      Logger.log(`API response code: ${responseCode}`);
      Logger.log(`API response: ${responseText}`);

      if (responseCode === 200) {
        Logger.log("✅ API call successful");

        // If status is Regenerate, mark "Regenerated?" column as "Pending"
        // (Backend will update it to "Yes" after regeneration completes)
        if (editedValue === "Regenerate") {
          sheet.getRange(row, 19).setValue("Pending"); // Column S - Regenerated?
          Logger.log("Marked Regenerated? as 'Pending' for row " + row);
        }
      } else {
        Logger.log(`⚠️ API returned non-200 status: ${responseCode}`);
        SpreadsheetApp.getUi().alert(
          `API Error: ${responseCode}\n${responseText}`
        );
      }
    } catch (error) {
      Logger.log(`❌ Error calling API: ${error}`);
      SpreadsheetApp.getUi().alert(`Error: ${error}`);
    }
  }
}

/**
 * Sets up the onEdit trigger for this script
 * Run this function once to enable automatic triggering
 */
function setupTrigger() {
  // Delete existing triggers to avoid duplicates
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach((trigger) => {
    if (trigger.getHandlerFunction() === "onTriggerEdit") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Create new onEdit trigger
  ScriptApp.newTrigger("onTriggerEdit")
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();

  Logger.log("✅ Trigger set up successfully");
  SpreadsheetApp.getUi().alert("Trigger set up successfully!");
}

/**
 * Test function to manually trigger the script
 * Instructions:
 * 1. Set TEST_ROW to the row number you want to test
 * 2. Run this function from Apps Script editor
 */
function testTrigger() {
  const TEST_ROW = 2; // Change this to the row you want to test

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const range = sheet.getRange(TEST_ROW, 16); // Column P - Status

  const mockEvent = {
    source: SpreadsheetApp.getActiveSpreadsheet(),
    range: range,
  };

  onTriggerEdit(mockEvent);
}
