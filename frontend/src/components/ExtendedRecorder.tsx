"use client";

import { useState, useRef, useEffect } from "react";
import { Mic, Square, Play, Pause, Trash2, Check, Clock } from "lucide-react";

interface Props {
  onRecordingComplete: (file: File) => void;
  minSeconds?: number;
  maxSeconds?: number;
  label?: string;
}

const TALKING_PROMPTS = [
  "Tell me about your work — what do you do, and what's a typical day like?",
  "Describe your favorite vacation or trip. What made it memorable?",
  "If you had to explain your company to someone at a party, what would you say?",
  "What's a hobby or interest you're passionate about? Why do you love it?",
  "Tell a funny story — something that happened recently that made you laugh.",
  "What's a piece of advice you'd give to someone starting in your field?",
  "Describe your ideal weekend. What does it look like from start to finish?",
  "Talk about a technology or tool that changed the way you work.",
];

export default function ExtendedRecorder({
  onRecordingComplete,
  minSeconds = 120,
  maxSeconds = 300,
  label,
}: Props) {
  const [state, setState] = useState<"idle" | "recording" | "recorded">("idle");
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [prompt, setPrompt] = useState("");
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const audioUrl = useRef<string | null>(null);
  const audioEl = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animRef = useRef<number>(undefined);

  useEffect(() => {
    setPrompt(TALKING_PROMPTS[Math.floor(Math.random() * TALKING_PROMPTS.length)]);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const shufflePrompt = () => {
    setPrompt(TALKING_PROMPTS[Math.floor(Math.random() * TALKING_PROMPTS.length)]);
  };

  const drawWaveform = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d")!;
    const bufLen = analyser.frequencyBinCount;
    const data = new Uint8Array(bufLen);

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(data);
      ctx.fillStyle = "#1a1a23";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = duration >= minSeconds ? "#00b894" : "#6c5ce7";
      ctx.beginPath();
      const sliceWidth = canvas.width / bufLen;
      let x = 0;
      for (let i = 0; i < bufLen; i++) {
        const v = data[i] / 128.0;
        const y = (v * canvas.height) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };
    draw();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
          sampleRate: 44100,
        },
      });
      streamRef.current = stream;
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunks.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      recorder.onstop = () => {
        const actualType = mimeType || "audio/webm";
        const blob = new Blob(chunks.current, { type: actualType });
        if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
        audioUrl.current = URL.createObjectURL(blob);

        // Quick volume check — read a small chunk to verify audio isn't silent
        const testAudio = new AudioContext();
        blob.arrayBuffer().then((buf) => {
          testAudio.decodeAudioData(buf).then((decoded) => {
            const data = decoded.getChannelData(0);
            let peak = 0;
            for (let i = 0; i < data.length; i++) {
              const abs = Math.abs(data[i]);
              if (abs > peak) peak = abs;
            }
            if (peak < 0.01) {
              alert("Warning: Recording appears to be silent. Your microphone may not be working properly. Try using Upload Files instead.");
            }
            testAudio.close();
          }).catch(() => {});
        });

        setState("recorded");
        stream.getTracks().forEach((t) => t.stop());
        if (animRef.current) cancelAnimationFrame(animRef.current);
      };

      recorder.start();
      mediaRecorder.current = recorder;
      setState("recording");
      setDuration(0);
      timerRef.current = setInterval(() => {
        setDuration((d) => {
          if (d + 1 >= maxSeconds) {
            recorder.stop();
            clearInterval(timerRef.current!);
          }
          return d + 1;
        });
      }, 1000);
      drawWaveform();
    } catch {
      alert("Microphone access is required. Please allow it in your browser settings.");
    }
  };

  const stopRecording = () => {
    mediaRecorder.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const playRecording = () => {
    if (!audioUrl.current) return;
    if (playing) {
      audioEl.current?.pause();
      setPlaying(false);
      return;
    }
    const audio = new Audio(audioUrl.current);
    audio.onended = () => setPlaying(false);
    audio.play();
    audioEl.current = audio;
    setPlaying(true);
  };

  const acceptRecording = async () => {
    if (!audioUrl.current) return;
    const response = await fetch(audioUrl.current);
    const blob = await response.blob();
    const ext = blob.type.includes("webm") ? "webm" : "wav";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = new File([blob], `extended-${timestamp}.${ext}`, { type: blob.type });
    onRecordingComplete(file);
    discardRecording();
  };

  const discardRecording = () => {
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = null;
    chunks.current = [];
    setState("idle");
    setDuration(0);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const pct = Math.min(100, (duration / minSeconds) * 100);

  return (
    <div className="rounded-lg border p-5" style={{ background: "var(--bg-tertiary)", borderColor: "var(--border)" }}>
      {label && <h3 className="text-sm font-semibold mb-1">{label}</h3>}

      {/* Instructions */}
      {state === "idle" && (
        <div className="mb-4">
          <div className="rounded-lg p-4 mb-3 border" style={{ background: "#1a1a2e", borderColor: "var(--accent)" }}>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--accent)" }}>
              💬 Talk about this (or anything you want):
            </p>
            <p className="text-sm leading-relaxed mb-2">{prompt}</p>
            <button
              onClick={shufflePrompt}
              className="text-xs cursor-pointer underline"
              style={{ color: "var(--text-secondary)" }}
            >
              ↻ Different topic
            </button>
          </div>
          <div className="flex items-start gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
            <span>💡</span>
            <div>
              <p className="mb-1"><strong>Tips for best results:</strong></p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Just talk naturally — like a phone call or meeting</li>
                <li>Aim for <strong>2-3 minutes</strong> minimum</li>
                <li>Quiet room, consistent mic distance</li>
                <li>Vary your tone — don&apos;t monotone-read</li>
                <li>It&apos;s OK to pause and think — just keep going</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Waveform */}
      {state === "recording" && (
        <div className="mb-3">
          <canvas
            ref={canvasRef}
            width={500}
            height={60}
            className="w-full rounded mb-2"
            style={{ background: "var(--bg-secondary)" }}
          />
          {/* Progress bar */}
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-secondary)" }}>
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${pct}%`,
                background: pct >= 100 ? "var(--success)" : "var(--accent)",
              }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {pct < 100 ? `${formatTime(minSeconds - duration)} until minimum` : "✓ Enough recorded!"}
            </span>
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Max {formatTime(maxSeconds)}
            </span>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3">
        {state === "idle" && (
          <button
            onClick={startRecording}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors"
            style={{ background: "var(--danger)", color: "#fff" }}
          >
            <Mic size={18} /> Start Extended Recording
          </button>
        )}

        {state === "recording" && (
          <>
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
              style={{
                background: duration >= minSeconds ? "var(--success)" : "var(--danger)",
                color: "#fff",
                animation: duration < minSeconds ? "pulse 2s infinite" : undefined,
              }}
            >
              <Square size={16} /> {duration >= minSeconds ? "Finish Recording" : "Stop Early"}
            </button>
            <div className="flex items-center gap-2">
              <Clock size={14} style={{ color: duration >= minSeconds ? "var(--success)" : "var(--danger)" }} />
              <span
                className="text-lg tabular-nums font-mono font-bold"
                style={{ color: duration >= minSeconds ? "var(--success)" : "var(--danger)" }}
              >
                {formatTime(duration)}
              </span>
            </div>
            {duration < minSeconds && duration > 10 && (
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Keep going! You&apos;re doing great 🎙️
              </span>
            )}
          </>
        )}

        {state === "recorded" && (
          <>
            <button
              onClick={playRecording}
              className="p-2 rounded-lg cursor-pointer"
              style={{ background: "var(--bg-secondary)" }}
            >
              {playing
                ? <Pause size={16} style={{ color: "var(--accent)" }} />
                : <Play size={16} style={{ color: "var(--accent)" }} />}
            </button>
            <span className="text-sm font-medium">
              {formatTime(duration)} recorded
              {duration >= minSeconds && (
                <span className="ml-2" style={{ color: "var(--success)" }}>✓ Great length!</span>
              )}
              {duration < minSeconds && (
                <span className="ml-2 text-xs" style={{ color: "var(--warning, #f0932b)" }}>
                  (shorter than recommended)
                </span>
              )}
            </span>
            <div className="flex-1" />
            <button
              onClick={acceptRecording}
              className="flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
              style={{ background: "var(--success)", color: "#fff" }}
            >
              <Check size={14} /> Use This Recording
            </button>
            <button
              onClick={discardRecording}
              className="flex items-center gap-1 px-3 py-2 rounded text-sm cursor-pointer"
              style={{ color: "var(--danger)" }}
            >
              <Trash2 size={14} /> Redo
            </button>
          </>
        )}
      </div>
    </div>
  );
}
