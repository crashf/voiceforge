"use client";

import { useEffect, useState, useRef } from "react";
import {
  getProject, getVoices, createClip, generateClip, deleteClip,
  getClipAudioUrl, getProjectExportUrl,
  type ProjectDetail, type ClipInfo, type VoiceSummary,
} from "@/lib/api";
import {
  Play, Pause, Download, Trash2, Plus, Loader, CheckCircle,
  AlertCircle, FileDown, RefreshCw,
} from "lucide-react";

interface Props {
  projectId: string | null;
}

export default function ProjectView({ projectId }: Props) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [voices, setVoices] = useState<VoiceSummary[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newText, setNewText] = useState("");
  const [newVoiceId, setNewVoiceId] = useState("");
  const [newEngine, setNewEngine] = useState("xtts");
  const [newSpeed, setNewSpeed] = useState(1.0);
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = async () => {
    if (!projectId) return;
    const [p, v] = await Promise.all([getProject(projectId), getVoices()]);
    setProject(p);
    setVoices(v);
  };

  useEffect(() => {
    setProject(null);
    if (projectId) load();
  }, [projectId]);

  const handleAddClip = async () => {
    if (!projectId || !newTitle.trim() || !newText.trim()) return;
    await createClip(projectId, {
      title: newTitle,
      text: newText,
      voice_id: newVoiceId || undefined,
      engine: newEngine,
      speed: newSpeed,
    });
    setNewTitle("");
    setNewText("");
    setShowAdd(false);
    await load();
  };

  const handleGenerate = async (clipId: string) => {
    if (!projectId) return;
    setGenerating((s) => new Set(s).add(clipId));
    // Optimistically clear error so UI shows "generating" immediately
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        clips: prev.clips.map((c) =>
          c.id === clipId ? { ...c, status: "generating", error_message: null } : c
        ),
      };
    });
    try {
      await generateClip(projectId, clipId);
      await load();
    } catch (e) {
      console.error(e);
      await load(); // Reload to get the actual error from backend
    } finally {
      setGenerating((s) => { const n = new Set(s); n.delete(clipId); return n; });
    }
  };

  const handleGenerateAll = async () => {
    if (!project) return;
    const pending = project.clips.filter((c) => c.status === "pending" || c.status === "error");
    for (const clip of pending) {
      await handleGenerate(clip.id);
    }
  };

  const handlePlay = (clip: ClipInfo) => {
    if (!projectId) return;
    if (playingId === clip.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(getClipAudioUrl(projectId, clip.id));
    audio.onended = () => setPlayingId(null);
    audio.play();
    audioRef.current = audio;
    setPlayingId(clip.id);
  };

  const handleDeleteClip = async (clipId: string) => {
    if (!projectId || !confirm("Delete this clip?")) return;
    await deleteClip(projectId, clipId);
    await load();
  };

  const formatDuration = (s: number | null) => {
    if (!s) return "—";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const statusIcon = (status: string, errorMsg?: string | null) => {
    switch (status) {
      case "done": return <span title="Generated successfully"><CheckCircle size={14} style={{ color: "var(--success)" }} /></span>;
      case "error": return (
        <span title={errorMsg || "Generation failed"} className="cursor-help">
          <AlertCircle size={14} style={{ color: "var(--danger)" }} />
        </span>
      );
      case "generating": return <Loader size={14} className="animate-spin" style={{ color: "var(--warning)" }} />;
      default: return <div className="w-3.5 h-3.5 rounded-full" style={{ background: "var(--text-secondary)", opacity: 0.3 }} title="Pending — click generate" />;
    }
  };

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-xl font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            Select a project or create a new one
          </h2>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Use the sidebar to get started
          </p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader className="animate-spin" style={{ color: "var(--accent)" }} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          {project.client_name && (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{project.client_name}</p>
          )}
          {project.description && (
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{project.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {project.clips.some((c) => c.status === "done") && (
            <a
              href={getProjectExportUrl(project.id)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}
            >
              <FileDown size={16} /> Export ZIP
            </a>
          )}
          {project.clips.some((c) => c.status === "pending" || c.status === "error") && (
            <button
              onClick={handleGenerateAll}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer"
              style={{ background: "var(--success)", color: "#fff" }}
            >
              <RefreshCw size={16} /> Generate All
            </button>
          )}
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm cursor-pointer"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            <Plus size={16} /> Add Clip
          </button>
        </div>
      </div>

      {/* Add clip form */}
      {showAdd && (
        <div className="rounded-lg p-4 mb-6 border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}>
          <h3 className="font-medium mb-3">New Clip</h3>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Clip title (e.g., Main Greeting)"
            className="w-full px-3 py-2 rounded border text-sm outline-none mb-3"
            style={{ background: "var(--bg-tertiary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
          />
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Enter the script text to be spoken..."
            rows={4}
            className="w-full px-3 py-2 rounded border text-sm outline-none mb-3 resize-y"
            style={{ background: "var(--bg-tertiary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
          />
          <div className="grid grid-cols-3 gap-3 mb-3">
            <select
              value={newVoiceId}
              onChange={(e) => setNewVoiceId(e.target.value)}
              className="px-3 py-2 rounded border text-sm outline-none"
              style={{ background: "var(--bg-tertiary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            >
              <option value="">Default Voice</option>
              {voices.map((v) => (
                <option key={v.id} value={v.id}>{v.name} ({v.engine})</option>
              ))}
            </select>
            <select
              value={newEngine}
              onChange={(e) => setNewEngine(e.target.value)}
              className="px-3 py-2 rounded border text-sm outline-none"
              style={{ background: "var(--bg-tertiary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            >
              <option value="xtts">XTTS v2 (Local)</option>
              <option value="openai">OpenAI TTS</option>
              <option value="elevenlabs">ElevenLabs</option>
              <option value="ollama">Ollama</option>
            </select>
            <div className="flex items-center gap-2">
              <label className="text-sm" style={{ color: "var(--text-secondary)" }}>Speed</label>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.1}
                value={newSpeed}
                onChange={(e) => setNewSpeed(parseFloat(e.target.value))}
                className="flex-1"
              />
              <span className="text-sm w-8">{newSpeed}x</span>
            </div>
          </div>
          <button
            onClick={handleAddClip}
            className="px-4 py-2 rounded font-medium text-sm cursor-pointer"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Add Clip
          </button>
        </div>
      )}

      {/* Clips table */}
      <div className="space-y-2">
        {project.clips.map((clip) => (
          <div
            key={clip.id}
            className="flex items-center gap-4 p-3 rounded-lg border transition-colors"
            style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
          >
            {/* Status */}
            {statusIcon(generating.has(clip.id) ? "generating" : clip.status, clip.error_message)}

            {/* Play button */}
            <button
              onClick={() => handlePlay(clip)}
              disabled={clip.status !== "done"}
              className="p-2 rounded-full transition-colors disabled:opacity-30 cursor-pointer"
              style={{ background: "var(--bg-tertiary)" }}
            >
              {playingId === clip.id
                ? <Pause size={16} style={{ color: "var(--accent)" }} />
                : <Play size={16} style={{ color: "var(--accent)" }} />
              }
            </button>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{clip.title}</div>
              <div className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                {clip.text.slice(0, 100)}{clip.text.length > 100 ? "..." : ""}
              </div>
              {clip.status === "error" && clip.error_message && (
                <div className="text-xs mt-1 flex items-center gap-1" style={{ color: "var(--danger)" }}>
                  <AlertCircle size={10} /> {clip.error_message}
                </div>
              )}
            </div>

            {/* Duration */}
            <span className="text-sm tabular-nums" style={{ color: "var(--text-secondary)" }}>
              {formatDuration(clip.duration_seconds)}
            </span>

            {/* Size */}
            <span className="text-xs w-16 text-right" style={{ color: "var(--text-secondary)" }}>
              {formatSize(clip.file_size_bytes)}
            </span>

            {/* Actions */}
            <div className="flex items-center gap-1">
              {clip.status !== "done" && (
                <button
                  onClick={() => handleGenerate(clip.id)}
                  disabled={generating.has(clip.id)}
                  className="p-1.5 rounded hover:brightness-125 cursor-pointer disabled:opacity-50"
                  style={{ color: "var(--success)" }}
                  title="Generate"
                >
                  {generating.has(clip.id) ? <Loader size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                </button>
              )}
              {clip.status === "done" && projectId && (
                <a
                  href={getClipAudioUrl(projectId, clip.id)}
                  download={`${clip.title}.${clip.output_format}`}
                  className="p-1.5 rounded hover:brightness-125 cursor-pointer"
                  style={{ color: "var(--accent)" }}
                  title="Download"
                >
                  <Download size={16} />
                </a>
              )}
              <button
                onClick={() => handleDeleteClip(clip.id)}
                className="p-1.5 rounded hover:brightness-125 cursor-pointer"
                style={{ color: "var(--danger)" }}
                title="Delete"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}

        {project.clips.length === 0 && (
          <div className="text-center py-12 rounded-lg border"
            style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}>
            <p className="text-lg mb-2" style={{ color: "var(--text-secondary)" }}>No clips yet</p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Add a clip to start generating audio
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
