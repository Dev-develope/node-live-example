/**
 * TTS provider abstraction.
 *
 * This is the consistent interface the rest of the app talks to. Concrete
 * providers (60db today, e.g. Deepgram Aura later) implement `synthesize` and
 * are interchangeable — the server does not care which one is wired in.
 *
 * @typedef {Object} SynthesizeOptions
 * @property {string} [voiceId]    Provider voice id (falls back to a configured default).
 * @property {number} [speed]      Speech speed multiplier, 0.5–2.0.
 * @property {number} [stability]  Voice stability, 0–100.
 * @property {number} [similarity] Voice similarity, 0–100.
 * @property {string} [encoding]   Audio encoding (e.g. "LINEAR16").
 * @property {number} [sampleRate] Sample rate in Hz (e.g. 24000).
 *
 * @typedef {Object} AudioChunk
 * @property {string} audioBase64  Base64-encoded audio for this chunk.
 *
 * @typedef {Object} SynthesizeResult
 * @property {string} encoding     Encoding of the streamed audio.
 * @property {number} sampleRate   Sample rate in Hz of the streamed audio.
 */

class TTSProvider {
  /**
   * Synthesize `text` to speech, invoking `onAudio` for each audio chunk as it
   * arrives, and resolving once synthesis is complete.
   *
   * @param {string} text
   * @param {SynthesizeOptions} opts
   * @param {(chunk: AudioChunk) => void} onAudio
   * @returns {Promise<SynthesizeResult>}
   */
  async synthesize(text, opts, onAudio) {
    throw new Error("TTSProvider.synthesize() not implemented");
  }
}

module.exports = { TTSProvider };
