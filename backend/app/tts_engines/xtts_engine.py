"""XTTS v2 engine — supports fine-tuned models for voice cloning and TTS."""

import asyncio
import logging
import subprocess
from pathlib import Path

from .base import TTSEngine, TTSResult, VoiceCloneResult

logger = logging.getLogger(__name__)

FINETUNED_MODEL_DIR = Path("/opt/voiceforge/backend/models/wayne_finetuned")


def _ensure_wav(audio_path: Path) -> Path:
    """Convert audio to 22050Hz mono WAV if not already WAV."""
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
        self._finetuned_loaded = False
        self._conditioning_cache: dict[str, tuple] = {}

    def _get_tts(self):
        """Lazy-load the TTS model, then swap in fine-tuned weights if available."""
        if self._tts is None:
            import os
            import torch
            os.environ["COQUI_TOS_AGREED"] = "1"
            _orig_load = torch.load
            def _patched_load(*args, **kwargs):
                kwargs.setdefault("weights_only", False)
                return _orig_load(*args, **kwargs)
            torch.load = _patched_load

            from TTS.api import TTS
            logger.info(f"Loading XTTS model on {self.device}...")
            self._tts = TTS(self.model_name).to(self.device)

            # Load fine-tuned weights if available
            ft_model_path = FINETUNED_MODEL_DIR / "model.pth"
            if ft_model_path.exists() and not self._finetuned_loaded:
                logger.info(f"Loading fine-tuned weights from {ft_model_path}...")
                checkpoint = torch.load(str(ft_model_path), map_location=self.device, weights_only=False)
                model_state = checkpoint.get("model", checkpoint)
                # Strip "xtts." prefix from trainer checkpoint keys to match model
                cleaned = {}
                for k, v in model_state.items():
                    clean_key = k.replace("xtts.", "", 1) if k.startswith("xtts.") else k
                    cleaned[clean_key] = v
                result = self._tts.synthesizer.tts_model.load_state_dict(cleaned, strict=False)
                logger.info(f"Fine-tuned weights loaded: {len(cleaned)} keys, missing={len(result.missing_keys)}, unexpected={len(result.unexpected_keys)}")
                self._finetuned_loaded = True
                logger.info("Fine-tuned model loaded successfully!")
            else:
                logger.info("Using base XTTS v2 model (no fine-tuned weights found).")

            torch.load = _orig_load
            logger.info("XTTS model ready.")
        return self._tts

    def _get_conditioning(self, voice_dir: Path):
        """Load or compute speaker conditioning latents for a voice."""
        import torch
        cache_key = str(voice_dir)

        if cache_key in self._conditioning_cache:
            return self._conditioning_cache[cache_key]

        conditioning_path = voice_dir / "conditioning.pt"
        if conditioning_path.exists():
            logger.info(f"Loading cached conditioning from {conditioning_path}")
            data = torch.load(str(conditioning_path), weights_only=True)
            result = (data["gpt_cond_latent"], data["speaker_embedding"])
            self._conditioning_cache[cache_key] = result
            return result

        # Compute from samples
        tts = self._get_tts()
        model = tts.synthesizer.tts_model

        all_wavs = sorted(voice_dir.glob("sample_*.wav"))
        full_wavs = [w for w in all_wavs if "_trimmed" not in w.name]
        if not full_wavs:
            full_wavs = all_wavs
        if not full_wavs:
            raise ValueError(f"No WAV samples found in {voice_dir}")

        sample_paths = [str(w) for w in full_wavs]
        logger.info(f"Computing conditioning from {len(sample_paths)} samples: {sample_paths}")

        gpt_cond_latent, speaker_embedding = model.get_conditioning_latents(audio_path=sample_paths)

        torch.save({"gpt_cond_latent": gpt_cond_latent, "speaker_embedding": speaker_embedding},
                   str(conditioning_path))
        self._conditioning_cache[cache_key] = (gpt_cond_latent, speaker_embedding)
        logger.info(f"Saved conditioning to {conditioning_path}")

        return gpt_cond_latent, speaker_embedding

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
            import torch
            import torchaudio

            if reference_audio and Path(reference_audio).exists():
                ref_dir = Path(reference_audio).parent

                # Invalidate old conditioning cache if we loaded a fine-tuned model
                # (embeddings from base model won't match fine-tuned model)
                if self._finetuned_loaded:
                    cond_file = ref_dir / "conditioning.pt"
                    cache_key = str(ref_dir)
                    if cache_key in self._conditioning_cache:
                        del self._conditioning_cache[cache_key]
                    if cond_file.exists():
                        cond_file.unlink()
                        logger.info("Cleared old conditioning cache for fine-tuned model")

                gpt_cond_latent, speaker_embedding = self._get_conditioning(ref_dir)
                model = tts.synthesizer.tts_model

                logger.info(f"Generating with {'fine-tuned' if self._finetuned_loaded else 'base'} model")
                out = model.inference(
                    text=text,
                    language=language,
                    gpt_cond_latent=gpt_cond_latent,
                    speaker_embedding=speaker_embedding,
                    speed=speed,
                    temperature=0.3,
                    length_penalty=1.0,
                    repetition_penalty=5.0,
                    top_k=30,
                    top_p=0.65,
                )
                wav = torch.tensor(out["wav"]).unsqueeze(0)
                torchaudio.save(str(output_path), wav, 24000)
            else:
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
        import shutil

        output_dir.mkdir(parents=True, exist_ok=True)

        old_cond = output_dir / "conditioning.pt"
        if old_cond.exists():
            old_cond.unlink()
        cache_key = str(output_dir)
        self._conditioning_cache.pop(cache_key, None)

        wav_paths = []
        for i, sample in enumerate(sample_paths):
            dest = output_dir / f"sample_{i}{Path(sample).suffix}"
            shutil.copy2(sample, dest)
            wav_dest = _ensure_wav(dest)
            wav_paths.append(wav_dest)

        logger.info(f"Pre-computing conditioning for {name} from {len(wav_paths)} samples...")
        gpt_cond_latent, speaker_embedding = await asyncio.to_thread(
            self._compute_conditioning, wav_paths, output_dir
        )
        logger.info(f"Conditioning computed and cached for {name}")

        primary = str(wav_paths[0])
        return VoiceCloneResult(
            voice_id=name,
            embedding_path=Path(primary),
            metadata={"all_samples": [str(p) for p in wav_paths], "has_conditioning": True},
        )

    def _compute_conditioning(self, wav_paths: list[Path], output_dir: Path):
        import torch
        tts = self._get_tts()
        model = tts.synthesizer.tts_model
        sample_strs = [str(p) for p in wav_paths]
        gpt_cond_latent, speaker_embedding = model.get_conditioning_latents(audio_path=sample_strs)
        torch.save(
            {"gpt_cond_latent": gpt_cond_latent, "speaker_embedding": speaker_embedding},
            str(output_dir / "conditioning.pt"),
        )
        self._conditioning_cache[str(output_dir)] = (gpt_cond_latent, speaker_embedding)
        return gpt_cond_latent, speaker_embedding

    async def list_voices(self) -> list[dict]:
        return []

    async def health_check(self) -> dict:
        try:
            self._get_tts()
            ft_status = "fine-tuned" if self._finetuned_loaded else "base"
            return {"engine": self.name, "status": "ready", "device": self.device, "model": ft_status}
        except Exception as e:
            return {"engine": self.name, "status": "error", "error": str(e)}
