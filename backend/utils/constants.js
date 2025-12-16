/**
 * BluSanta Configuration Constants
 *
 * KEY DIFFERENCES FROM BHAGYASHREE:
 * 1. No MuseTalk VM required - uses pre-recorded constant videos
 * 2. Audio generation via ElevenLabs API (not custom TTS service)
 * 3. Only 2 doctor response videos (vs 4 in Bhagyashree)
 * 4. Follows Bhagyashree podcast stitching pattern with interspersed videos
 * 5. Intro merged into const_000, outro merged into const_003
 * 6. TWO different placeholders with TWO different audios:
 *    - plc_000.mp4 with "Doctor <first name>" audio
 *    - plc_001.mp4 with "Thank you Doctor <first name>" audio
 *
 * VIDEO SEQUENCE (8 segments):
 * {const_000, plc_000, const_001, nodding, const_002, nodding, plc_001, const_003}
 *
 * assets_actor_paths (BluSanta/Constant videos):
 * 0. const_000.mp4 - BluSanta intro with greeting (includes intro)
 * 1. plc_000.mp4 - Placeholder 1 (audio replaced with "Doctor <first name>")
 * 2. const_001.mp4 - BluSanta asks Question 1
 * 3. nodding.mp4 - Nodding (trimmed to match doctor video 1)
 * 4. const_002.mp4 - BluSanta asks Question 2
 * 5. nodding.mp4 - Nodding (trimmed to match doctor video 2)
 * 6. plc_001.mp4 - Placeholder 2 (audio replaced with "Thank you Doctor <first name>")
 * 7. const_003.mp4 - Final message + thank you + outro (includes outro)
 *
 * assets_doctor_paths (interspersed with actor videos):
 * 0. plc_000.mp4 (audio replaced with "Doctor <first name>")
 * 1. plc_000.mp4 (same audio overlay)
 * 2. plc_000.mp4 (placeholder)
 * 3. doctor_video_1.mp4 (doctor's response to Q1)
 * 4. plc_000.mp4 (placeholder)
 * 5. doctor_video_2.mp4 (doctor's response to Q2)
 * 6. plc_001.mp4 (audio replaced with "Thank you Doctor <first name>")
 * 7. plc_001.mp4 (placeholder)
 */

const ADMIN_PHONE = process.env.ADMIN_PHONE || "919999999999";

// Authorization token for AI services (Stitching only - no TTS/Vision VMs needed)
const AI_SERVICE_AUTH_TOKEN =
  process.env.AI_SERVICE_AUTH_TOKEN ||
  "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiZTMxZjE2YTVlMTQzYTBkZTExMjkifQ.pWDOEeQy1M8C_4sazA3Vm3VIFN59DoeZBfGC2bXxrLs";

// Supported languages (English only for BluSanta)
const SUPPORTED_LANGUAGES = ["English"];

// BluSanta Stitching server (separate from Saffron)
const servers = [
  {
    zone: "us-central1-a",
    name: "video-stitch-blusanta", // Dedicated BluSanta stitching server
  },
];

/**
 * ElevenLabs Configuration
 * Used for generating personalized audio (name pronunciation)
 */
const ELEVENLABS_CONFIG = {
  apiKey: process.env.ELEVENLABS_API_KEY,
  baseUrl: "https://api.elevenlabs.io/v1",

  // BluSanta voice ID - UPDATE THIS with your actual voice ID
  voiceId: process.env.ELEVENLABS_VOICE_ID || "your-blusanta-voice-id",

  // TTS settings
  modelId: "eleven_multilingual_v2", // High quality model

  // Voice settings for consistent output
  voiceSettings: {
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0.0,
    use_speaker_boost: true,
  },

  // Output format
  outputFormat: "mp3_44100_128", // High quality MP3
};

/**
 * BluSanta Avatar Configuration
 *
 * KEY DIFFERENCE: No MuseTalk VMs - uses pre-recorded constant videos
 * The personalized element is AUDIO ONLY (generated via ElevenLabs)
 */
