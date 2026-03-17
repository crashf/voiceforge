"use client";

import { useState, useRef, useEffect } from "react";
import { Mic, Square, Play, Pause, Trash2, Check } from "lucide-react";

interface Props {
  onRecordingComplete: (file: File) => void;
  label?: string;
}

export default function AudioRecorder({ onRecordingComplete, label }: Props) {
  const [state, setState] = useState<"idle" | "recording" | "recorded">("idle");
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const audioUrl = useRef<string | null>(null);
  const audioEl = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Visualizer
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animRef = useRef<number>();

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

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
      ctx.strokeStyle = "#6c5ce7";
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
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 },
      });
      streamRef.current = stream;

      // Set up analyser for visualizer
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Pick a supported mime type
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
        setState("recorded");
        stream.getTracks().forEach((t) => t.stop());
        if (animRef.current) cancelAnimationFrame(animRef.current);
      };

      // Don't use timeslice — collect all data at stop for reliability
      recorder.start();
      mediaRecorder.current = recorder;
      setState("recording");
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);

      drawWaveform();
    } catch (err) {
      console.error("Microphone access denied:", err);
      alert("Microphone access is required for recording. Please allow it in your browser settings.");
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
    // Fetch the blob from the object URL to ensure we get the complete recording
    const response = await fetch(audioUrl.current);
    const blob = await response.blob();
    const ext = blob.type.includes("webm") ? "webm" : blob.type.includes("ogg") ? "ogg" : "wav";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = new File([blob], `recording-${timestamp}.${ext}`, { type: blob.type });
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

  return (
    <div className="rounded-lg border p-4" style={{ background: "var(--bg-tertiary)", borderColor: "var(--border)" }}>
      {label && <p className="text-sm font-medium mb-3">{label}</p>}

      {/* Waveform visualizer */}
      {state === "recording" && (
        <canvas
          ref={canvasRef}
          width={400}
          height={60}
          className="w-full rounded mb-3"
          style={{ background: "var(--bg-secondary)" }}
        />
      )}

      <div className="flex items-center gap-3">
        {state === "idle" && (
          <button
            onClick={startRecording}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors"
            style={{ background: "var(--danger)", color: "#fff" }}
          >
            <Mic size={16} /> Start Recording
          </button>
        )}

        {state === "recording" && (
          <>
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer animate-pulse"
              style={{ background: "var(--danger)", color: "#fff" }}
            >
              <Square size={16} /> Stop
            </button>
            <span className="text-sm tabular-nums font-mono" style={{ color: "var(--danger)" }}>
              ● {formatTime(duration)}
            </span>
            {duration >= 30 && (
              <span className="text-xs" style={{ color: "var(--success)" }}>✓ Good length</span>
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
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {formatTime(duration)} recorded
            </span>
            <div className="flex-1" />
            <button
              onClick={acceptRecording}
              className="flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium cursor-pointer"
              style={{ background: "var(--success)", color: "#fff" }}
            >
              <Check size={14} /> Use This
            </button>
            <button
              onClick={discardRecording}
              className="flex items-center gap-1 px-3 py-1.5 rounded text-sm cursor-pointer"
              style={{ color: "var(--danger)" }}
            >
              <Trash2 size={14} /> Discard
            </button>
          </>
        )}
      </div>
    </div>
  );
}
