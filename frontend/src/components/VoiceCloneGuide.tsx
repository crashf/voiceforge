"use client";

import { useState } from "react";
import { ChevronRight, Info, CheckCircle } from "lucide-react";

/**
 * Guided prompts for voice cloning.
 * Designed to capture a full range of phonemes, tones, and pacing
 * in 3 recordings (~30-60s each).
 */

export interface GuidedPrompt {
  id: string;
  title: string;
  purpose: string;
  text: string;
  tips: string;
  minSeconds: number;
}

export const GUIDED_PROMPTS: GuidedPrompt[] = [
  {
    id: "natural-read",
    title: "Sample 1 — Natural Reading",
    purpose: "Captures your natural speaking rhythm, pitch, and tone",
    text: `The quick brown fox jumps over the lazy dog near the bank of the river. Please hold while we transfer your call to the next available representative. Our office hours are Monday through Friday, nine A.M. to five P.M. Eastern Standard Time. For billing inquiries, press three. To repeat this menu, press nine. Thank you for your patience — your call is very important to us. We appreciate your business and look forward to assisting you today.`,
    tips: "Read naturally, like you're speaking to a caller. Don't rush — use your normal professional phone voice.",
    minSeconds: 30,
  },
  {
    id: "phoneme-coverage",
    title: "Sample 2 — Sound Coverage",
    purpose: "Covers all English sounds (phonemes) for accurate voice reproduction",
    text: `She sells seashells by the seashore every Thursday morning. The singer began performing jazz, blues, and vintage rock at the charming village theatre. Check your schedule for available appointments this Wednesday or Thursday. We'll transfer your call shortly. Please have your thirteen-digit account number ready, along with your zip code. For technical support, you may also visit our website at www.example.com or email support at help@example.com.`,
    tips: "Speak clearly and at a steady pace. Pronounce each word fully — don't mumble or trail off at the end of sentences.",
    minSeconds: 30,
  },
  {
    id: "tone-variation",
    title: "Sample 3 — Tone & Expression",
    purpose: "Captures how you handle questions, emphasis, and different moods",
    text: `Good morning! Thank you for calling. How may I direct your call? I'm sorry, but that extension is currently unavailable. Would you like to leave a voicemail? Absolutely — I'd be happy to help you with that. Unfortunately, our offices are now closed. Please call back during regular business hours. Did you know you can also manage your account online? Visit us at any time, twenty-four seven. We truly value your feedback. Have a wonderful day!`,
    tips: "This one has questions, apologies, enthusiasm, and closings. Let your natural expression come through — vary your tone like you would on a real call.",
    minSeconds: 30,
  },
];

interface Props {
  activePromptId: string | null;
  completedIds: Set<string>;
  onSelectPrompt: (prompt: GuidedPrompt) => void;
}

export default function VoiceCloneGuide({ activePromptId, completedIds, onSelectPrompt }: Props) {
  const [showTips, setShowTips] = useState(true);

  return (
    <div>
      {/* Tips panel */}
      {showTips && (
        <div className="rounded-lg border p-4 mb-4" style={{ background: "#1a1a2e", borderColor: "var(--accent)" }}>
          <div className="flex items-start gap-3">
            <Info size={18} className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
            <div>
              <h4 className="font-medium text-sm mb-2">Voice Cloning Tips</h4>
              <ul className="text-xs space-y-1.5" style={{ color: "var(--text-secondary)" }}>
                <li>🎙️ <strong>Quiet environment</strong> — no background noise, fan, or music</li>
                <li>📏 <strong>Consistent distance</strong> — stay 6-12 inches from your mic</li>
                <li>🗣️ <strong>Natural voice</strong> — speak like you normally would on a professional call</li>
                <li>⏱️ <strong>30-60 seconds each</strong> — longer samples = better quality</li>
                <li>🔄 <strong>All 3 samples recommended</strong> — each one covers different sounds and tones</li>
                <li>💡 <strong>Read the script below</strong> — they're designed to capture every sound in English</li>
              </ul>
              <button
                onClick={() => setShowTips(false)}
                className="text-xs mt-2 cursor-pointer underline"
                style={{ color: "var(--text-secondary)" }}
              >
                Hide tips
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Progress: {completedIds.size} / {GUIDED_PROMPTS.length} samples
        </span>
        <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--bg-tertiary)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              background: completedIds.size === GUIDED_PROMPTS.length ? "var(--success)" : "var(--accent)",
              width: `${(completedIds.size / GUIDED_PROMPTS.length) * 100}%`,
            }}
          />
        </div>
        {completedIds.size === GUIDED_PROMPTS.length && (
          <span className="text-xs font-medium" style={{ color: "var(--success)" }}>Ready to clone!</span>
        )}
      </div>

      {/* Prompt cards */}
      <div className="space-y-3">
        {GUIDED_PROMPTS.map((prompt) => {
          const isActive = activePromptId === prompt.id;
          const isCompleted = completedIds.has(prompt.id);

          return (
            <button
              key={prompt.id}
              onClick={() => onSelectPrompt(prompt)}
              className="w-full text-left rounded-lg border p-4 transition-all cursor-pointer hover:brightness-110"
              style={{
                background: isActive ? "var(--bg-tertiary)" : "var(--bg-secondary)",
                borderColor: isActive ? "var(--accent)" : isCompleted ? "var(--success)" : "var(--border)",
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {isCompleted
                    ? <CheckCircle size={16} style={{ color: "var(--success)" }} />
                    : <ChevronRight size={16} style={{ color: isActive ? "var(--accent)" : "var(--text-secondary)" }} />
                  }
                  <span className="font-medium text-sm">{prompt.title}</span>
                </div>
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  min {prompt.minSeconds}s
                </span>
              </div>
              <p className="text-xs ml-6" style={{ color: "var(--text-secondary)" }}>
                {prompt.purpose}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
