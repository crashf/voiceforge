"""VoiceForge API — main application entry point."""

import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import init_db
from .routers import voices, projects, engines, settings as settings_router, auth_router, admin_router
from .tts_engines.registry import register_engine

logger = logging.getLogger("voiceforge")

CONFIG_PATH = Path("/opt/voiceforge/backend/data/config.json")


def _load_config() -> dict:
    if CONFIG_PATH.exists():
        return json.loads(CONFIG_PATH.read_text())
    return {}


def _register_engines():
    """Register all configured TTS engines."""
    config = _load_config()

    # XTTS (local, free) — skip if TTS library not installed
    try:
        from .tts_engines.xtts_engine import XTTSEngine
        register_engine(XTTSEngine(model_name=settings.xtts_model, device=settings.xtts_device))
    except ImportError:
        logger.warning("XTTS engine unavailable (TTS library not installed)")

    # MiniMax — from config.json or env
    mm_cfg = config.get("minimax", {})
    mm_key = mm_cfg.get("api_key", "") or settings.minimax_api_key
    if mm_key:
        try:
            from .tts_engines.minimax_engine import MiniMaxEngine
            mm_model = mm_cfg.get("model", "speech-02-hd")
            register_engine(MiniMaxEngine(api_key=mm_key, model=mm_model))
            logger.info(f"MiniMax engine registered (model: {mm_model})")
        except Exception as e:
            logger.warning(f"MiniMax engine failed to register: {e}")

    # OpenAI — only if API key provided
    oai_key = config.get("openai", {}).get("api_key", "") or settings.openai_api_key
    if oai_key:
        from .tts_engines.openai_engine import OpenAIEngine
        register_engine(OpenAIEngine(
            api_key=oai_key,
            model=settings.openai_tts_model,
            default_voice=settings.openai_default_voice,
        ))

    # Ollama — only if model specified
    if settings.ollama_tts_model:
        from .tts_engines.ollama_engine import OllamaEngine
        register_engine(OllamaEngine(
            base_url=settings.ollama_base_url,
            model=settings.ollama_tts_model,
        ))

    from .tts_engines import list_engines as _le
    logger.info(f"Registered TTS engines: {[e['name'] for e in _le()]}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown."""
    settings.ensure_dirs()
    await init_db()
    _register_engines()
    logger.info("VoiceForge ready 🎙️")
    yield
    logger.info("VoiceForge shutting down.")


app = FastAPI(
    title="VoiceForge API",
    description="Text-to-speech studio with voice cloning and project management.",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(voices.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(engines.router, prefix="/api")
app.include_router(settings_router.router, prefix="/api")
app.include_router(auth_router.router, prefix="/api")
app.include_router(admin_router.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": settings.app_name}
