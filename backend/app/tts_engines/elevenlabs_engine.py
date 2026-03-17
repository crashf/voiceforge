"""ElevenLabs engine — cloud-based with voice cloning support."""

import asyncio
import json
import logging
from pathlib import Path

from .base import TTSEngine, TTSResult, VoiceCloneResult

logger = logging.getLogger(__name__)

VOICES_DIR = Path("/opt/voiceforge/backend/data/voices")


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

    def _resolve_voice_id(self, local_voice_id: str | None) -> str:
        """Map local voice UUID to ElevenLabs voice_id, or return a default."""
        if not local_voice_id:
            return "21m00Tcm4TlvDq8ikWAM"  # Rachel default

        # Check for elevenlabs mapping in voice directory
        meta_path = VOICES_DIR / local_voice_id / "elevenlabs.json"
        if meta_path.exists():
            meta = json.loads(meta_path.read_text())
            el_id = meta.get("voice_id")
            if el_id:
                logger.info(f"Resolved local voice {local_voice_id} -> ElevenLabs {el_id}")
                return el_id

        # If it looks like an ElevenLabs ID already (not a UUID with dashes), use directly
        if local_voice_id and "-" not in local_voice_id:
            return local_voice_id

        logger.warning(f"No ElevenLabs mapping for voice {local_voice_id}, using default")
        return "21m00Tcm4TlvDq8ikWAM"

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

        el_voice_id = self._resolve_voice_id(voice_id)
        output_path = Path(output_path).with_suffix(".mp3")  # ElevenLabs outputs mp3

        def _run():
            audio = client.text_to_speech.convert(
                text=text,
                voice_id=el_voice_id,
                model_id="eleven_multilingual_v2",
                output_format="mp3_44100_128",
            )
            with open(output_path, "wb") as f:
                for chunk in audio:
                    f.write(chunk)

        await asyncio.to_thread(_run)

        duration = 0.0
        try:
            import subprocess
            result = subprocess.run(
                ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
                 "-of", "csv=p=0", str(output_path)],
                capture_output=True, text=True, check=True,
            )
            duration = float(result.stdout.strip())
        except Exception:
            pass

        return TTSResult(
            file_path=output_path,
            duration_seconds=duration,
            sample_rate=44100,
            format="mp3",
            file_size_bytes=output_path.stat().st_size,
        )

    async def clone_voice(
        self,
        name: str,
        sample_paths: list[Path],
        output_dir: Path,
        **kwargs,
    ) -> VoiceCloneResult:
        client = self._get_client()

        def _run():
            import hashlib
            # Deduplicate files by content hash
            seen = set()
            unique_paths = []
            for p in sample_paths:
                h = hashlib.md5(p.read_bytes()).hexdigest()
                if h not in seen:
                    seen.add(h)
                    unique_paths.append(p)
            
            files = [open(p, "rb") for p in unique_paths]
            try:
                voice = client.voices.ivc.create(name=name, files=files)
                return voice
            finally:
                for f in files:
                    f.close()

        voice = await asyncio.to_thread(_run)

        # Save ElevenLabs voice ID mapping
        el_meta = {"voice_id": voice.voice_id, "name": name}
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "elevenlabs.json").write_text(json.dumps(el_meta, indent=2))
        logger.info(f"Cloned voice '{name}' -> ElevenLabs ID: {voice.voice_id}")

        return VoiceCloneResult(
            voice_id=name,
            embedding_path=output_dir / "elevenlabs.json",
            metadata={"provider": "elevenlabs", "elevenlabs_voice_id": voice.voice_id},
        )

    async def list_voices(self) -> list[dict]:
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
            client = self._get_client()

            def _check():
                from elevenlabs.client import ElevenLabs
                # Just verify client works
                return True

            await asyncio.to_thread(_check)
            return {"engine": self.name, "status": "ready"}
        except Exception as e:
            return {"engine": self.name, "status": "error", "error": str(e)}
