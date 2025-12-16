const fetch = require("node-fetch");
const { ELEVENLABS_CONFIG, BLUSANTA_CONFIG } = require("./constants");
const { uploadBufferToGCS } = require("./gcp");
const { preprocessAndTransliterate } = require("./transliteration");

/**
 * ElevenLabs TTS Integration for BluSanta
 *
 * Generates personalized audio for the doctor's name using ElevenLabs API.
 * This replaces the custom TTS VM used in Bhagyashree project.
 */

/**
 * Generate audio using ElevenLabs API
 *
 * @param {string} text - Text to convert to speech (e.g., "Doctor John Smith")
 * @param {object} options - Optional overrides for voice settings
 * @returns {Promise<Buffer>} - Audio file as buffer
 */
async function generateAudioWithElevenLabs(text, options = {}) {
  const voiceId = options.voiceId || ELEVENLABS_CONFIG.voiceId;
  const apiKey = ELEVENLABS_CONFIG.apiKey;

  if (!apiKey) {
    throw new Error(
      "ElevenLabs API key not configured. Set ELEVENLABS_API_KEY in .env"
    );
  }

  if (!voiceId || voiceId === "your-blusanta-voice-id") {
    throw new Error(
      "ElevenLabs Voice ID not configured. Set ELEVENLABS_VOICE_ID in .env"
    );
  }

  const url = `${ELEVENLABS_CONFIG.baseUrl}/text-to-speech/${voiceId}`;

  const requestBody = {
    text: text,
    model_id: options.modelId || ELEVENLABS_CONFIG.modelId,
    voice_settings: {
      ...ELEVENLABS_CONFIG.voiceSettings,
      ...options.voiceSettings,
    },
  };

  console.log(`[ELEVENLABS] 🎤 Generating audio...`);
  console.log(`[ELEVENLABS] 📜 Text to TTS: "${text}"`);
  console.log(`[ELEVENLABS] 🔊 Voice ID: ${voiceId}`);
  console.log(`[ELEVENLABS] 📊 Model: ${ELEVENLABS_CONFIG.modelId}`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[ELEVENLABS] ❌ API Error: ${response.status} - ${errorText}`
      );
      throw new Error(
        `ElevenLabs API error: ${response.status} - ${errorText}`
      );
    }

    // Get audio as buffer
    const audioBuffer = await response.buffer();
    console.log(
      `[ELEVENLABS] ✅ Audio generated successfully (${audioBuffer.length} bytes)`
    );

    return audioBuffer;
  } catch (error) {
    console.error(`[ELEVENLABS] ❌ Error generating audio:`, error.message);
    throw error;
  }
}

/**
 * Generate TWO personalized audio files and upload to GCS
 * 1. "Doctor <first name>" audio for plc_000.mp4 (segment 1)
 * 2. "Thank you Doctor <first name>" audio for plc_001.mp4 (segment 6)
 *
 * @param {object} params - Generation parameters
 * @param {string} params.namePronunciation - The pronunciation text for the name (as entered by user)
 * @param {string} params.employeeCode - Employee code for file naming
 * @param {string} params.drCode - Doctor code for file naming
 * @param {string} params.language - "English" (only English supported)
 * @returns {Promise<object>} - Object with {greetingUrl, thankYouUrl}
 */
async function generateAndUploadNameAudio(params) {
  const { namePronunciation, employeeCode, drCode, language } = params;

  console.log(
    `[BLUSANTA TTS] 🎤 Generating TWO audio files for: "${namePronunciation}"`
  );
  console.log(
    `[BLUSANTA TTS] 📋 Employee: ${employeeCode}, Doctor: ${drCode}, Language: ${language}`
  );

  // Transliterate the name to ensure proper TTS pronunciation
  const transliteratedName = await preprocessAndTransliterate(
    namePronunciation
  );
  console.log(
    `[BLUSANTA TTS] 🔤 Transliterated name: "${namePronunciation}" → "${transliteratedName}"`
  );
  console.log(
    `[BLUSANTA TTS] ✅ Using transliterated name in TTS: "${transliteratedName}"`
  );

  // 1. Generate greeting audio: Hindi intro + Doctor name + welcome message
  const greetingText = `- डॉक्टर ${transliteratedName} ! - - - welcome, and thank you for joining us today.`;
  console.log(`[BLUSANTA TTS] 📝 Greeting audio text: "${greetingText}"`);
  const greetingAudioBuffer = await generateAudioWithElevenLabs(greetingText);

  // 2. Generate thank you audio: "Thank you Doctor <first name>"
  const thankYouText = `Thank you Doctor ${transliteratedName}`;
  console.log(`[BLUSANTA TTS] 📝 Thank you audio text: "${thankYouText}"`);
  const thankYouAudioBuffer = await generateAudioWithElevenLabs(thankYouText);

  // Upload both to GCS with different filenames
  const bucket = BLUSANTA_CONFIG.gcs.bucket;
  const langFolder = language === "Hindi" ? "hindi" : "english";

  const greetingGcsPath = `blusanta/audio/names/${langFolder}/${employeeCode}_${drCode}_greeting.mp3`;
  const thankYouGcsPath = `blusanta/audio/names/${langFolder}/${employeeCode}_${drCode}_thankyou.mp3`;

  console.log(
    `[BLUSANTA TTS] 📤 Uploading greeting audio to gs://${bucket}/${greetingGcsPath}`
  );
  const greetingUrl = await uploadBufferToGCS(
    greetingAudioBuffer,
    bucket,
    greetingGcsPath,
    "audio/mpeg"
  );

  console.log(
    `[BLUSANTA TTS] 📤 Uploading thank you audio to gs://${bucket}/${thankYouGcsPath}`
  );
  const thankYouUrl = await uploadBufferToGCS(
    thankYouAudioBuffer,
    bucket,
    thankYouGcsPath,
    "audio/mpeg"
  );

  console.log(`[BLUSANTA TTS] ✅ Greeting audio: ${greetingUrl}`);
  console.log(`[BLUSANTA TTS] ✅ Thank you audio: ${thankYouUrl}`);

  return {
    greetingUrl,
    thankYouUrl,
  };
}

/**
 * Get available voices from ElevenLabs
 * Useful for finding the correct voice ID
 *
 * @returns {Promise<Array>} - List of available voices
 */
async function getAvailableVoices() {
  const apiKey = ELEVENLABS_CONFIG.apiKey;

  if (!apiKey) {
    throw new Error("ElevenLabs API key not configured");
  }

  const url = `${ELEVENLABS_CONFIG.baseUrl}/voices`;

  const response = await fetch(url, {
    headers: {
      "xi-api-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch voices: ${response.status}`);
  }

  const data = await response.json();
  return data.voices;
}

/**
 * Check ElevenLabs API quota/usage
 *
 * @returns {Promise<object>} - User subscription info
 */
async function checkElevenLabsQuota() {
  const apiKey = ELEVENLABS_CONFIG.apiKey;

  if (!apiKey) {
    throw new Error("ElevenLabs API key not configured");
  }

  const url = `${ELEVENLABS_CONFIG.baseUrl}/user/subscription`;

  const response = await fetch(url, {
    headers: {
      "xi-api-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to check quota: ${response.status}`);
  }

  const data = await response.json();
  return {
    characterCount: data.character_count,
    characterLimit: data.character_limit,
    remainingCharacters: data.character_limit - data.character_count,
    tier: data.tier,
  };
}

module.exports = {
  generateAudioWithElevenLabs,
  generateAndUploadNameAudio,
  getAvailableVoices,
  checkElevenLabsQuota,
};
