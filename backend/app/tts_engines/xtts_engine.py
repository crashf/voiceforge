"""XTTS v2 engine — local voice cloning and TTS."""

import asyncio
import logging
import subprocess
from pathlib import Path

from .base import TTSEngine, TTSResult, VoiceCloneResult

logger = logging.getLogger(__name__)


def _ensure_wav(audio_path: Path) -> Path:
    """Convert audio to 22050Hz mono WAV if not already WAV. Returns path to WAV file."""
    if audio_path.suffix.lower() == ".wav":
        return audio_path
    wav_path = audio_path.with_suffix(".wav")
    if wav_path.exists():
        return wav_path
    logger.info(f"Converting {audio_path} to WAV for XTTS...")
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(audio_path), "-ar", "22050", "-ac", "1", str(wav_path)],
        capture_output=True, check=True,
    )
    return wav_path


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
            import os
            import torch
            os.environ["COQUI_TOS_AGREED"] = "1"
            # PyTorch 2.6+ defaults weights_only=True which breaks XTTS model loading
            _orig_load = torch.load
            def _patched_load(*args, **kwargs):
                kwargs.setdefault("weights_only", False)
                return _orig_load(*args, **kwargs)
            torch.load = _patched_load
            from TTS.api import TTS
            logger.info(f"Loading XTTS model on {self.device}...")
            self._tts = TTS(self.model_name).to(self.device)
            torch.load = _orig_load  # restore original
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
                ref_path = Path(reference_audio)
                ref_dir = ref_path.parent

                # Collect ALL wav samples in the voice directory for multi-reference
                all_wavs = sorted(ref_dir.glob("sample_*_trimmed.wav"))
                if not all_wavs:
                    # Fallback: convert and trim the primary reference
                    all_wavs = [_ensure_wav(ref_path)]

                speaker_wav = [str(w) for w in all_wavs]
                logger.info(f"Using {len(speaker_wav)} reference samples: {speaker_wav}")

                tts.tts_to_file(
                    text=text,
                    file_path=str(output_path),
                    speaker_wav=speaker_wav,
                    language=language,
                    speed=speed,
                )
            else:
                # XTTS v2 requires speaker_wav — no "default" speaker without one.
                tts.tts_to_file(
                    text=text,
                    file_path=str(output_path),
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

        # Copy samples to voice directory, convert to WAV, and trim to 10s
        reference_paths = []
        for i, sample in enumerate(sample_paths):
            dest = output_dir / f"sample_{i}{Path(sample).suffix}"
            shutil.copy2(sample, dest)
            # Convert to WAV for XTTS compatibility
            wav_dest = _ensure_wav(dest)
            # Trim to 10 seconds (XTTS works best with 6-12s clips)
            trimmed = output_dir / f"sample_{i}_trimmed.wav"
            subprocess.run(
                ["ffmpeg", "-y", "-i", str(wav_dest), "-t", "10", "-ar", "22050", "-ac", "1", str(trimmed)],
                capture_output=True, check=True,
            )
            reference_paths.append(trimmed)

        # Use the first sample as primary reference path
        primary = str(reference_paths[0])

        return VoiceCloneResult(
            voice_id=name,
            embedding_path=Path(primary),
            metadata={"all_samples": [str(p) for p in reference_paths]},
        )

    async def list_voices(self) -> list[dict]:
        # XTTS v2 is a zero-shot cloning model — no built-in speaker list
        return []

    async def health_check(self) -> dict:
        try:
            self._get_tts()
            return {"engine": self.name, "status": "ready", "device": self.device}
        except Exception as e:
            return {"engine": self.name, "status": "error", "error": str(e)}
