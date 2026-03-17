"""ElevenLabs engine — cloud-based with voice cloning support."""

import logging
from pathlib import Path

from .base import TTSEngine, TTSResult, VoiceCloneResult

logger = logging.getLogger(__name__)


class ElevenLabsEngine(TTSEngine):
    name = "elevenlabs"
    supports_cloning = True
    supports_streaming = True

    def __init__(self, api_key: str):
        self.api_key = api_key
        self._client = None

    def _get_client(self):
        if self._client is None:
            from elevenlabs.client import ElevenLabs
            self._client = ElevenLabs(api_key=self.api_key)
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
        import asyncio
        client = self._get_client()

        voice = voice_id or "Rachel"
        output_path = Path(output_path).with_suffix(f".{output_format}")

        def _run():
            audio = client.text_to_speech.convert(
                text=text,
                voice_id=voice,
                model_id="eleven_multilingual_v2",
                output_format="mp3_44100_128",
            )
            # audio is a generator of bytes
            with open(output_path, "wb") as f:
                for chunk in audio:
                    f.write(chunk)

        await asyncio.to_thread(_run)

        duration = 0.0
        try:
            from pydub import AudioSegment
            seg = AudioSegment.from_file(str(output_path))
            duration = len(seg) / 1000.0
        except Exception:
            pass

        return TTSResult(
            file_path=output_path,
            duration_seconds=duration,
            sample_rate=44100,
            format=output_format,
            file_size_bytes=output_path.stat().st_size,
        )

    async def clone_voice(
        self,
        name: str,
        sample_paths: list[Path],
        output_dir: Path,
        **kwargs,
    ) -> VoiceCloneResult:
        import asyncio
        client = self._get_client()

        def _run():
            files = [open(p, "rb") for p in sample_paths]
            try:
                voice = client.clone(name=name, files=files)
                return voice
            finally:
                for f in files:
                    f.close()

        voice = await asyncio.to_thread(_run)

        return VoiceCloneResult(
            voice_id=name,
            provider_voice_id=voice.voice_id,
            metadata={"provider": "elevenlabs"},
        )

    async def list_voices(self) -> list[dict]:
        import asyncio
        client = self._get_client()

        def _run():
            response = client.voices.get_all()
            return [
                {"id": v.voice_id, "name": v.name, "engine": self.name}
                for v in response.voices
            ]

        return await asyncio.to_thread(_run)

    async def health_check(self) -> dict:
        try:
            self._get_client()
            return {"engine": self.name, "status": "ready"}
        except Exception as e:
            return {"engine": self.name, "status": "error", "error": str(e)}
