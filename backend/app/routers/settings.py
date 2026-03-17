"""Settings API — manage integrations and configuration."""

import json
import logging
from pathlib import Path

from fastapi import APIRouter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/settings", tags=["settings"])

CONFIG_PATH = Path("/opt/voiceforge/backend/data/config.json")


def _load_config() -> dict:
    if CONFIG_PATH.exists():
        return json.loads(CONFIG_PATH.read_text())
    return {}


def _save_config(config: dict):
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(config, indent=2))


@router.get("/integrations")
async def get_integrations():
    """Get configured integrations (keys masked)."""
    config = _load_config()
    integrations = []

    # ElevenLabs
    el_key = config.get("elevenlabs", {}).get("api_key", "")
    integrations.append({
        "id": "elevenlabs",
        "name": "ElevenLabs",
        "description": "High-quality cloud TTS with voice cloning",
        "configured": bool(el_key),
        "api_key_masked": f"sk_...{el_key[-8:]}" if len(el_key) > 8 else "",
        "fields": [{"key": "api_key", "label": "API Key", "type": "password", "placeholder": "sk_..."}],
    })

    # OpenAI
    oai_key = config.get("openai", {}).get("api_key", "")
    integrations.append({
        "id": "openai",
        "name": "OpenAI TTS",
        "description": "OpenAI text-to-speech (tts-1, tts-1-hd)",
        "configured": bool(oai_key),
        "api_key_masked": f"sk-...{oai_key[-8:]}" if len(oai_key) > 8 else "",
        "fields": [{"key": "api_key", "label": "API Key", "type": "password", "placeholder": "sk-..."}],
    })

    return {"integrations": integrations}


@router.put("/integrations/{integration_id}")
async def update_integration(integration_id: str, body: dict):
    """Update an integration's settings."""
    config = _load_config()

    if integration_id not in ("elevenlabs", "openai"):
        return {"error": "Unknown integration"}, 404

    if integration_id not in config:
        config[integration_id] = {}

    for key, value in body.items():
        config[integration_id][key] = value

    _save_config(config)
    logger.info(f"Updated integration: {integration_id}")

    return {"status": "ok", "integration_id": integration_id}


@router.delete("/integrations/{integration_id}")
async def delete_integration(integration_id: str):
    """Remove an integration's configuration."""
    config = _load_config()
    if integration_id in config:
        del config[integration_id]
        _save_config(config)
    return {"status": "ok"}


@router.get("/engines")
async def get_available_engines():
    """List available TTS engines and their status."""
    from ..tts_engines import list_engines
    engines = list_engines()

    # Also check if ElevenLabs could be enabled
    config = _load_config()
    el_configured = bool(config.get("elevenlabs", {}).get("api_key", ""))

    return {
        "engines": engines,
        "elevenlabs_configured": el_configured,
    }
