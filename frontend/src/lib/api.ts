/**
 * VoiceForge API client.
 */

const BASE = "/api";

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `API error ${res.status}`);
  }
  return res.json();
}

// ── Engines ──
export const getEngines = () => fetchJSON<EngineInfo[]>("/engines");
export const getEngineHealth = (name: string) => fetchJSON<any>(`/engines/${name}/health`);
export const getEngineVoices = (name: string) => fetchJSON<VoiceOption[]>(`/engines/${name}/voices`);

// ── Voices ──
export const getVoices = () => fetchJSON<VoiceSummary[]>("/voices");
export const getVoice = (id: string) => fetchJSON<VoiceDetail>(`/voices/${id}`);
export const createVoice = (data: FormData) =>
  fetch(`${BASE}/voices`, { method: "POST", body: data }).then((r) => r.json());
export const cloneVoice = (voiceId: string, samples: File[]) => {
  const fd = new FormData();
  samples.forEach((f) => fd.append("samples", f));
  return fetch(`${BASE}/voices/${voiceId}/clone`, { method: "POST", body: fd }).then((r) => r.json());
};
export const deleteVoice = (id: string) =>
  fetchJSON(`/voices/${id}`, { method: "DELETE" });

// ── Projects ──
export const getProjects = () => fetchJSON<ProjectSummary[]>("/projects");
export const getProject = (id: string) => fetchJSON<ProjectDetail>(`/projects/${id}`);
export const createProject = (data: { name: string; description?: string; client_name?: string }) =>
  fetchJSON<{ id: string; name: string }>("/projects", { method: "POST", body: JSON.stringify(data) });
export const updateProject = (id: string, data: Partial<{ name: string; description: string; client_name: string }>) =>
  fetchJSON(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteProject = (id: string) =>
  fetchJSON(`/projects/${id}`, { method: "DELETE" });

// ── Clips ──
export const createClip = (projectId: string, data: ClipCreateData) =>
  fetchJSON<{ id: string; title: string; status: string }>(`/projects/${projectId}/clips`, {
    method: "POST",
    body: JSON.stringify(data),
  });
export const createClipsBatch = (projectId: string, clips: ClipCreateData[]) =>
  fetchJSON<{ created: number; clip_ids: string[] }>(`/projects/${projectId}/clips/batch`, {
    method: "POST",
    body: JSON.stringify({ clips }),
  });
export const generateClip = (projectId: string, clipId: string) =>
  fetchJSON<ClipGenerateResult>(`/projects/${projectId}/clips/${clipId}/generate`, { method: "POST" });
export const getClipAudioUrl = (projectId: string, clipId: string) =>
  `${BASE}/projects/${projectId}/clips/${clipId}/audio`;
export const updateClip = (projectId: string, clipId: string, data: Partial<ClipCreateData>) =>
  fetchJSON<{ id: string; title: string; status: string }>(`/projects/${projectId}/clips/${clipId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
export const deleteClip = (projectId: string, clipId: string) =>
  fetchJSON(`/projects/${projectId}/clips/${clipId}`, { method: "DELETE" });
export const getProjectExportUrl = (projectId: string) =>
  `${BASE}/projects/${projectId}/export`;

// ── Types ──
export interface EngineInfo {
  name: string;
  supports_cloning: boolean;
  supports_streaming: boolean;
}

export interface VoiceOption {
  id: string;
  name: string;
  engine: string;
}

export interface VoiceSummary {
  id: string;
  name: string;
  description: string | null;
  engine: string;
  is_cloned: boolean;
  is_builtin: boolean;
  language: string;
  created_at: string;
  sample_count: number;
}

export interface VoiceDetail extends VoiceSummary {
  provider_voice_id: string | null;
  embedding_path: string | null;
  samples: { id: string; filename: string; duration_seconds: number | null; created_at: string }[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  client_name: string | null;
  clip_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectDetail extends ProjectSummary {
  clips: ClipInfo[];
}

export interface ClipInfo {
  id: string;
  title: string;
  text: string;
  voice_id: string | null;
  engine: string;
  speed: number;
  status: string;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  output_format: string;
  error_message: string | null;
  created_at: string;
}

export interface ClipCreateData {
  title: string;
  text: string;
  voice_id?: string;
  engine?: string;
  speed?: number;
  output_format?: string;
  language?: string;
}

export interface ClipGenerateResult {
  id: string;
  status: string;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  error: string | null;
}
