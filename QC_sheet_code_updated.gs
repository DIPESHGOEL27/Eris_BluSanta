/**
 * BluSanta QC Automation Script
 * ================================
 *
 * This script automates the QC approval and video regeneration workflow for BluSanta campaign.
 * It monitors the "Status" column (Q) and triggers API calls when status is changed to "Approved" or "Regenerate".
 *
 * SHEET STRUCTURE:
 * ----------------
 * Column A (1):  ID
 * Column B (2):  Video Language
 * Column C (3):  Campaign Name
 * Column D (4):  Employee Code
 * Column E (5):  Employee Name
 * Column F (6):  Employee Mobile no.
 * Column G (7):  Dr. Code
 * Column H (8):  Dr. First Name
 * Column I (9):  Dr. Last Name
 * Column J (10): Dr. Mobile no.
 * Column K (11): Response video 1
 * Column L (12): Response video 2
 * Column M (13): Response collected on
 * Column N (14): Final video link
 * Column O (15): Video Generated on
 * Column P (16): Name Pronunciation
 * Column Q (17): Status ← EDIT THIS TO TRIGGER (Dropdown: Approved/Regenerate)
 * Column R (18): Regenerated?
 * Column S (19): Comments
 *
 * SETUP INSTRUCTIONS:
 * -------------------
 * 1. Open your BluSanta QC Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Delete any existing code
 * 4. Copy and paste this script
 * 5. Update the API_URL constant below with your backend URL
 * 6. Save the project (Ctrl+S or Cmd+S)
 * 7. Set up the trigger:
 *    - Click on clock icon (Triggers) in left sidebar
 *    - Click "+ Add Trigger"
 *    - Function: onTriggerEdit
 *    - Deployment: Head
 *    - Event source: From spreadsheet
 *    - Event type: On edit
 *    - Click "Save"
 *
 * USAGE:
 * ------
 * - When video is ready for QC, edit the "Status" column (Q)
 * - Select "Approved" to send WhatsApp notification to employee
 * - Select "Regenerate" to reset the assessment and regenerate video
 * - Add comments in "Comments" column (S) for tracking/feedback
 * - Update "Name Pronunciation" column (P) before regenerating if needed
 */

// ============================================================================
// CONFIGURATION - UPDATE THIS URL FOR YOUR ENVIRONMENT
// ============================================================================
const API_URL = "http://34.171.167.66:3001/api/blusanta/qc-approved-wa";

// Test/Development URL (localhost):
// const API_URL = "http://localhost:3001/api/blusanta/qc-approved-wa";

// ============================================================================
// MAIN TRIGGER FUNCTION - Simple onEdit (auto-triggers, no setup needed)
// ============================================================================
/**
 * Simple trigger - automatically runs when any cell is edited
 * Use this for basic functionality (no external API calls)
 */
function onEdit(e) {
  // Simple onEdit can't make external API calls, so we just log and call the installable version
  // The installable trigger (onTriggerEdit) handles the actual API call
}

// ============================================================================
// INSTALLABLE TRIGGER FUNCTION - For API calls
// ============================================================================
/**
 * Triggered automatically when any cell is edited in the sheet
 * Only processes edits to the "Status" column (Q/17)
 *
 * IMPORTANT: This must be set up as an installable trigger to make external API calls
 */
