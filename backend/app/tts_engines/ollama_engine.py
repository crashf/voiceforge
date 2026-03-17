"""Ollama TTS engine — for Ollama-hosted TTS models (e.g., OuteTTS, Kokoro)."""

import logging
from pathlib import Path

import httpx

from .base import TTSEngine, TTSResult, VoiceCloneResult

logger = logging.getLogger(__name__)


class OllamaEngine(TTSEngine):
    name = "ollama"
    supports_cloning = False
    supports_streaming = False

    def __init__(self, base_url: str = "http://localhost:11434", model: str = ""):
        self.base_url = base_url.rstrip("/")
        self.model = model

    async def generate(
        self,
        text: str,
        output_path: Path,
        voice_id: str | None = None,
        reference_audio: Path | None = None,
        speed: float = 1.0,
        language: str = "en",
        output_format: str = "wav",
        **kwargs,
    ) -> TTSResult:
        """Generate TTS via Ollama's API.

        Note: Ollama TTS support is model-dependent. This is a forward-looking
        integration — specific models may need different API calls.
        """
        output_path = Path(output_path).with_suffix(f".{output_format}")

        async with httpx.AsyncClient(timeout=120) as client:
            # Ollama doesn't have a standard TTS endpoint yet.
            # This uses the /api/generate endpoint with audio-capable models.
            # Adjust based on the specific model's requirements.
            response = await client.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": text,
                    "stream": False,
                    "options": {
                        "voice": voice_id or "default",
                        "speed": speed,
                    },
                },
            )
            response.raise_for_status()
            data = response.json()

            # Handle audio response — format depends on model
            if "audio" in data:
                import base64
                audio_bytes = base64.b64decode(data["audio"])
                output_path.write_bytes(audio_bytes)
            else:
                raise ValueError(f"Model {self.model} did not return audio data. Response keys: {list(data.keys())}")

        duration = 0.0
        try:
            import soundfile as sf
            info = sf.info(str(output_path))
            duration = info.duration
        except Exception:
            pass

        return TTSResult(
            file_path=output_path,
            duration_seconds=duration,
            sample_rate=24000,
            format=output_format,
            file_size_bytes=output_path.stat().st_size,
        )

    async def clone_voice(self, name: str, sample_paths: list[Path], output_dir: Path, **kwargs) -> VoiceCloneResult:
        raise NotImplementedError("Ollama engine does not support voice cloning yet.")

    async def list_voices(self) -> list[dict]:
        """List available Ollama models that might support TTS."""
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                response.raise_for_status()
                models = response.json().get("models", [])
                return [
                    {"id": m["name"], "name": m["name"], "engine": self.name}
                    for m in models
                ]
        except Exception:
            return []

    async def health_check(self) -> dict:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                response.raise_for_status()
                return {"engine": self.name, "status": "ready", "base_url": self.base_url}
        except Exception as e:
            return {"engine": self.name, "status": "error", "error": str(e)}
