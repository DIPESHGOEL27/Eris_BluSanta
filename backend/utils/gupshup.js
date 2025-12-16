const fetch = require("node-fetch");

/**
 * Gupshup WhatsApp API Integration
 */

async function sendWhatsAppTemplate({
  templateId,
  destinationNumber,
  params = [],
}) {
  const endpoint = "https://api.gupshup.io/wa/api/v1/template/msg";
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    Apikey: process.env.GUPSHUP_API_KEY,
  };

  if (!headers.Apikey) {
    console.error(
      "[GUPSHUP] ❌ Missing GUPSHUP_API_KEY env var; aborting send."
    );
    throw new Error("GUPSHUP_API_KEY not set");
  }

  // Ensure phone number has country code
  const formattedNumber = destinationNumber.startsWith("91")
    ? destinationNumber
    : `91${destinationNumber}`;

  const payload = new URLSearchParams({
    channel: "whatsapp",
    source: "919731093893", // Update with your Gupshup source number
    "src.name": "IndoAITechnologies", // Update with your source name
    destination: formattedNumber,
    template: JSON.stringify({
      id: templateId,
      params,
    }),
  });

  console.log("\n[GUPSHUP] Sending WhatsApp template:");
  console.log(`  Channel: ${payload.get("channel")}`);
  console.log(`  Source: ${payload.get("source")}`);
  console.log(`  Destination: ${payload.get("destination")}`);
  console.log(`  Template: ${payload.get("template")}`);
  console.log("\n");

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: payload.toString(),
    });

    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch (e) {
      console.error("[GUPSHUP] ⚠️ Non-JSON response:", text);
      throw new Error(`Unexpected Gupshup response: ${text}`);
    }

    if (!response.ok) {
      console.error("[GUPSHUP] ❌ HTTP error", response.status, result);
      throw new Error(`Gupshup error ${response.status}: ${text}`);
    }

    console.log("[GUPSHUP] API response:", result);
    return result;
  } catch (error) {
    console.error("[GUPSHUP] API error:", error);
    throw error;
  }
}

module.exports = {
  sendWhatsAppTemplate,
};
