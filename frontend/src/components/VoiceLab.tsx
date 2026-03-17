"use client";

import { useEffect, useState, useRef } from "react";
import { getVoices, getVoice, createVoice, cloneVoice, deleteVoice, type VoiceSummary, type VoiceDetail } from "@/lib/api";
import { Mic, Upload, Trash2, Plus, CheckCircle, AlertCircle } from "lucide-react";
import AudioRecorder from "./AudioRecorder";
import VoiceCloneGuide, { GUIDED_PROMPTS, type GuidedPrompt } from "./VoiceCloneGuide";

export default function VoiceLab() {
  const [voices, setVoices] = useState<VoiceSummary[]>([]);
  const [selected, setSelected] = useState<VoiceDetail | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newEngine, setNewEngine] = useState("xtts");

  // Clone state
  const [cloneFiles, setCloneFiles] = useState<File[]>([]);
  const [cloning, setCloning] = useState(false);
  const [cloneStatus, setCloneStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Guided recording state
  const [activePrompt, setActivePrompt] = useState<GuidedPrompt | null>(null);
  const [completedPromptIds, setCompletedPromptIds] = useState<Set<string>>(new Set());
  const [inputMode, setInputMode] = useState<"record" | "upload">("record");

  const load = () => getVoices().then(setVoices).catch(console.error);
  useEffect(() => { load(); }, []);

  const handleCreateVoice = async () => {
    if (!newName.trim()) return;
    const fd = new FormData();
    fd.append("name", newName);
    fd.append("description", newDesc);
    fd.append("engine", newEngine);
    const result = await createVoice(fd);
    setNewName("");
    setNewDesc("");
    setShowCreate(false);
    await load();
    const detail = await getVoice(result.id);
    setSelected(detail);
    // Reset clone state for new voice
    setCloneFiles([]);
    setCompletedPromptIds(new Set());
    setActivePrompt(null);
    setCloneStatus(null);
  };

  const handleRecordingComplete = (file: File) => {
    setCloneFiles((prev) => [...prev, file]);
    if (activePrompt) {
      setCompletedPromptIds((prev) => new Set(prev).add(activePrompt.id));
      // Auto-advance to next incomplete prompt
      const nextPrompt = GUIDED_PROMPTS.find(
        (p) => p.id !== activePrompt.id && !completedPromptIds.has(p.id)
      );
      setActivePrompt(nextPrompt || null);
    }
  };

  const handleFileUpload = (files: FileList | null) => {
    if (!files) return;
    const newFiles = Array.from(files);
    setCloneFiles((prev) => [...prev, ...newFiles]);
  };

  const removeFile = (index: number) => {
    setCloneFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClone = async () => {
    if (!selected || cloneFiles.length === 0) return;
    setCloning(true);
    setCloneStatus(null);
    try {
      await cloneVoice(selected.id, cloneFiles);
      setCloneStatus("success");
      setCloneFiles([]);
      setCompletedPromptIds(new Set());
      const detail = await getVoice(selected.id);
      setSelected(detail);
      await load();
    } catch (e: any) {
      setCloneStatus(e.message || "Clone failed");
    } finally {
      setCloning(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this voice?")) return;
    await deleteVoice(id);
    if (selected?.id === id) setSelected(null);
    await load();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mic style={{ color: "var(--accent)" }} /> Voice Lab
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Create voice profiles, record or upload samples, and clone voices.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          <Plus size={16} /> New Voice
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-lg p-4 mb-6 border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}>
          <h3 className="font-medium mb-3">Create Voice Profile</h3>
          <div className="grid grid-cols-2 gap-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Voice name (e.g., Jasmine)"
              className="px-3 py-2 rounded border text-sm outline-none"
              style={{ background: "var(--bg-tertiary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            />
            <select
              value={newEngine}
              onChange={(e) => setNewEngine(e.target.value)}
              className="px-3 py-2 rounded border text-sm outline-none"
              style={{ background: "var(--bg-tertiary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            >
              <option value="xtts">XTTS v2 (Local — Free)</option>
              <option value="openai">OpenAI TTS</option>
              <option value="elevenlabs">ElevenLabs</option>
              <option value="ollama">Ollama</option>
            </select>
          </div>
          <input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            className="mt-3 w-full px-3 py-2 rounded border text-sm outline-none"
            style={{ background: "var(--bg-tertiary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
          />
          <button
            onClick={handleCreateVoice}
            className="mt-3 px-4 py-2 rounded font-medium text-sm cursor-pointer"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Create Voice Profile
          </button>
        </div>
      )}

      <div className="grid grid-cols-12 gap-6">
        {/* Voice list — left column */}
        <div className="col-span-3 space-y-2">
          <h3 className="text-sm font-medium uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>
            Voices
          </h3>
          {voices.map((v) => (
            <button
              key={v.id}
              onClick={() => {
                getVoice(v.id).then(setSelected);
                setCloneFiles([]);
                setCompletedPromptIds(new Set());
                setActivePrompt(null);
                setCloneStatus(null);
              }}
              className="w-full text-left p-3 rounded-lg border transition-colors cursor-pointer hover:brightness-110"
              style={{
                background: selected?.id === v.id ? "var(--bg-tertiary)" : "var(--bg-secondary)",
                borderColor: selected?.id === v.id ? "var(--accent)" : "var(--border)",
              }}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{v.name}</span>
                {v.is_cloned && <CheckCircle size={14} style={{ color: "var(--success)" }} />}
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                {v.engine} · {v.sample_count} sample{v.sample_count !== 1 ? "s" : ""}
              </div>
            </button>
          ))}
          {voices.length === 0 && (
            <p className="text-sm py-4 text-center" style={{ color: "var(--text-secondary)" }}>
              No voices yet. Create one!
            </p>
          )}
        </div>

        {/* Voice detail — right column */}
        <div className="col-span-9">
          {selected ? (
            <div className="rounded-lg border p-5" style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}>
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold">{selected.name}</h2>
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    {selected.engine} · {selected.is_cloned ? "Cloned ✓" : "Not cloned yet"}
                  </p>
                  {selected.description && (
                    <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{selected.description}</p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(selected.id)}
                  className="p-2 rounded hover:brightness-125 cursor-pointer"
                  style={{ color: "var(--danger)" }}
                >
                  <Trash2 size={18} />
                </button>
              </div>

              {/* Existing samples */}
              {selected.samples.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium mb-2">Uploaded Samples</h3>
                  <div className="space-y-1">
                    {selected.samples.map((s) => (
                      <div key={s.id} className="flex items-center gap-3 text-sm p-2 rounded"
                        style={{ background: "var(--bg-tertiary)" }}>
                        <Mic size={14} style={{ color: "var(--accent)" }} />
                        <span>{s.filename}</span>
                        {s.duration_seconds && (
                          <span style={{ color: "var(--text-secondary)" }}>{s.duration_seconds.toFixed(1)}s</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Clone section */}
              <div className="border-t pt-4" style={{ borderColor: "var(--border)" }}>
                <h3 className="text-sm font-medium mb-4">
                  {selected.is_cloned ? "Update Voice Clone" : "Clone This Voice"}
                </h3>

                {/* Input mode toggle */}
                <div className="flex items-center gap-2 mb-4">
                  <button
                    onClick={() => setInputMode("record")}
                    className="px-3 py-1.5 rounded text-sm font-medium cursor-pointer transition-colors"
                    style={{
                      background: inputMode === "record" ? "var(--accent)" : "var(--bg-tertiary)",
                      color: inputMode === "record" ? "#fff" : "var(--text-secondary)",
                    }}
                  >
                    🎙️ Record in Browser
                  </button>
                  <button
                    onClick={() => setInputMode("upload")}
                    className="px-3 py-1.5 rounded text-sm font-medium cursor-pointer transition-colors"
                    style={{
                      background: inputMode === "upload" ? "var(--accent)" : "var(--bg-tertiary)",
                      color: inputMode === "upload" ? "#fff" : "var(--text-secondary)",
                    }}
                  >
                    📁 Upload Files
                  </button>
                </div>

                {inputMode === "record" ? (
                  <div className="grid grid-cols-12 gap-4">
                    {/* Guided prompts — left */}
                    <div className="col-span-5">
                      <VoiceCloneGuide
                        activePromptId={activePrompt?.id || null}
                        completedIds={completedPromptIds}
                        onSelectPrompt={setActivePrompt}
                      />
                    </div>

                    {/* Recording area — right */}
                    <div className="col-span-7">
                      {activePrompt ? (
                        <div>
                          <h4 className="font-medium text-sm mb-2">{activePrompt.title}</h4>

                          {/* Script to read */}
                          <div className="rounded-lg p-4 mb-4 border" style={{ background: "#1a1a2e", borderColor: "var(--accent)" }}>
                            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--accent)" }}>
                              Read this aloud:
                            </p>
                            <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
                              {activePrompt.text}
                            </p>
                          </div>

                          {/* Tips */}
                          <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
                            💡 {activePrompt.tips}
                          </p>

                          {/* Recorder */}
                          <AudioRecorder
                            onRecordingComplete={handleRecordingComplete}
                            label={`Recording for: ${activePrompt.title}`}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-48 rounded-lg border"
                          style={{ background: "var(--bg-tertiary)", borderColor: "var(--border)" }}>
                          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                            ← Select a sample prompt to start recording
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Upload mode */
                  <div>
                    <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
                      Upload 1-3 audio samples (WAV, MP3, or WebM, 30s-3min each). Clear speech with minimal background noise works best.
                    </p>
                    <input
                      ref={fileRef}
                      type="file"
                      multiple
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e.target.files)}
                    />
                    <div
                      onClick={() => fileRef.current?.click()}
                      className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors hover:brightness-110"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <Upload size={24} className="mx-auto mb-2" style={{ color: "var(--text-secondary)" }} />
                      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                        Click to upload audio samples
                      </p>
                    </div>
                  </div>
                )}

                {/* Collected files */}
                {cloneFiles.length > 0 && (
                  <div className="mt-4 rounded-lg border p-3" style={{ background: "var(--bg-tertiary)", borderColor: "var(--border)" }}>
                    <h4 className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>
                      Samples ready ({cloneFiles.length})
                    </h4>
                    <div className="space-y-1">
                      {cloneFiles.map((f, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
                            <CheckCircle size={12} style={{ color: "var(--success)" }} />
                            {f.name} ({(f.size / 1024).toFixed(0)} KB)
                          </div>
                          <button onClick={() => removeFile(i)} className="cursor-pointer" style={{ color: "var(--danger)" }}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={handleClone}
                      disabled={cloning}
                      className="mt-3 w-full px-4 py-2.5 rounded-lg font-medium text-sm cursor-pointer disabled:opacity-50"
                      style={{ background: "var(--success)", color: "#fff" }}
                    >
                      {cloning ? "Cloning Voice..." : `Clone Voice from ${cloneFiles.length} Sample${cloneFiles.length > 1 ? "s" : ""}`}
                    </button>
                  </div>
                )}

                {/* Status messages */}
                {cloneStatus === "success" && (
                  <div className="mt-3 flex items-center gap-2 text-sm" style={{ color: "var(--success)" }}>
                    <CheckCircle size={16} /> Voice cloned successfully!
                  </div>
                )}
                {cloneStatus && cloneStatus !== "success" && (
                  <div className="mt-3 flex items-center gap-2 text-sm" style={{ color: "var(--danger)" }}>
                    <AlertCircle size={16} /> {cloneStatus}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 rounded-lg border"
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}>
              <p style={{ color: "var(--text-secondary)" }}>Select a voice or create a new one</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
