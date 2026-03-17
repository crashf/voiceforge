"""XTTS v2 engine — local voice cloning and TTS."""

import asyncio
import logging
from pathlib import Path

from .base import TTSEngine, TTSResult, VoiceCloneResult

logger = logging.getLogger(__name__)


class XTTSEngine(TTSEngine):
    name = "xtts"
    supports_cloning = True
    supports_streaming = False

    def __init__(self, model_name: str = "tts_models/multilingual/multi-dataset/xtts_v2", device: str = "cpu"):
        self.model_name = model_name
        self.device = device
        self._tts = None

    def _get_tts(self):
        """Lazy-load the TTS model (heavy, only load once)."""
        if self._tts is None:
            from TTS.api import TTS
            logger.info(f"Loading XTTS model on {self.device}...")
            self._tts = TTS(self.model_name).to(self.device)
            logger.info("XTTS model loaded.")
        return self._tts

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
        tts = self._get_tts()
        output_path = Path(output_path).with_suffix(f".{output_format}")

        def _run():
            if reference_audio and Path(reference_audio).exists():
                # Voice cloning mode — use reference audio
                tts.tts_to_file(
                    text=text,
                    file_path=str(output_path),
                    speaker_wav=str(reference_audio),
                    language=language,
                    speed=speed,
                )
            else:
                # Use default speaker if available
                speaker = None
                if tts.speakers:
                    speaker = tts.speakers[0]
                tts.tts_to_file(
                    text=text,
                    file_path=str(output_path),
                    speaker=speaker,
                    language=language,
                    speed=speed,
                )

        await asyncio.to_thread(_run)

        import soundfile as sf
        info = sf.info(str(output_path))

        return TTSResult(
            file_path=output_path,
            duration_seconds=info.duration,
            sample_rate=info.samplerate,
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
        """For XTTS, cloning is zero-shot — we just store the reference audio.
        The best sample is used as the reference during generation."""
        import shutil

        output_dir.mkdir(parents=True, exist_ok=True)

        # Copy samples to voice directory
        reference_paths = []
        for i, sample in enumerate(sample_paths):
            dest = output_dir / f"sample_{i}{Path(sample).suffix}"
            shutil.copy2(sample, dest)
            reference_paths.append(dest)

        # Use the first (or longest) sample as primary reference
        primary = str(reference_paths[0])

        return VoiceCloneResult(
            voice_id=name,
            embedding_path=Path(primary),
            metadata={"all_samples": [str(p) for p in reference_paths]},
        )

    async def list_voices(self) -> list[dict]:
        tts = self._get_tts()
        voices = []
        if tts.speakers:
            for s in tts.speakers:
                voices.append({"id": s, "name": s, "engine": self.name})
        return voices

    async def health_check(self) -> dict:
        try:
            self._get_tts()
            return {"engine": self.name, "status": "ready", "device": self.device}
        except Exception as e:
            return {"engine": self.name, "status": "error", "error": str(e)}
