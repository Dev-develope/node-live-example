// 60db text-to-speech client.
//
// Talks to our server's /tts WebSocket (which proxies to 60db, keeping the API
// key server-side). Audio arrives as base64 LINEAR16 chunks (16-bit signed
// little-endian PCM, mono); we accumulate them and play via the Web Audio API.

(function () {
  const textInput = document.getElementById("tts-text");
  const speakButton = document.getElementById("tts-speak");
  const statusEl = document.getElementById("tts-status");

  function setStatus(message) {
    statusEl.textContent = message || "";
  }

  function base64ToUint8Array(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  // Concatenate accumulated PCM chunks and play them as one buffer.
  function playPcm(chunks, sampleRate) {
    const totalBytes = chunks.reduce((sum, c) => sum + c.length, 0);
    if (totalBytes === 0) return;

    const pcm = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      pcm.set(chunk, offset);
      offset += chunk.length;
    }

    // Interpret bytes as 16-bit signed little-endian samples → Float32 [-1, 1].
    const view = new DataView(pcm.buffer);
    const sampleCount = Math.floor(pcm.length / 2);
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioCtx();
    const audioBuffer = audioCtx.createBuffer(1, sampleCount, sampleRate || 24000);
    const channel = audioBuffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      channel[i] = view.getInt16(i * 2, true) / 32768;
    }

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    source.start();
  }

  function speak(text) {
    setStatus("connecting…");
    speakButton.disabled = true;

    const socket = new WebSocket(`ws://${window.location.host}/tts`);
    const chunks = [];
    let sampleRate = 24000;

    socket.addEventListener("open", () => {
      setStatus("synthesizing…");
      socket.send(JSON.stringify({ type: "speak", text }));
    });

    socket.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "audio") {
        chunks.push(base64ToUint8Array(data.audio));
      } else if (data.type === "done") {
        if (data.sampleRate) sampleRate = data.sampleRate;
        setStatus("playing");
        playPcm(chunks, sampleRate);
        socket.close();
        speakButton.disabled = false;
      } else if (data.type === "error") {
        setStatus(`error: ${data.message}`);
        socket.close();
        speakButton.disabled = false;
      }
    });

    socket.addEventListener("error", () => {
      setStatus("connection error");
      speakButton.disabled = false;
    });
  }

  speakButton.addEventListener("click", () => {
    const text = textInput.value.trim();
    if (!text) {
      setStatus("enter some text first");
      return;
    }
    speak(text);
  });
})();
