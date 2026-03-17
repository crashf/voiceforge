"use client";

import { useState } from "react";
import { AuthProvider, useAuth } from "@/components/AuthContext";
import LoginPage from "@/components/LoginPage";
import Sidebar from "@/components/Sidebar";
import ProjectView from "@/components/ProjectView";
import VoiceLab from "@/components/VoiceLab";
import SettingsPage from "@/components/SettingsPage";
import { Loader } from "lucide-react";

type View = "projects" | "voicelab" | "settings";

function AppContent() {
  const { user, loading } = useAuth();
  const [view, setView] = useState<View>("projects");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: "var(--bg-primary)" }}>
        <Loader className="animate-spin" size={32} style={{ color: "var(--accent)" }} />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="flex h-screen">
      <Sidebar
        view={view}
        onViewChange={setView}
        selectedProjectId={selectedProjectId}
        onSelectProject={(id) => {
          setSelectedProjectId(id);
          setView("projects");
        }}
      />
      <main className="flex-1 overflow-auto">
        {view === "voicelab" ? (
          <VoiceLab />
        ) : view === "settings" ? (
          <SettingsPage />
        ) : (
          <ProjectView projectId={selectedProjectId} />
        )}
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
