"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import {
  Users, Plus, Trash2, Shield, ShieldOff, UserCheck, UserX,
  Pencil, Save, X, AlertCircle, CheckCircle, Eye, EyeOff, Key,
} from "lucide-react";

interface UserInfo {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
}

function getHeaders(token: string | null) {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

export default function UserManagement() {
  const { user, token } = useAuth();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [resetPwId, setResetPwId] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/admin/users", { headers: getHeaders(token) });
      if (res.ok) setUsers(await res.json());
    } catch {}
  };

  useEffect(() => { load(); }, [token]);

  const handleCreate = async () => {
    if (!newUsername.trim() || !newPassword.trim()) return;
    setStatus(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: getHeaders(token),
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          display_name: newDisplayName.trim() || newUsername.trim(),
          email: newEmail.trim() || null,
          is_admin: newIsAdmin,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed");
      }
      setStatus({ type: "success", msg: `User "${newUsername}" created` });
      setNewUsername(""); setNewPassword(""); setNewDisplayName(""); setNewEmail(""); setNewIsAdmin(false);
      setShowCreate(false);
      await load();
    } catch (e: any) {
      setStatus({ type: "error", msg: e.message });
    }
  };

  const handleToggle = async (u: UserInfo, field: "is_admin" | "is_active") => {
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        headers: getHeaders(token),
        body: JSON.stringify({ [field]: !u[field] }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed");
      }
      await load();
    } catch (e: any) {
      setStatus({ type: "error", msg: e.message });
    }
  };

  const handleSaveEdit = async (userId: string) => {
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: getHeaders(token),
        body: JSON.stringify(editFields),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed");
      }
      setEditingId(null);
      setEditFields({});
      await load();
    } catch (e: any) {
      setStatus({ type: "error", msg: e.message });
    }
  };

  const handleResetPassword = async (userId: string) => {
    if (!resetPw.trim()) return;
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: getHeaders(token),
        body: JSON.stringify({ password: resetPw }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed");
      }
      setStatus({ type: "success", msg: "Password reset" });
      setResetPwId(null);
      setResetPw("");
    } catch (e: any) {
      setStatus({ type: "error", msg: e.message });
    }
  };

  const handleDelete = async (u: UserInfo) => {
    if (!confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "DELETE",
        headers: getHeaders(token),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed");
      }
      setStatus({ type: "success", msg: `User "${u.username}" deleted` });
      await load();
    } catch (e: any) {
      setStatus({ type: "error", msg: e.message });
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "Never";
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  };

  if (!user?.is_admin) return null;

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Users size={20} style={{ color: "var(--accent)" }} /> User Management
        </h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          <Plus size={14} /> Add User
        </button>
      </div>

      {status && (
        <div className="mb-4 flex items-center gap-2 text-sm p-3 rounded-lg"
          style={{
            background: status.type === "success" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
            color: status.type === "success" ? "var(--success)" : "var(--danger)",
          }}>
          {status.type === "success" ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
          {status.msg}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="rounded-lg border p-4 mb-4" style={{ background: "var(--bg-tertiary)", borderColor: "var(--border)" }}>
          <h3 className="font-medium text-sm mb-3">Create New User</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)}
              placeholder="Username" className="px-3 py-2 rounded border text-sm outline-none"
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }} />
            <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Password" type="password" className="px-3 py-2 rounded border text-sm outline-none"
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }} />
            <input value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)}
              placeholder="Display Name (optional)" className="px-3 py-2 rounded border text-sm outline-none"
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }} />
            <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Email (optional)" className="px-3 py-2 rounded border text-sm outline-none"
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }} />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={newIsAdmin} onChange={(e) => setNewIsAdmin(e.target.checked)} />
              Admin
            </label>
            <button onClick={handleCreate}
              disabled={!newUsername.trim() || !newPassword.trim()}
              className="px-4 py-2 rounded text-sm font-medium cursor-pointer disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#fff" }}>
              Create User
            </button>
            <button onClick={() => setShowCreate(false)} className="text-sm cursor-pointer"
              style={{ color: "var(--text-secondary)" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* User table */}
      <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--bg-tertiary)" }}>
              <th className="text-left px-4 py-2.5 font-medium" style={{ color: "var(--text-secondary)" }}>User</th>
              <th className="text-left px-4 py-2.5 font-medium" style={{ color: "var(--text-secondary)" }}>Email</th>
              <th className="text-center px-4 py-2.5 font-medium" style={{ color: "var(--text-secondary)" }}>Role</th>
              <th className="text-center px-4 py-2.5 font-medium" style={{ color: "var(--text-secondary)" }}>Status</th>
              <th className="text-left px-4 py-2.5 font-medium" style={{ color: "var(--text-secondary)" }}>Last Login</th>
              <th className="text-right px-4 py-2.5 font-medium" style={{ color: "var(--text-secondary)" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
                <td className="px-4 py-3">
                  {editingId === u.id ? (
                    <input value={editFields.display_name ?? u.display_name}
                      onChange={(e) => setEditFields((f) => ({ ...f, display_name: e.target.value }))}
                      className="px-2 py-1 rounded border text-sm w-full"
                      style={{ background: "var(--bg-tertiary)", borderColor: "var(--border)", color: "var(--text-primary)" }} />
                  ) : (
                    <div>
                      <div className="font-medium">{u.display_name}</div>
                      <div className="text-xs" style={{ color: "var(--text-secondary)" }}>@{u.username}</div>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                  {u.email || "—"}
                </td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => handleToggle(u, "is_admin")}
                    className="cursor-pointer" title={u.is_admin ? "Remove admin" : "Make admin"}>
                    {u.is_admin
                      ? <Shield size={16} style={{ color: "var(--accent)" }} />
                      : <ShieldOff size={16} style={{ color: "var(--text-secondary)", opacity: 0.4 }} />}
                  </button>
                </td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => handleToggle(u, "is_active")}
                    className="cursor-pointer" title={u.is_active ? "Deactivate" : "Activate"}>
                    {u.is_active
                      ? <UserCheck size={16} style={{ color: "var(--success)" }} />
                      : <UserX size={16} style={{ color: "var(--danger)" }} />}
                  </button>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--text-secondary)" }}>
                  {formatDate(u.last_login)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {editingId === u.id ? (
                      <>
                        <button onClick={() => handleSaveEdit(u.id)} className="p-1 cursor-pointer" style={{ color: "var(--success)" }}><Save size={14} /></button>
                        <button onClick={() => { setEditingId(null); setEditFields({}); }} className="p-1 cursor-pointer" style={{ color: "var(--text-secondary)" }}><X size={14} /></button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setEditingId(u.id); setEditFields({ display_name: u.display_name }); }}
                          className="p-1 cursor-pointer" style={{ color: "var(--text-secondary)" }} title="Edit"><Pencil size={14} /></button>
                        {resetPwId === u.id ? (
                          <div className="flex items-center gap-1">
                            <input value={resetPw} onChange={(e) => setResetPw(e.target.value)}
                              type="password" placeholder="New password" className="px-2 py-1 rounded border text-xs w-24"
                              style={{ background: "var(--bg-tertiary)", borderColor: "var(--border)", color: "var(--text-primary)" }} />
                            <button onClick={() => handleResetPassword(u.id)} className="p-1 cursor-pointer" style={{ color: "var(--success)" }}><Save size={14} /></button>
                            <button onClick={() => { setResetPwId(null); setResetPw(""); }} className="p-1 cursor-pointer" style={{ color: "var(--text-secondary)" }}><X size={14} /></button>
                          </div>
                        ) : (
                          <button onClick={() => setResetPwId(u.id)}
                            className="p-1 cursor-pointer" style={{ color: "var(--text-secondary)" }} title="Reset password"><Key size={14} /></button>
                        )}
                        <button onClick={() => handleDelete(u)} className="p-1 cursor-pointer"
                          style={{ color: u.id === user?.id ? "var(--border)" : "var(--danger)" }}
                          disabled={u.id === user?.id} title="Delete user"><Trash2 size={14} /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
