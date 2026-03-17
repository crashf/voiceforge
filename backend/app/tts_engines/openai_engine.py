"""OpenAI TTS engine — cloud-based, no cloning support."""

import logging
from pathlib import Path

from .base import TTSEngine, TTSResult, VoiceCloneResult

logger = logging.getLogger(__name__)

# OpenAI built-in voices
OPENAI_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"]


class OpenAIEngine(TTSEngine):
    name = "openai"
    supports_cloning = False
    supports_streaming = True

    def __init__(self, api_key: str, model: str = "tts-1-hd", default_voice: str = "nova"):
        self.api_key = api_key
        self.model = model
        self.default_voice = default_voice
        self._client = None

    def _get_client(self):
        if self._client is None:
            from openai import AsyncOpenAI
            self._client = AsyncOpenAI(api_key=self.api_key)
        return self._client

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
        client = self._get_client()
        voice = voice_id or self.default_voice

        # OpenAI supports: mp3, opus, aac, flac, wav, pcm
        response_format = output_format if output_format in ("mp3", "opus", "aac", "flac", "wav", "pcm") else "wav"
        output_path = Path(output_path).with_suffix(f".{response_format}")

        response = await client.audio.speech.create(
            model=self.model,
            voice=voice,
            input=text,
            speed=speed,
            response_format=response_format,
        )

        response.stream_to_file(str(output_path))

        # Get duration from file
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
            format=response_format,
            file_size_bytes=output_path.stat().st_size,
        )

    async def clone_voice(self, name: str, sample_paths: list[Path], output_dir: Path, **kwargs) -> VoiceCloneResult:
        raise NotImplementedError("OpenAI TTS does not support voice cloning.")

    async def list_voices(self) -> list[dict]:
        return [{"id": v, "name": v.title(), "engine": self.name} for v in OPENAI_VOICES]

    async def health_check(self) -> dict:
        try:
            client = self._get_client()
            # Quick test — list models
            return {"engine": self.name, "status": "ready", "model": self.model}
        except Exception as e:
            return {"engine": self.name, "status": "error", "error": str(e)}
