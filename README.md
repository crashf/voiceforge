# VoiceForge — TTS Studio

Self-hosted text-to-speech studio with voice cloning, project management, and pluggable TTS backends.

## Features
- **Project-based workflow** — organize TTS clips by client/project
- **Voice cloning** — clone voices from short audio samples
- **Multiple TTS backends** — local (XTTS v2), cloud (OpenAI, ElevenLabs), or Ollama
- **Batch generation** — generate multiple clips at once
- **Export** — download individual clips or full project as ZIP

## Architecture
- **Frontend:** Next.js 15 (React 19)
- **Backend:** Python FastAPI
- **Database:** SQLite (via SQLAlchemy)
- **TTS Engines:** Pluggable — XTTS v2, OpenAI TTS, ElevenLabs, Ollama
- **Audio Processing:** ffmpeg

## Quick Start
```bash
docker compose up --build
```

## Development
```bash
# Backend
cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload

# Frontend
cd frontend && npm install && npm run dev
```
