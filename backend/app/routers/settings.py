"""Settings API — manage integrations and configuration."""

import json
import logging
from pathlib import Path

from fastapi import APIRouter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/settings", tags=["settings"])

CONFIG_PATH = Path("/opt/voiceforge/backend/data/config.json")

# All supported integrations
INTEGRATIONS = {
    "minimax": {
        "name": "MiniMax",
        "description": "MiniMax cloud TTS with voice cloning (speech-02-hd, speech-2.8-hd)",
        "fields": [
            {"key": "api_key", "label": "API Key", "type": "password", "placeholder": "sk-api-..."},
            {"key": "model", "label": "Model", "type": "text", "placeholder": "speech-02-hd"},
        ],
    },
    "openai": {
        "name": "OpenAI TTS",
        "description": "OpenAI text-to-speech (tts-1, tts-1-hd)",
        "fields": [
            {"key": "api_key", "label": "API Key", "type": "password", "placeholder": "sk-..."},
            {"key": "model", "label": "Model", "type": "text", "placeholder": "tts-1-hd"},
            {"key": "default_voice", "label": "Default Voice", "type": "text", "placeholder": "nova"},
        ],
    },
    "ollama": {
        "name": "Ollama",
        "description": "Local Ollama TTS (requires Ollama running with a TTS model)",
        "fields": [
            {"key": "base_url", "label": "Base URL", "type": "text", "placeholder": "http://localhost:11434"},
            {"key": "model", "label": "TTS Model", "type": "text", "placeholder": "e.g. kokoro"},
        ],
    },
}


def _load_config() -> dict:
    if CONFIG_PATH.exists():
        return json.loads(CONFIG_PATH.read_text())
    return {}


def _save_config(config: dict):
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(config, indent=2))


def _mask_value(value: str, prefix: str = "") -> str:
    """Mask a sensitive value, showing only last 4 chars."""
    if not value or len(value) < 8:
        return ""
    return f"{prefix}...{value[-4:]}"


@router.get("/integrations")
async def get_integrations():
    """Get configured integrations (keys masked)."""
    config = _load_config()
    integrations = []

    for integ_id, meta in INTEGRATIONS.items():
        integ_config = config.get(integ_id, {})
        # Check if any field has a value
        configured = any(bool(integ_config.get(f["key"], "")) for f in meta["fields"])

        # Build masked display for the primary field (first field)
        primary_key = meta["fields"][0]["key"]
        primary_val = integ_config.get(primary_key, "")

        integrations.append({
            "id": integ_id,
            "name": meta["name"],
            "description": meta["description"],
            "configured": configured,
            "api_key_masked": _mask_value(primary_val, primary_val[:3] if len(primary_val) > 3 else ""),
            "fields": meta["fields"],
            "values_masked": {
                f["key"]: _mask_value(integ_config.get(f["key"], "")) if f["type"] == "password"
                else integ_config.get(f["key"], "")
                for f in meta["fields"]
            },
        })

    return {"integrations": integrations}


@router.put("/integrations/{integration_id}")
async def update_integration(integration_id: str, body: dict):
    """Update an integration's settings."""
    if integration_id not in INTEGRATIONS:
        return {"error": f"Unknown integration: {integration_id}"}

    config = _load_config()
    if integration_id not in config:
        config[integration_id] = {}

    # Only update fields that are defined for this integration
    valid_keys = {f["key"] for f in INTEGRATIONS[integration_id]["fields"]}
    for key, value in body.items():
        if key in valid_keys and value.strip():
            config[integration_id][key] = value.strip()

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
        logger.info(f"Removed integration: {integration_id}")
    return {"status": "ok"}
