"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import ProjectView from "@/components/ProjectView";
import VoiceLab from "@/components/VoiceLab";
import SettingsPage from "@/components/SettingsPage";

type View = "projects" | "voicelab" | "settings";

export default function Home() {
  const [view, setView] = useState<View>("projects");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

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
