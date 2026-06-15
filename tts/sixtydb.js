const WebSocket = require("ws");
const { TTSProvider } = require("./provider");

/**
 * 60db TTS provider, implemented against the 60db WebSocket API:
 *   wss://api.60db.ai/ws/tts?apiKey=<key>
 *
 * Protocol (one synthesize call == one short-lived connection + context):
 *   connect            -> server: { connecting }, { connection_established }
 *   create_context     -> server: { context_created }
 *   send_text + flush  -> server: { audio_chunk } * N, { flush_completed }
 *   close_context      -> server: { context_closed }
 *
 * Audio is requested as LINEAR16 (raw 16-bit signed little-endian PCM, mono)
 * so chunks concatenate directly and play back without a codec in the browser.
 */
class SixtyDbTTSProvider extends TTSProvider {
  /**
   * @param {Object} config
   * @param {string} config.apiKey            60db API key.
   * @param {string} [config.baseUrl]         WS base, default wss://api.60db.ai/ws/tts.
   * @param {string} [config.defaultVoiceId]  Voice id used when a call omits one.
   */
  constructor({ apiKey, baseUrl = "wss://api.60db.ai/ws/tts", defaultVoiceId } = {}) {
    super();
    if (!apiKey) throw new Error("SixtyDbTTSProvider requires an apiKey");
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.defaultVoiceId = defaultVoiceId;
  }

  /**
   * @param {string} text
   * @param {import("./provider").SynthesizeOptions} [opts]
   * @param {(chunk: import("./provider").AudioChunk) => void} onAudio
   * @returns {Promise<import("./provider").SynthesizeResult>}
   */
  synthesize(text, opts = {}, onAudio = () => {}) {
    const encoding = opts.encoding || "LINEAR16";
    const sampleRate = opts.sampleRate || 24000;
    const voiceId = opts.voiceId || this.defaultVoiceId;
    const contextId = `ctx-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    const url = `${this.baseUrl}?apiKey=${encodeURIComponent(this.apiKey)}`;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      let settled = false;

      const finish = (fn, arg) => {
        if (settled) return;
        settled = true;
        try {
          ws.close();
        } catch (_) {
          /* ignore */
        }
        fn(arg);
      };

      ws.on("open", () => {
        // Some deployments stream a couple of handshake frames before they are
        // ready; create_context is also accepted immediately after open, so we
        // send it here and key the rest of the flow off context_created.
        ws.send(
          JSON.stringify({
            create_context: {
              context_id: contextId,
              voice_id: voiceId,
              audio_config: {
                audio_encoding: encoding,
                sample_rate_hertz: sampleRate,
              },
              speed: opts.speed,
              stability: opts.stability,
              similarity: opts.similarity,
            },
          })
        );
      });

      ws.on("message", (raw) => {
        let msg;
        try {
          msg = JSON.parse(raw.toString());
        } catch (_) {
          return; // ignore non-JSON frames
        }

        if (msg.context_created) {
          ws.send(JSON.stringify({ send_text: { context_id: contextId, text } }));
          ws.send(JSON.stringify({ flush_context: { context_id: contextId } }));
        } else if (msg.audio_chunk && msg.audio_chunk.audioContent) {
          onAudio({ audioBase64: msg.audio_chunk.audioContent });
        } else if (msg.flush_completed) {
          ws.send(JSON.stringify({ close_context: { context_id: contextId } }));
        } else if (msg.context_closed) {
          finish(resolve, { encoding, sampleRate });
        } else if (msg.error) {
          const reason = msg.error.message || "60db TTS error";
          finish(reject, new Error(reason));
        }
      });

      ws.on("error", (err) => finish(reject, err));
      ws.on("close", () => finish(resolve, { encoding, sampleRate }));
    });
  }
}

module.exports = { SixtyDbTTSProvider };