function onTriggerEdit(e) {
  // Check if event object exists
  console.log("=== BluSanta QC Automation Triggered ===");

  if (!e) {
    console.log(
      "⚠️ No event object passed. This function must be triggered by an onEdit event."
    );
    return;
  }

  // Get the active spreadsheet and the edited range
  const sheet = e.source.getActiveSheet();
  const range = e.range;
  const editedColumn = range.getColumn();

  Logger.log(`Edited column: ${editedColumn}`);

  // Check if the edited cell is in column Q (column 17) - "Status" column
  if (editedColumn !== 17) {
    Logger.log(
      `Column ${editedColumn} edited. Only monitoring column 17 (Status). Skipping.`
    );
    return;
  }

  // Get the value of the edited cell
  const editedValue = range.getValue();
  Logger.log(`Status changed to: "${editedValue}"`);

  // Only proceed if status is "Approved" or "Regenerate"
  if (editedValue !== "Approved" && editedValue !== "Regenerate") {
    Logger.log(
      `⚠️ Status "${editedValue}" is not Approved or Regenerate. Skipping API call.`
    );
    return;
  }

  // Get data from the same row
  const row = range.getRow();
  Logger.log(`Processing row: ${row}`);

  // Extract all relevant data from the row
  const id = sheet.getRange(row, 1).getValue(); // Column A - ID
  const employeeName = sheet.getRange(row, 5).getValue(); // Column E - Employee Name
  const employeeMobile = sheet.getRange(row, 6).getValue(); // Column F - Employee Mobile no.
  const drFirstName = sheet.getRange(row, 8).getValue(); // Column H - Dr. First Name
  const drLastName = sheet.getRange(row, 9).getValue(); // Column I - Dr. Last Name
  const drCode = sheet.getRange(row, 7).getValue(); // Column G - Dr. Code
  const videoUrl = sheet.getRange(row, 14).getValue(); // Column N - Final video link
  const namePronunciation = sheet.getRange(row, 16).getValue() || null; // Column P - Name Pronunciation
  const qcRemarks = sheet.getRange(row, 19).getValue() || null; // Column S - Comments

  // Validate required fields
  if (!id) {
    Logger.log("❌ ID is missing. Cannot proceed.");
    SpreadsheetApp.getUi().alert("Error: ID is missing in this row");
    return;
  }

  if (!videoUrl) {
    Logger.log("❌ Final video link is missing. Cannot proceed.");
    SpreadsheetApp.getUi().alert(
      `Error: Final video link is missing for ID ${id}`
    );
    return;
  }

  Logger.log("=== Data extracted from row ===");
  Logger.log(`ID: ${id}`);
  Logger.log(`Employee: ${employeeName} (${employeeMobile})`);
  Logger.log(`Doctor: Dr. ${drFirstName} ${drLastName} (Code: ${drCode})`);
  Logger.log(`Video URL: ${videoUrl}`);
  Logger.log(`Name Pronunciation: ${namePronunciation}`);
  Logger.log(`QC Remarks: ${qcRemarks}`);

  // Prepare payload for API
  const payload = {
    _id: id,
    video_url: videoUrl,
    status: editedValue,
    name_pronunciation: namePronunciation,
    qc_remarks: qcRemarks,
  };

  // API request options
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true, // Prevent script from failing on HTTP errors
  };

  try {
    Logger.log("=== Sending API request ===");
    Logger.log(`URL: ${API_URL}`);
    Logger.log(`Payload: ${JSON.stringify(payload, null, 2)}`);

    const response = UrlFetchApp.fetch(API_URL, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    Logger.log(`API response code: ${responseCode}`);
    Logger.log(`API response: ${responseText}`);

    if (responseCode === 200) {
      Logger.log("✅ API call successful");

      // Show success message to user
      const message =
        editedValue === "Approved"
          ? `✅ Video approved for ID ${id}\nWhatsApp notification sent to ${employeeName}`
          : `✅ Video regeneration triggered for ID ${id}\nAssessment has been reset`;

      SpreadsheetApp.getUi().alert(
        "Success",
        message,
        SpreadsheetApp.getUi().ButtonSet.OK
      );

      // Update "Regenerated?" column (R/18) if status is Regenerate
      if (editedValue === "Regenerate") {
        sheet.getRange(row, 18).setValue("Yes");
        Logger.log("Updated 'Regenerated?' column to 'Yes'");
      }
    } else {
      Logger.log(`⚠️ API returned non-200 status: ${responseCode}`);

      // Try to parse error message
      let errorMessage = responseText;
      try {
        const errorJson = JSON.parse(responseText);
        errorMessage = errorJson.message || responseText;
      } catch (e) {
        // Response is not JSON, use as-is
      }

      SpreadsheetApp.getUi().alert(
        "API Error",
        `Failed to process QC status for ID ${id}\n\nError: ${errorMessage}`,
        SpreadsheetApp.getUi().ButtonSet.OK
      );
    }
  } catch (error) {
    Logger.log(`❌ Error calling API: ${error}`);
    SpreadsheetApp.getUi().alert(
      "Network Error",
      `Failed to connect to backend server\n\nError: ${error}`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

// ============================================================================
// TEST FUNCTION
// ============================================================================
/**
 * Test function to manually trigger the script without editing the sheet
 *
 * Instructions:
 * 1. Update TEST_ROW to the row number you want to test
 * 2. Run this function from Apps Script editor (Run > testTrigger)
 * 3. Check the execution log for results
 */
function testTrigger() {
  const TEST_ROW = 2; // Change this to the row you want to test (excluding header)

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const range = sheet.getRange(TEST_ROW, 17); // Column Q (Status)

  const mockEvent = {
    source: SpreadsheetApp.getActiveSpreadsheet(),
    range: range,
  };

  Logger.log(`=== MANUAL TEST MODE ===`);
  Logger.log(`Testing row ${TEST_ROW}`);

  onTriggerEdit(mockEvent);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
/**
 * Creates a custom menu in the sheet for easy access
 * Automatically runs when sheet is opened
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("BluSanta QC")
    .addItem("Test QC Automation", "testTrigger")
    .addItem("View Logs", "showLogs")
    .addToUi();
}

/**
 * Shows execution logs in a dialog
 */
function showLogs() {
  const ui = SpreadsheetApp.getUi();
  ui.alert(
    "View Logs",
    "To view execution logs:\n\n" +
      '1. Click "View" > "Executions" in Apps Script editor\n' +
      "2. Click on any execution to see detailed logs\n\n" +
      "Or use: View > Logs (for current execution)",
    ui.ButtonSet.OK
  );
}
