const express = require("express");
const router = express.Router();
const { sendWhatsAppTemplate } = require("../utils/gupshup");

/**
 * Send WhatsApp message endpoint
 */
router.post("/send-whatsapp", async (req, res) => {
  try {
    const { templateId, destinationNumber, params } = req.body;

    if (!templateId || !destinationNumber) {
      return res.status(400).json({
        success: false,
        message: "Missing templateId or destinationNumber",
      });
    }

    const result = await sendWhatsAppTemplate({
      templateId,
      destinationNumber,
      params: params || [],
    });

    res.status(200).json({
      success: true,
      result: result,
    });
  } catch (error) {
    console.error("[WHATSAPP] ❌ Error sending message:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send WhatsApp message",
      error: error.message,
    });
  }
});

module.exports = router;
