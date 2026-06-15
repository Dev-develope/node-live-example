const { SixtyDbTTSProvider } = require("./sixtydb");

/**
 * Build the configured TTS provider from environment variables.
 *
 * Selection is via TTS_PROVIDER (default "sixtydb"). Returns null when the
 * selected provider is not configured (e.g. missing key) so the server can run
 * the speech-to-text demo without TTS credentials.
 *
 * @returns {import("./provider").TTSProvider | null}
 */
function createTTSProvider() {
  const provider = (process.env.TTS_PROVIDER || "sixtydb").toLowerCase();

  switch (provider) {
    case "sixtydb": {
      const apiKey = process.env.SIXTYDB_API_KEY;
      if (!apiKey) return null;
      return new SixtyDbTTSProvider({
        apiKey,
        baseUrl: process.env.SIXTYDB_WS_URL || undefined,
        defaultVoiceId: process.env.SIXTYDB_VOICE_ID || undefined,
      });
    }
    default:
      throw new Error(`Unknown TTS_PROVIDER: ${provider}`);
  }
}

module.exports = { createTTSProvider };
