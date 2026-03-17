"use client";

import { useEffect, useState } from "react";
import { getProjects, createProject, type ProjectSummary } from "@/lib/api";
import { Mic, FolderOpen, Plus, AudioLines, Settings, LogOut, User } from "lucide-react";
import { useAuth } from "./AuthContext";

interface Props {
  view: "projects" | "voicelab" | "settings";
  onViewChange: (v: "projects" | "voicelab" | "settings") => void;
  selectedProjectId: string | null;
  onSelectProject: (id: string) => void;
}

export default function Sidebar({ view, onViewChange, selectedProjectId, onSelectProject }: Props) {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newClient, setNewClient] = useState("");

  const load = () => getProjects().then(setProjects).catch(console.error);

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const p = await createProject({ name: newName, client_name: newClient || undefined });
    setNewName("");
    setNewClient("");
    setShowNew(false);
    await load();
    onSelectProject(p.id);
  };

  return (
    <aside className="w-64 h-screen flex flex-col border-r"
      style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}>
      {/* Logo */}
      <div className="p-4 flex items-center gap-2 border-b" style={{ borderColor: "var(--border)" }}>
        <AudioLines size={24} style={{ color: "var(--accent)" }} />
        <span className="text-lg font-bold">VoiceForge</span>
      </div>

      {/* Voice Lab */}
      <button
        onClick={() => onViewChange("voicelab")}
        className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:brightness-125 cursor-pointer"
        style={{
          background: view === "voicelab" ? "var(--bg-tertiary)" : "transparent",
          color: view === "voicelab" ? "var(--accent)" : "var(--text-secondary)",
        }}
      >
        <Mic size={18} />
        Voice Lab
      </button>

      {/* Projects header */}
      <div className="flex items-center justify-between px-4 py-2 mt-2">
        <span className="text-xs uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
          Projects
        </span>
        <button
          onClick={() => setShowNew(!showNew)}
          className="p-1 rounded transition-colors hover:brightness-125 cursor-pointer"
          style={{ color: "var(--text-secondary)" }}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* New project form */}
      {showNew && (
        <div className="px-4 pb-2 flex flex-col gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Project name"
            className="px-2 py-1.5 text-sm rounded border outline-none"
            style={{ background: "var(--bg-tertiary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            autoFocus
          />
          <input
            value={newClient}
            onChange={(e) => setNewClient(e.target.value)}
            placeholder="Client name (optional)"
            className="px-2 py-1.5 text-sm rounded border outline-none"
            style={{ background: "var(--bg-tertiary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <button
            onClick={handleCreate}
            className="px-3 py-1.5 text-sm rounded font-medium cursor-pointer"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Create
          </button>
        </div>
      )}

      {/* Project list */}
      <div className="flex-1 overflow-auto">
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelectProject(p.id)}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors hover:brightness-110 cursor-pointer"
            style={{
              background: selectedProjectId === p.id && view === "projects" ? "var(--bg-tertiary)" : "transparent",
              color: selectedProjectId === p.id && view === "projects" ? "var(--text-primary)" : "var(--text-secondary)",
            }}
          >
            <FolderOpen size={16} />
            <div className="flex-1 min-w-0">
              <div className="truncate">{p.name}</div>
              {p.client_name && (
                <div className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                  {p.client_name}
                </div>
              )}
            </div>
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {p.clip_count}
            </span>
          </button>
        ))}
        {projects.length === 0 && (
          <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
            No projects yet
          </div>
        )}
      </div>

      {/* Settings */}
      <button
        onClick={() => onViewChange("settings")}
        className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:brightness-125 cursor-pointer border-t"
        style={{
          background: view === "settings" ? "var(--bg-tertiary)" : "transparent",
          color: view === "settings" ? "var(--accent)" : "var(--text-secondary)",
          borderColor: "var(--border)",
        }}
      >
        <Settings size={18} />
        Settings
      </button>

      {/* User info + Logout */}
      {user && (
        <div className="px-4 py-3 border-t flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2 min-w-0">
            <User size={16} style={{ color: "var(--text-secondary)" }} />
            <span className="text-sm truncate" style={{ color: "var(--text-primary)" }}>
              {user.display_name}
            </span>
          </div>
          <button
            onClick={logout}
            className="p-1.5 rounded hover:brightness-125 cursor-pointer"
            style={{ color: "var(--text-secondary)" }}
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      )}
    </aside>
  );
}
