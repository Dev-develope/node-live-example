const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");
const { createTTSProvider } = require("./tts");
const dotenv = require("dotenv");
dotenv.config();

const app = express();
const server = http.createServer(app);

// Two WebSocket endpoints share the HTTP server, routed by path on upgrade:
//   /     -> Deepgram speech-to-text (live transcription)
//   /tts  -> 60db text-to-speech (audio synthesis)
const wssStt = new WebSocket.Server({ noServer: true });
const wssTts = new WebSocket.Server({ noServer: true });

const deepgramClient = createClient(process.env.DEEPGRAM_API_KEY);
const ttsProvider = createTTSProvider();
let keepAlive;

const setupDeepgram = (ws) => {
  const deepgram = deepgramClient.listen.live({
    language: "en",
    punctuate: true,
    smart_format: true,
    model: "nova",
  });

  if (keepAlive) clearInterval(keepAlive);
  keepAlive = setInterval(() => {
    console.log("deepgram: keepalive");
    deepgram.keepAlive();
  }, 10 * 1000);

  deepgram.addListener(LiveTranscriptionEvents.Open, async () => {
    console.log("deepgram: connected");

    deepgram.addListener(LiveTranscriptionEvents.Transcript, (data) => {
      console.log("deepgram: packet received");
      console.log("deepgram: transcript received");
      console.log("socket: transcript sent to client");
      ws.send(JSON.stringify(data));
    });

    deepgram.addListener(LiveTranscriptionEvents.Close, async () => {
      console.log("deepgram: disconnected");
      clearInterval(keepAlive);
      deepgram.finish();
    });

    deepgram.addListener(LiveTranscriptionEvents.Error, async (error) => {
      console.log("deepgram: error received");
      console.error(error);
    });

    deepgram.addListener(LiveTranscriptionEvents.Warning, async (warning) => {
      console.log("deepgram: warning received");
      console.warn(warning);
    });

    deepgram.addListener(LiveTranscriptionEvents.Metadata, (data) => {
      console.log("deepgram: packet received");
      console.log("deepgram: metadata received");
      console.log("ws: metadata sent to client");
      ws.send(JSON.stringify({ metadata: data }));
    });
  });

  return deepgram;
};

wssStt.on("connection", (ws) => {
  console.log("socket: client connected");
  let deepgram = setupDeepgram(ws);

  ws.on("message", (message) => {
    console.log("socket: client data received");

    if (deepgram.getReadyState() === 1 /* OPEN */) {
      console.log("socket: data sent to deepgram");
      deepgram.send(message);
    } else if (deepgram.getReadyState() >= 2 /* 2 = CLOSING, 3 = CLOSED */) {
      console.log("socket: data couldn't be sent to deepgram");
      console.log("socket: retrying connection to deepgram");
      /* Attempt to reopen the Deepgram connection */
      deepgram.finish();
      deepgram.removeAllListeners();
      deepgram = setupDeepgram(ws);
    } else {
      console.log("socket: data couldn't be sent to deepgram");
    }
  });

  ws.on("close", () => {
    console.log("socket: client disconnected");
    deepgram.finish();
    deepgram.removeAllListeners();
    deepgram = null;
  });
});

wssTts.on("connection", (ws) => {
  console.log("tts: client connected");

  ws.on("message", async (message) => {
    let request;
    try {
      request = JSON.parse(message.toString());
    } catch (_) {
      ws.send(JSON.stringify({ type: "error", message: "invalid JSON" }));
      return;
    }

    if (request.type !== "speak" || !request.text) {
      ws.send(JSON.stringify({ type: "error", message: "expected { type: 'speak', text }" }));
      return;
    }

    if (!ttsProvider) {
      ws.send(
        JSON.stringify({ type: "error", message: "TTS provider not configured (set SIXTYDB_API_KEY)" })
      );
      return;
    }

    console.log("tts: synthesizing", JSON.stringify(request.text).slice(0, 60));
    try {
      const result = await ttsProvider.synthesize(
        request.text,
        {
          voiceId: request.voiceId,
          speed: request.speed,
          stability: request.stability,
          similarity: request.similarity,
        },
        (chunk) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "audio", audio: chunk.audioBase64 }));
          }
        }
      );
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "done", ...result }));
      }
      console.log("tts: synthesis complete");
    } catch (error) {
      console.error("tts: error", error);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "error", message: error.message }));
      }
    }
  });

  ws.on("close", () => {
    console.log("tts: client disconnected");
  });
});

// Route WebSocket upgrades to the right server based on the request path.
server.on("upgrade", (request, socket, head) => {
  const { pathname } = new URL(request.url, `http://${request.headers.host}`);
  const wss = pathname === "/tts" ? wssTts : wssStt;
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

app.use(express.static("public/"));
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

server.listen(3000, () => {
  console.log("Server is listening on port 3000");
});
