import { useEffect, useRef, useState } from 'react';
import { ChatIcon, MicIcon, SendIcon, VolumeIcon, XIcon } from './Icons';

const WELCOME = [
  {
    role: 'bot',
    text: "Hi, I'm the Campus Assistant 👋 Ask me about routines, room booking, notices, or anything on campus.",
  },
];

/** Blob (usually webm from MediaRecorder) -> 16-bit PCM WAV the Gemini API accepts. */
async function blobToWav(blob, targetRate = 16000) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioCtx();
  const decoded = await audioCtx.decodeAudioData(await blob.arrayBuffer());
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * targetRate), targetRate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();

  const pcm = rendered.getChannelData(0);
  const dataSize = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (off, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Floating chat widget (bottom-right) for the Campus Assistant.
 *
 * Text + voice: talks to same-origin POST /api/chat (Django proxies it to
 * FastAPI, which calls Gemini) — the API key never leaves the server. Voice
 * input goes through /api/chat/transcribe and spoken replies through
 * /api/chat/speak. Conversation history is maintained server-side by the
 * Gemini Interactions API via `interaction_id` chaining.
 */
export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(WELCOME);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speakingId, setSpeakingId] = useState(null); // message index being read aloud
  const interactionIdRef = useRef(null); // last Gemini interaction id (history chain)
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioRef = useRef(null);

  // Focus the input as soon as the window opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Keep the newest bubble in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending, transcribing, open]);

  // Clean up mic/audio on unmount.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioRef.current?.pause();
    };
  }, []);

  /** Send a message through the normal chat flow (typed or transcribed). */
  const sendText = async (raw) => {
    const text = raw.trim();
    if (!text || sending) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text }]);
    setSending(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          message: text,
          interaction_id: interactionIdRef.current,
        }),
      });

      // Parse the body safely — Django/FastAPI errors come back as { detail }.
      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {}; // non-JSON body (e.g. Django's HTML 404) -> fall back to status
      }

      if (!res.ok) {
        throw new Error(data.detail || data.error || `Request failed (HTTP ${res.status}).`);
      }
      if (!data.reply) throw new Error('The assistant returned an empty reply.');

      // Chain the new id so the next turn continues the same conversation.
      interactionIdRef.current = data.interaction_id || interactionIdRef.current;
      setMessages((m) => [...m, { role: 'bot', text: data.reply }]);
    } catch (err) {
      const msg =
        err instanceof TypeError
          ? 'Cannot reach the server — make sure Django (port 8000) and FastAPI (port 8001) are running.'
          : err.message;
      setMessages((m) => [...m, { role: 'bot', text: `⚠️ ${msg}` }]);
    } finally {
      setSending(false);
    }
  };

  /** Send the typed input. */
  const send = () => sendText(input);

  // ---- Voice input (record -> transcribe -> send) ----
  const toggleRecording = async () => {
    if (recording) {
      recorderRef.current?.stop(); // onstop fires -> handleTranscribe
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mimeType });
        await handleTranscribe(blob);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: 'bot',
          text: `⚠️ Microphone unavailable — ${err.message || 'check browser permissions.'}`,
        },
      ]);
    }
  };

  const handleTranscribe = async (webmBlob) => {
    setRecording(false);
    setTranscribing(true);
    try {
      const wav = await blobToWav(webmBlob);
      const res = await fetch('/api/chat/transcribe', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          audio_base64: await blobToBase64(wav),
          mime_type: 'audio/wav',
        }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (!res.ok) throw new Error(data.detail || data.error || `Transcription failed (HTTP ${res.status}).`);
      const transcript = (data.transcript || '').trim();
      if (!transcript) throw new Error('No speech was recognized — try again.');
      await sendText(transcript); // keeps conversation history chaining
    } catch (err) {
      const msg =
        err instanceof TypeError
          ? 'Cannot reach the server — make sure Django (port 8000) and FastAPI (port 8001) are running.'
          : err.message;
      setMessages((m) => [...m, { role: 'bot', text: `⚠️ ${msg}` }]);
    } finally {
      setTranscribing(false);
    }
  };

  // ---- Voice output (read a bot reply aloud via Gemini TTS) ----
  const speak = async (message, index) => {
    if (speakingId === index) {
      audioRef.current?.pause();
      setSpeakingId(null);
      return;
    }
    try {
      const res = await fetch('/api/chat/speak', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ text: message.text }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (!res.ok) throw new Error(data.detail || data.error || `Speech failed (HTTP ${res.status}).`);

      const binary = atob(data.audio_base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: data.mime_type || 'audio/wav' }));

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setSpeakingId(null);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setSpeakingId(null);
      };
      setSpeakingId(index);
      await audio.play();
    } catch (err) {
      setMessages((m) => [...m, { role: 'bot', text: `⚠️ ${err.message}` }]);
    }
  };

  return (
    <>
      {/* Floating launcher — neon lime button with a dark icon */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close chat assistant' : 'Open chat assistant'}
        title="Campus Assistant"
        className="fixed bottom-6 right-6 z-50 grid h-14 w-14 place-items-center rounded-full bg-[#CCFF00] text-charcoal shadow-lg shadow-lime/40 transition hover:-translate-y-0.5 hover:shadow-xl"
      >
        {open ? <XIcon className="h-5 w-5" /> : <ChatIcon className="h-6 w-6" />}
      </button>

      {/* Chat window */}
      {open && (
        <div
          role="dialog"
          aria-label="Campus Assistant chat"
          className="chat-window fixed bottom-24 right-6 z-50 flex h-[480px] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-2xl shadow-black/10 animate-[popIn_.18s_ease] max-sm:bottom-20 max-sm:right-3 max-sm:h-[70vh] max-sm:w-[calc(100vw-1.5rem)] max-sm:max-h-[500px]"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-black/[0.05] bg-ink px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-lime text-charcoal">
                <ChatIcon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[13px] font-extrabold tracking-tight text-white">
                  Campus Assistant
                </p>
                <p className="flex items-center gap-1.5 text-[10.5px] font-semibold text-white/50">
                  <span className="h-1.5 w-1.5 rounded-full bg-lime" />
                  Powered by Gemini
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="grid h-7 w-7 place-items-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-3 overflow-y-auto bg-canvas/50 px-4 py-4">
            {messages.map((m, i) => (
              <div key={i} className="flex flex-col gap-1">
                <div
                  className={`flex items-end gap-1.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <p
                    className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-[12.5px] leading-relaxed text-gray-900 ${
                      m.role === 'user' ? 'bg-[#F3F4F6]' : 'bg-[#F4FCC8]'
                    }`}
                  >
                    {m.text}
                  </p>
                  {m.role === 'bot' && (
                    <button
                      type="button"
                      onClick={() => speak(m, i)}
                      title={speakingId === i ? 'Stop reading' : 'Read aloud'}
                      aria-label={speakingId === i ? 'Stop reading' : 'Read aloud'}
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border transition ${
                        speakingId === i
                          ? 'border-lime-deep/40 bg-lime text-charcoal'
                          : 'border-black/[0.08] bg-white text-gray-400 hover:text-lime-deep'
                      }`}
                    >
                      <VolumeIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <p className="max-w-[85%] rounded-xl bg-[#F4FCC8] px-3.5 py-2.5 text-[12.5px] text-gray-900">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:240ms]" />
                  </span>
                </p>
              </div>
            )}
            {transcribing && (
              <div className="flex justify-start">
                <p className="max-w-[85%] rounded-xl bg-[#F4FCC8] px-3.5 py-2.5 text-[12.5px] font-semibold text-gray-900">
                  🎙️ Transcribing your voice…
                </p>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex items-center gap-2 border-t border-black/[0.05] bg-white px-3 py-3"
          >
            {/* Voice input toggle */}
            <button
              type="button"
              onClick={toggleRecording}
              disabled={transcribing || sending}
              title={recording ? 'Stop recording' : 'Speak your question'}
              aria-label={recording ? 'Stop recording' : 'Speak your question'}
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition disabled:cursor-not-allowed disabled:opacity-40 ${
                recording
                  ? 'animate-pulse bg-rose-500 text-white shadow-sm shadow-rose-500/40'
                  : 'border border-black/[0.08] bg-white text-gray-500 hover:border-rose-200 hover:text-rose-500'
              }`}
            >
              <MicIcon className="h-4 w-4" />
            </button>

            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={recording ? 'Listening…' : 'Ask about routines, rooms, notices…'}
              className="h-10 flex-1 rounded-xl border border-black/[0.08] bg-white px-3.5 text-[12.5px] font-semibold text-charcoal placeholder:text-gray-300 outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40"
            />
            <button
              type="submit"
              disabled={sending || transcribing || !input.trim()}
              aria-label="Send message"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#CCFF00] text-charcoal shadow-sm shadow-lime/40 transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
            >
              <SendIcon className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
