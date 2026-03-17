"use client";

import { useEffect, useState } from "react";
import { Settings as SettingsIcon, Eye, EyeOff, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

interface Integration {
  id: string;
  name: string;
  description: string;
  configured: boolean;
  api_key_masked: string;
  fields: { key: string; label: string; type: string; placeholder: string }[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://voiceforge.tech-method.com/api";

export default function SettingsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ id: string; type: "success" | "error"; msg: string } | null>(null);

  const load = async () => {
    try {
      const res = await fetch(`${API_BASE}/settings/integrations`);
      const data = await res.json();
      setIntegrations(data.integrations || []);
    } catch (e) {
      console.error("Failed to load integrations", e);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (integrationId: string) => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`${API_BASE}/settings/integrations/${integrationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (res.ok) {
        setStatus({ id: integrationId, type: "success", msg: "Saved! Restart backend to apply." });
        setEditing(null);
        setValues({});
        await load();
      } else {
        setStatus({ id: integrationId, type: "error", msg: "Failed to save" });
      }
    } catch {
      setStatus({ id: integrationId, type: "error", msg: "Network error" });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (integrationId: string) => {
    if (!confirm(`Remove ${integrationId} integration?`)) return;
    try {
      await fetch(`${API_BASE}/settings/integrations/${integrationId}`, { method: "DELETE" });
      setStatus({ id: integrationId, type: "success", msg: "Removed. Restart backend to apply." });
      await load();
    } catch {
      setStatus({ id: integrationId, type: "error", msg: "Failed to remove" });
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <SettingsIcon style={{ color: "var(--accent)" }} /> Settings
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Manage TTS engine integrations and API keys.
        </p>
      </div>

      <div className="space-y-4">
        {integrations.map((integ) => (
          <div
            key={integ.id}
            className="rounded-lg border p-5"
            style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-semibold text-base flex items-center gap-2">
                  {integ.name}
                  {integ.configured && <CheckCircle size={16} style={{ color: "var(--success)" }} />}
                </h3>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{integ.description}</p>
              </div>
              <div className="flex items-center gap-2">
                {integ.configured && (
                  <button
                    onClick={() => handleRemove(integ.id)}
                    className="text-xs px-2 py-1 rounded cursor-pointer"
                    style={{ color: "var(--danger)" }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            {integ.configured && editing !== integ.id && (
              <div className="flex items-center gap-3 mt-3">
                <div className="flex items-center gap-2 px-3 py-2 rounded text-sm font-mono"
                  style={{ background: "var(--bg-tertiary)" }}>
                  {showKey[integ.id] ? integ.api_key_masked : "••••••••••••"}
                  <button
                    onClick={() => setShowKey((s) => ({ ...s, [integ.id]: !s[integ.id] }))}
                    className="cursor-pointer"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {showKey[integ.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <button
                  onClick={() => { setEditing(integ.id); setValues({}); }}
                  className="text-sm px-3 py-1.5 rounded cursor-pointer"
                  style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}
                >
                  Update Key
                </button>
              </div>
            )}

            {(!integ.configured || editing === integ.id) && (
              <div className="mt-3 space-y-3">
                {integ.fields.map((field) => (
                  <div key={field.key}>
                    <label className="text-sm font-medium block mb-1">{field.label}</label>
                    <input
                      type={field.type === "password" ? "text" : field.type}
                      value={values[field.key] || ""}
                      onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2 rounded border text-sm outline-none font-mono"
                      style={{
                        background: "var(--bg-tertiary)",
                        borderColor: "var(--border)",
                        color: "var(--text-primary)",
                      }}
                    />
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSave(integ.id)}
                    disabled={saving || !Object.values(values).some((v) => v.trim())}
                    className="px-4 py-2 rounded text-sm font-medium cursor-pointer disabled:opacity-50"
                    style={{ background: "var(--accent)", color: "#fff" }}
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : "Save"}
                  </button>
                  {editing === integ.id && (
                    <button
                      onClick={() => { setEditing(null); setValues({}); }}
                      className="text-sm cursor-pointer"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            )}

            {status?.id === integ.id && (
              <div className="mt-2 flex items-center gap-1 text-sm"
                style={{ color: status.type === "success" ? "var(--success)" : "var(--danger)" }}>
                {status.type === "success" ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                {status.msg}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
