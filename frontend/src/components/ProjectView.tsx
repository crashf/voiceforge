"use client";

import { useEffect, useState, useRef } from "react";
import {
  getProject, getVoices, createClip, generateClip, updateClip, deleteClip,
  getClipAudioUrl, getProjectExportUrl,
  type ProjectDetail, type ClipInfo, type VoiceSummary,
} from "@/lib/api";
import {
  Play, Pause, Download, Trash2, Plus, Loader, CheckCircle,
  AlertCircle, FileDown, RefreshCw, Pencil, Save, X,
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
  const [newVol, setNewVol] = useState(1.0);
  const [newPitch, setNewPitch] = useState(0);
  const [newSoundEffects, setNewSoundEffects] = useState("");
  const [newPronunciation, setNewPronunciation] = useState("");
  const [newLanguageBoost, setNewLanguageBoost] = useState("");
  const [newSubtitleEnable, setNewSubtitleEnable] = useState(false);
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editVoiceId, setEditVoiceId] = useState("");
  const [editEngine, setEditEngine] = useState("xtts");
  const [editSpeed, setEditSpeed] = useState(1.0);
  const [editVol, setEditVol] = useState(1.0);
  const [editPitch, setEditPitch] = useState(0);
  const [editSoundEffects, setEditSoundEffects] = useState("");
  const [editPronunciation, setEditPronunciation] = useState("");
  const [editLanguageBoost, setEditLanguageBoost] = useState("");
  const [editSubtitleEnable, setEditSubtitleEnable] = useState(false);
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
      vol: newVol,
      pitch: newPitch,
      sound_effects: newSoundEffects || undefined,
      pronunciation_dict: newPronunciation || undefined,
      language_boost: newLanguageBoost || undefined,
      subtitle_enable: newSubtitleEnable,
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
      // Fire generate — may take 30-120s for XTTS on CPU
      await generateClip(projectId, clipId);
    } catch (e) {
      console.error("Generate call failed (may still be processing):", e);
    }
    // Poll until the clip status is no longer "generating"
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const freshProject = await getProject(projectId);
        setProject(freshProject);
        const updated = freshProject.clips.find((c: ClipInfo) => c.id === clipId);
        if (updated && updated.status !== "generating") break;
      } catch { /* keep polling */ }
    }
    setGenerating((s) => { const n = new Set(s); n.delete(clipId); return n; });
  };

  const handleGenerateAll = async () => {
    if (!project) return;
    const pending = project.clips.filter((c) => c.status === "pending" || c.status === "error");
    for (const clip of pending) {
      await handleGenerate(clip.id);
    }
  };

  const handleStartEdit = (clip: ClipInfo) => {
    setEditingId(clip.id);
    setEditTitle(clip.title);
    setEditText(clip.text);
    setEditVoiceId(clip.voice_id || "");
    setEditEngine(clip.engine || "xtts");
    setEditSpeed(clip.speed || 1.0);
    setEditVol((clip as any).vol || 1.0);
    setEditPitch((clip as any).pitch || 0);
    setEditSoundEffects((clip as any).sound_effects || "");
    setEditPronunciation((clip as any).pronunciation_dict || "");
    setEditLanguageBoost((clip as any).language_boost || "");
    setEditSubtitleEnable((clip as any).subtitle_enable || false);
  };

  const handleSaveEdit = async (clipId: string) => {
    if (!projectId) return;
    await updateClip(projectId, clipId, { 
      title: editTitle, 
      text: editText, 
      voice_id: editVoiceId || undefined, 
      engine: editEngine, 
      speed: editSpeed,
      vol: editVol,
      pitch: editPitch,
      sound_effects: editSoundEffects || undefined,
      pronunciation_dict: editPronunciation || undefined,
      language_boost: editLanguageBoost || undefined,
      subtitle_enable: editSubtitleEnable,
    });
    setEditingId(null);
    await load();
  };

  const handleCancelEdit = () => {
    setEditingId(null);
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
            className="w-full px-3 py-2 rounded border text-sm outline-none mb-2 resize-y"
            style={{ background: "var(--bg-tertiary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
          />
          <details className="mb-3">
            <summary className="text-xs cursor-pointer" style={{ color: "var(--accent)" }}>
              Text shortcuts — click to expand
            </summary>
            <div className="mt-2 p-3 rounded text-xs" style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
              <div className="grid grid-cols-2 gap-4 mb-2">
                <div>
                  <strong style={{ color: "var(--text-primary)" }}>Pauses</strong><br/>
                  &lt;#0.5#&gt; = 0.5s pause<br/>
                  &lt;#1#&gt; = 1s pause<br/>
                  &lt;#2#&gt; = 2s pause<br/>
                  (range: 0.01 - 99.99)
                </div>
                <div>
                  <strong style={{ color: "var(--text-primary)" }}>Interjections</strong><br/>
                  (laughs), (chuckle), (coughs), (clears-throat)<br/>
                  (groans), (breath), (pant), (inhale), (exhale)<br/>
                  (gasps), (sniffs), (sighs), (snorts), (burps)<br/>
                  (lip-smacking), (humming), (hissing), (emm), (sneezes)
                </div>
              </div>
              <div style={{ color: "var(--text-primary)" }}>Example: Hello&amp;#123;#1#&amp;#125;(sighs), welcome to our service.</div>
            </div>
          </details>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <label className="text-xs block mb-1" style={{ color: "var(--text-secondary)" }}>Voice</label>
              <select
                value={newVoiceId}
                onChange={(e) => setNewVoiceId(e.target.value)}
                className="w-full px-3 py-2 rounded border text-sm outline-none"
                style={{ background: "var(--bg-tertiary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
              >
                <option value="">Default Voice</option>
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>{v.name} ({v.engine})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: "var(--text-secondary)" }}>Engine</label>
              <select
                value={newEngine}
                onChange={(e) => setNewEngine(e.target.value)}
                className="w-full px-3 py-2 rounded border text-sm outline-none"
                style={{ background: "var(--bg-tertiary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
              >
                <option value="xtts">XTTS v2 (Local)</option>
                <option value="openai">OpenAI TTS</option>
                <option value="minimax">MiniMax (Cloud)</option>
                <option value="ollama">Ollama</option>
              </select>
            </div>
          </div>
          
          {/* Sliders row */}
          <div className="grid grid-cols-3 gap-4 mb-3">
            <div className="flex items-center gap-2">
              <label className="text-sm whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>Speed</label>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.1}
                value={newSpeed}
                onChange={(e) => setNewSpeed(parseFloat(e.target.value))}
                className="flex-1"
              />
              <span className="text-sm w-8 text-right">{newSpeed}x</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>Vol</label>
              <input
                type="range"
                min={0.1}
                max={2.0}
                step={0.1}
                value={newVol}
                onChange={(e) => setNewVol(parseFloat(e.target.value))}
                className="flex-1"
              />
              <span className="text-sm w-8 text-right">{newVol.toFixed(1)}</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>Pitch</label>
              <input
                type="range"
                min={-12}
                max={12}
                step={1}
                value={newPitch}
                onChange={(e) => setNewPitch(parseInt(e.target.value))}
                className="flex-1"
              />
              <span className="text-sm w-8 text-right">{newPitch}</span>
            </div>
          </div>
          
          {/* Second row of controls */}
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <label className="text-xs block mb-1" style={{ color: "var(--text-secondary)" }}>Sound Effects</label>
              <select
                value={newSoundEffects}
                onChange={(e) => setNewSoundEffects(e.target.value)}
                className="w-full px-3 py-2 rounded border text-sm outline-none"
                style={{ background: "var(--bg-tertiary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
              >
                <option value="">No Effect</option>
                <option value="spacious_echo">Spacious Echo</option>
                <option value="radio">Radio</option>
                <option value="phone">Phone</option>
                <option value="演唱会">Concert Hall</option>
                <option value="录音棚">Recording Studio</option>
              </select>
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: "var(--text-secondary)" }}>Language Boost</label>
              <select
                value={newLanguageBoost}
                onChange={(e) => setNewLanguageBoost(e.target.value)}
                className="w-full px-3 py-2 rounded border text-sm outline-none"
                style={{ background: "var(--bg-tertiary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
              >
                <option value="">Auto Lang</option>
                <option value="English">English</option>
                <option value="Chinese">Chinese</option>
                <option value="Spanish">Spanish</option>
                <option value="French">French</option>
                <option value="German">German</option>
                <option value="Japanese">Japanese</option>
                <option value="Korean">Korean</option>
              </select>
            </div>
          </div>
          
          {/* Pronunciation and subtitles */}
          <div className="flex items-center gap-4 mb-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-primary)" }}>
              <input
                type="checkbox"
                checked={newSubtitleEnable}
                onChange={(e) => setNewSubtitleEnable(e.target.checked)}
                className="w-4 h-4"
              />
              Subtitles
            </label>
          </div>
          <input
            value={newPronunciation}
            onChange={(e) => setNewPronunciation(e.target.value)}
            placeholder="Pronunciation dict (e.g., API/a-p-i,hello/həˈloʊ)"
            className="w-full px-3 py-2 rounded border text-sm outline-none mb-3"
            style={{ background: "var(--bg-tertiary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
          />
          <button
            onClick={handleAddClip}
            className="px-4 py-2 rounded font-medium text-sm cursor-pointer"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Add Clip
          </button>
          <button
            onClick={() => setShowAdd(false)}
            className="px-4 py-2 rounded font-medium text-sm cursor-pointer ml-2"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}
          >
            Cancel
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
              {editingId === clip.id ? (
                <div className="space-y-3 p-3 rounded-lg border" style={{ background: "var(--bg-tertiary)", borderColor: "var(--border)" }}>
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full text-sm font-medium px-3 py-2 rounded border"
                    style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                    placeholder="Title"
                  />
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={4}
                    className="w-full text-sm px-3 py-2 rounded border resize-y"
                    style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                    placeholder="Text to speak..."
                  />
                  <details>
                    <summary className="text-sm cursor-pointer" style={{ color: "var(--accent)" }}>
                      Text shortcuts — click to expand
                    </summary>
                    <div className="mt-2 p-3 rounded text-sm" style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
                      <div className="grid grid-cols-2 gap-4 mb-2">
                        <div>
                          <strong style={{ color: "var(--text-primary)" }}>Pauses</strong><br/>
                          &lt;#0.5#&gt; = 0.5s<br/>
                          &lt;#1#&gt; = 1s<br/>
                          &lt;#2#&gt; = 2s
                        </div>
                        <div>
                          <strong style={{ color: "var(--text-primary)" }}>Interjections</strong><br/>
                          (laughs), (sighs), (coughs), (breath)<br/>
                          (clears-throat), (sniffs), (gasps), (emm)
                        </div>
                      </div>
                      <div style={{ color: "var(--text-primary)" }}>Example: Hello&amp;#123;#1#&amp;#125;(sighs), welcome!</div>
                    </div>
                  </details>
                  <div className="grid grid-cols-2 gap-4">
                    <select
                      value={editVoiceId}
                      onChange={(e) => setEditVoiceId(e.target.value)}
                      className="px-3 py-2 rounded border text-sm outline-none"
                      style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                    >
                      <option value="">Default Voice</option>
                      {voices.map((v) => (
                        <option key={v.id} value={v.id}>{v.name} ({v.engine})</option>
                      ))}
                    </select>
                    <select
                      value={editEngine}
                      onChange={(e) => setEditEngine(e.target.value)}
                      className="px-3 py-2 rounded border text-sm outline-none"
                      style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                    >
                      <option value="xtts">XTTS v2 (Local)</option>
                      <option value="minimax">MiniMax (Cloud)</option>
                      <option value="openai">OpenAI TTS</option>
                      <option value="ollama">Ollama</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="flex items-center gap-2">
                      <label className="text-sm whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>Speed</label>
                      <input
                        type="range" min={0.5} max={2.0} step={0.1}
                        value={editSpeed}
                        onChange={(e) => setEditSpeed(parseFloat(e.target.value))}
                        className="flex-1"
                      />
                      <span className="text-sm w-8">{editSpeed}x</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-sm whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>Vol</label>
                      <input
                        type="range" min={0.1} max={2.0} step={0.1}
                        value={editVol}
                        onChange={(e) => setEditVol(parseFloat(e.target.value))}
                        className="flex-1"
                      />
                      <span className="text-sm w-8">{editVol.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-sm whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>Pitch</label>
                      <input
                        type="range" min={-12} max={12} step={1}
                        value={editPitch}
                        onChange={(e) => setEditPitch(parseInt(e.target.value))}
                        className="flex-1"
                      />
                      <span className="text-sm w-8">{editPitch}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <select
                      value={editSoundEffects}
                      onChange={(e) => setEditSoundEffects(e.target.value)}
                      className="px-3 py-2 rounded border text-sm outline-none"
                      style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                    >
                      <option value="">No Effect</option>
                      <option value="spacious_echo">Spacious Echo</option>
                      <option value="radio">Radio</option>
                      <option value="phone">Phone</option>
                      <option value="演唱会">Concert Hall</option>
                      <option value="录音棚">Recording Studio</option>
                    </select>
                    <select
                      value={editLanguageBoost}
                      onChange={(e) => setEditLanguageBoost(e.target.value)}
                      className="px-3 py-2 rounded border text-sm outline-none"
                      style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                    >
                      <option value="">Auto Lang</option>
                      <option value="English">English</option>
                      <option value="Chinese">Chinese</option>
                      <option value="Spanish">Spanish</option>
                      <option value="French">French</option>
                      <option value="German">German</option>
                      <option value="Japanese">Japanese</option>
                      <option value="Korean">Korean</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-primary)" }}>
                      <input
                        type="checkbox"
                        checked={editSubtitleEnable}
                        onChange={(e) => setEditSubtitleEnable(e.target.checked)}
                        className="w-4 h-4"
                      />
                      Subtitles
                    </label>
                  </div>
                  <input
                    value={editPronunciation}
                    onChange={(e) => setEditPronunciation(e.target.value)}
                    placeholder="Pronunciation dict (e.g., API/a-p-i)"
                    className="w-full px-3 py-2 rounded border text-sm outline-none"
                    style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSaveEdit(clip.id)}
                      className="px-4 py-2 rounded font-medium text-sm cursor-pointer"
                      style={{ background: "var(--success)", color: "#fff" }}
                    >
                      Save Changes
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="px-4 py-2 rounded font-medium text-sm cursor-pointer"
                      style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="font-medium text-sm truncate">{clip.title}</div>
                  <div className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                    {clip.text.slice(0, 100)}{clip.text.length > 100 ? "..." : ""}
                  </div>
                </>
              )}
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
              {editingId === clip.id ? (
                null
              ) : (
                <>
                  <button
                    onClick={() => handleStartEdit(clip)}
                    className="p-1.5 rounded hover:brightness-125 cursor-pointer"
                    style={{ color: "var(--text-secondary)" }}
                    title="Edit"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleGenerate(clip.id)}
                    disabled={generating.has(clip.id)}
                    className="p-1.5 rounded hover:brightness-125 cursor-pointer disabled:opacity-50"
                    style={{ color: "var(--success)" }}
                    title={clip.status === "done" ? "Regenerate" : "Generate"}
                  >
                    {generating.has(clip.id) ? <Loader size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  </button>
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
                </>
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