const BLUSANTA_CONFIG = {
  avatarName: "blusanta",

  // NO VMs required for video generation (pre-recorded videos)
  // Only stitching server is needed

  backendVm: {
    // Backend/Frontend VM - UPDATE with your actual VM details
    zone: "us-central1-c",
    name: "blusanta-campaign",
    externalIP: process.env.BACKEND_IP || "YOUR_BACKEND_IP",
    frontendPort: 3000,
    backendPort: 3001,
    webhookBaseUrl: process.env.WEBHOOK_BASE_URL || "https://your-domain.com",
  },

  gcs: {
    bucket: process.env.GCS_BUCKET_NAME || "blusanta-campaign-videos",
    basePath: "blusanta",

    // Audio storage paths (for ElevenLabs generated "Doctor [Name]" audio)
    // NOTE: SAME audio is used for BOTH placeholder videos (Part 2 and Part 8)
    getNameAudioPath: (language, employeeCode, drCode) => {
      const langFolder = language === "Hindi" ? "hindi" : "english";
      return `blusanta/audio/names/${langFolder}/${employeeCode}_${drCode}_name.mp3`;
    },

    // Final video storage paths
    getFinalVideoPath: (language, employeeCode, drCode) => {
      const resultsFolder = language === "Hindi" ? "results_hindi" : "results";
      return `blusanta/${resultsFolder}/${employeeCode}_${drCode}_final.mp4`;
    },
  },

  /**
   * BluSanta Video Stitching Configuration
   *
   * 8 SEGMENTS with TWO different placeholder videos and TWO different audios
   *
   * FINAL STRUCTURE (8 segments):
   * ┌─────┬──────────────────────────┬─────────────┬──────────────────┐
   * │ Idx │ Actor (BluSanta)         │ Doctor      │ Layout           │
   * ├─────┼──────────────────────────┼─────────────┼──────────────────┤
   * │ 0   │ const_000.mp4 (+ intro)  │ plc_000     │ Full screen      │
   * │ 1   │ plc_000 (audio overlay)  │ plc_000     │ Full screen      │
   * │ 2   │ const_001.mp4 (Q1)       │ plc_000     │ Full screen      │
   * │ 3   │ nodding.mp4 (trimmed)    │ dr_video_1  │ Podcast zoom     │
   * │ 4   │ const_002.mp4 (Q2)       │ plc_000     │ Full screen      │
   * │ 5   │ nodding.mp4 (trimmed)    │ dr_video_2  │ Podcast zoom     │
   * │ 6   │ plc_001 (audio overlay)  │ plc_001     │ Full screen      │
   * │ 7   │ const_003.mp4 (+outro)   │ plc_001     │ Full screen      │
   * └─────┴──────────────────────────┴─────────────┴──────────────────┘
   *
   * AUDIO OVERLAY (TWO different audios):
   * - ElevenLabs generates TWO audio files:
   *   1. "Doctor <first name>" → applied to plc_000.mp4 at segment 1
   *   2. "Thank you Doctor <first name>" → applied to plc_001.mp4 at segment 6
   * - Other segments use original video audio
   *
   * NO SEPARATE INTRO/OUTRO WRAPPING:
   * - Intro merged into const_000.mp4
   * - Outro merged into const_003.mp4
   */
  stitching: {
    // Get video assets based on language
    getAssets: (language) => {
      const langFolder = language === "Hindi" ? "hindi" : "english";
      const basePath = `gs://${
        process.env.GCS_BUCKET_NAME || "blusanta-campaign-videos"
      }/blusanta/constant-videos/${langFolder}`;

      return {
        // Background image for podcast zoom layout
        backgroundImage: `${basePath}/Podcast_BG.jpg`,

        // Fonts for subtitles
        fontPath: `${basePath}/Lato-Regular.ttf`,
        textFontPath: `${basePath}/Montserrat-SemiBold.ttf`,
        subtitleFiles: `${basePath}/subtitles`,

        // NO separate intro/outro - merged into const videos

        // Constant videos path
        actorVideosPath: `${basePath}/`,

        // Individual constant videos
        constantVideos: {
          const_000: `${basePath}/const_000.mp4`, // Intro + greeting
          const_001: `${basePath}/const_001.mp4`, // Question 1
          const_002: `${basePath}/const_002.mp4`, // Question 2
          const_003: `${basePath}/const_003.mp4`, // Final message + thank you + outro
          nodding: `${basePath}/nodding.mp4`, // Nodding video (trimmed)
          plc_000: `${basePath}/plc_000.mp4`, // Placeholder 1 (audio: "Doctor <first name>")
          plc_001: `${basePath}/plc_001.mp4`, // Placeholder 2 (audio: "Thank you Doctor <first name>")
        },
      };
    },

    /**
     * Build stitching payload for the video-stitch server
     * 8 segments with TWO different placeholder videos and TWO different audios
     *
     * @param {object} params - Stitching parameters
     * @param {string} params.language - "English" or "Hindi"
     * @param {string} params.drFirstName - Doctor's first name
     * @param {string} params.drLastName - Doctor's last name
     * @param {string} params.greetingAudioUrl - GCS URL of ElevenLabs "Doctor <first name>" audio
     * @param {string} params.thankYouAudioUrl - GCS URL of ElevenLabs "Thank you Doctor <first name>" audio
     * @param {string} params.drVideo1Url - Doctor's response video 1 (GCS URL)
     * @param {string} params.drVideo2Url - Doctor's response video 2 (GCS URL)
     * @param {string} params.finalUploadPath - GCS path for final video
     * @param {string} params.webhookUrl - Webhook URL for completion notification
     * @param {object} params.additionalData - Additional data for webhook
     * @returns {object} - Stitching server payload
     */
    buildStitchingPayload: (params) => {
      const {
        language,
        drFirstName,
        drLastName,
        greetingAudioUrl,
        thankYouAudioUrl,
        drVideo1Url,
        drVideo2Url,
        finalUploadPath,
        webhookUrl,
        additionalData,
      } = params;

      const assets = BLUSANTA_CONFIG.stitching.getAssets(language);
      const actorVideosPath = assets.actorVideosPath;
      const plc_000 = assets.constantVideos.plc_000;
      const plc_001 = assets.constantVideos.plc_001;

      // 8 segments: {const_000, plc_000, const_001, nodding+dr1, const_002, nodding+dr2, plc_001, const_003}
      return {
        // Constant videos (4 files) - segments 0, 2, 4, 7
        constant_video_paths: [
          `${actorVideosPath}const_000.mp4`, // Segment 0: Intro + greeting
          `${actorVideosPath}const_001.mp4`, // Segment 2: Question 1
          `${actorVideosPath}const_002.mp4`, // Segment 4: Question 2
          `${actorVideosPath}const_003.mp4`, // Segment 7: Final message + outro
        ],

        // Placeholder videos (2 files) - segments 1, 6
        placeholder_video_paths: [
          plc_000, // Segment 1: "Doctor <first name>" audio overlay
          plc_001, // Segment 6: "Thank you Doctor <first name>" audio overlay
        ],

        // Nodding video (1 file, reused) - segments 3, 5
        nodding_video_path: `${actorVideosPath}nodding.mp4`,

        // Doctor videos (2 files) - for ZOOM segments 3, 5
        doctor_video_paths: [
          drVideo1Url, // Segment 3: Doctor response 1
          drVideo2Url, // Segment 5: Doctor response 2
        ],

        // TWO ElevenLabs audio files
        greeting_audio_path: greetingAudioUrl, // "Doctor <first name>" for segment 1
        thank_you_audio_path: thankYouAudioUrl, // "Thank you Doctor <first name>" for segment 6

        // Podcast background for ZOOM layout
        podcast_background: `gs://${
          process.env.GCS_BUCKET_NAME || "blusanta-campaign-videos"
        }/blusanta/podcast-backgrounds/Podcast_BG.jpg`,

        // Final output path
        final_upload_path: finalUploadPath,

        // Webhook
        webhook_url: webhookUrl,
        additional_data: additionalData,
      };
    },
  },
};

module.exports = {
  ADMIN_PHONE,
  AI_SERVICE_AUTH_TOKEN,
  SUPPORTED_LANGUAGES,
  servers,
  ELEVENLABS_CONFIG,
  BLUSANTA_CONFIG,
};
