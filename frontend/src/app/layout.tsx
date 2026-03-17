import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VoiceForge — TTS Studio",
  description: "Text-to-speech studio with voice cloning",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
