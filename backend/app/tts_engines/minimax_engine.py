"""MiniMax TTS engine — cloud-based with voice cloning support."""

import asyncio
import hashlib
import json
import logging
import subprocess
from pathlib import Path

import httpx

from .base import TTSEngine, TTSResult, VoiceCloneResult

logger = logging.getLogger(__name__)

VOICES_DIR = Path("/opt/voiceforge/backend/data/voices")
API_BASE = "https://api.minimaxi.chat/v1"
API_BASE_INTL = "https://api.minimax.io/v1"  # International endpoint (for voice clone)


class MiniMaxEngine(TTSEngine):
    name = "minimax"
    supports_cloning = True
    supports_streaming = True

    def __init__(self, api_key: str, model: str = "speech-02-hd"):
        self.api_key = api_key
        self.model = model

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _resolve_voice_id(self, local_voice_id: str | None) -> str:
        """Map local voice UUID to MiniMax voice_id, or return a default system voice."""
        if not local_voice_id:
            return "male-qn-qingse"

        # Check for minimax mapping in voice directory
        meta_path = VOICES_DIR / local_voice_id / "minimax.json"
        if meta_path.exists():
            meta = json.loads(meta_path.read_text())
            mm_id = meta.get("voice_id")
            if mm_id:
                logger.info(f"Resolved local voice {local_voice_id} -> MiniMax {mm_id}")
                return mm_id

        # If it doesn't look like a local UUID, assume it's a MiniMax voice ID
        if local_voice_id and "-" not in local_voice_id:
            return local_voice_id

        logger.warning(f"No MiniMax mapping for voice {local_voice_id}, using default")
        return "male-qn-qingse"

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
        mm_voice_id = self._resolve_voice_id(voice_id)
        output_path = Path(output_path).with_suffix(".mp3")

        payload = {
            "text": text,
            "model": self.model,
            "voice_setting": {
                "voice_id": mm_voice_id,
                "speed": max(0.5, min(2.0, speed)),
            },
            "audio_setting": {
                "format": "mp3",
                "sample_rate": 32000,
            },
        }

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{API_BASE}/t2a_v2",
                headers=self._headers(),
                json=payload,
            )
            data = resp.json()

        status = data.get("base_resp", {}).get("status_code", -1)
        if status != 0:
            msg = data.get("base_resp", {}).get("status_msg", "unknown error")
            raise RuntimeError(f"MiniMax TTS error ({status}): {msg}")

        # Audio comes as hex-encoded bytes
        audio_hex = data["data"]["audio"]
        audio_bytes = bytes.fromhex(audio_hex)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(audio_bytes)

        # Get duration via ffprobe
        duration = 0.0
        try:
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
            sample_rate=32000,
            format="mp3",
            file_size_bytes=output_path.stat().st_size,
            metadata={"model": self.model, "voice_id": mm_voice_id},
        )

    def _normalize_audio(self, input_path: Path, output_path: Path) -> Path:
        """Normalize audio to proper levels and format for MiniMax upload.
        
        MiniMax requires audible audio (not silent) in mp3/m4a/wav format, 10s-5min.
        """
        try:
            subprocess.run(
                [
                    "ffmpeg", "-y", "-i", str(input_path),
                    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
                    "-ar", "44100", "-ac", "1", "-b:a", "192k",
                    str(output_path),
                ],
                capture_output=True, check=True, timeout=60,
            )
            # Verify the output has audible audio
            result = subprocess.run(
                ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
                 "-of", "csv=p=0", str(output_path)],
                capture_output=True, text=True, check=True,
            )
            duration = float(result.stdout.strip())
            if duration < 10:
                raise RuntimeError(f"Audio too short after processing: {duration:.1f}s (need 10s+)")
            logger.info(f"Normalized audio: {duration:.1f}s, {output_path.stat().st_size} bytes")
            return output_path
        except subprocess.CalledProcessError as e:
            logger.warning(f"Audio normalization failed, using original: {e}")
            return input_path

    async def clone_voice(
        self,
        name: str,
        sample_paths: list[Path],
        output_dir: Path,
        **kwargs,
    ) -> VoiceCloneResult:
        """Clone a voice using MiniMax Voice Clone API.
        
        Requires uploading a reference audio file (10s-5min, mp3/m4a/wav).
        The cloned voice_id must be used within 7 days to persist.
        """
        if not sample_paths:
            raise ValueError("At least one audio sample is required for voice cloning")

        # Use the largest sample (likely best quality)
        sample = max(sample_paths, key=lambda p: p.stat().st_size)

        # Normalize audio to ensure proper levels
        output_dir.mkdir(parents=True, exist_ok=True)
        normalized = output_dir / "clone_upload.mp3"
        sample = self._normalize_audio(sample, normalized)

        # Check volume — reject silent audio before wasting an API call
        try:
            vol_result = subprocess.run(
                ["ffmpeg", "-i", str(sample), "-af", "volumedetect", "-f", "null", "/dev/null"],
                capture_output=True, text=True, timeout=30,
            )
            for line in vol_result.stderr.split("\n"):
                if "mean_volume" in line:
                    vol = float(line.split("mean_volume:")[1].strip().split(" ")[0])
                    if vol < -70:
                        raise RuntimeError(
                            f"Audio is too quiet (mean volume: {vol:.1f} dB). "
                            "Your microphone may not be working. Try uploading an audio file instead."
                        )
                    logger.info(f"Audio volume check passed: {vol:.1f} dB")
                    break
        except RuntimeError:
            raise
        except Exception:
            pass  # Don't block on volume check failure

        # Generate a unique voice_id (MiniMax requires alphanumeric + underscores)
        import time
        safe_name = "".join(c if c.isalnum() else "_" for c in name.lower())
        ts = str(int(time.time()))[-6:]
        mm_voice_id = f"{safe_name}_{ts}"

        # Step 1: Upload the audio file (use international endpoint)
        async with httpx.AsyncClient(timeout=120) as client:
            upload_resp = await client.post(
                f"{API_BASE_INTL}/files/upload",
                headers={"Authorization": f"Bearer {self.api_key}"},
                data={"purpose": "voice_clone"},
                files={"file": (sample.name, sample.read_bytes(), "audio/mpeg")},
            )
            upload_data = upload_resp.json()

        if upload_data.get("base_resp", {}).get("status_code", -1) != 0:
            msg = upload_data.get("base_resp", {}).get("status_msg", "upload failed")
            raise RuntimeError(f"MiniMax file upload error: {msg}")

        file_id = upload_data["file"]["file_id"]
        logger.info(f"Uploaded voice sample -> file_id: {file_id}")

        # Step 2: Clone the voice
        clone_payload = {
            "file_id": file_id,
            "voice_id": mm_voice_id,
            "text": f"Hello, my name is {name}. This is a test of voice cloning.",
            "model": self.model,
        }

        async with httpx.AsyncClient(timeout=120) as client:
            clone_resp = await client.post(
                f"{API_BASE_INTL}/voice_clone",
                headers=self._headers(),
                json=clone_payload,
            )
            clone_data = clone_resp.json()

        if clone_data.get("base_resp", {}).get("status_code", -1) != 0:
            msg = clone_data.get("base_resp", {}).get("status_msg", "clone failed")
            raise RuntimeError(f"MiniMax voice clone error: {msg}")

        # Save demo audio if provided
        demo_data = clone_data.get("demo_audio", "")
        if demo_data:
            demo_path = output_dir / "clone_demo.mp3"
            try:
                demo_path.write_bytes(bytes.fromhex(demo_data))
            except ValueError:
                import base64
                try:
                    demo_path.write_bytes(base64.b64decode(demo_data))
                except Exception:
                    logger.warning(f"Could not decode demo_audio (len={len(demo_data)})")
            if demo_path.exists() and demo_path.stat().st_size > 0:
                logger.info(f"Saved clone demo audio: {demo_path}")

        logger.info(f"Cloned voice '{name}' -> MiniMax voice_id: {mm_voice_id}")

        # Save mapping
        output_dir.mkdir(parents=True, exist_ok=True)
        meta = {"voice_id": mm_voice_id, "name": name, "file_id": file_id}
        (output_dir / "minimax.json").write_text(json.dumps(meta, indent=2))

        return VoiceCloneResult(
            voice_id=name,
            embedding_path=output_dir / "minimax.json",
            provider_voice_id=mm_voice_id,
            metadata={"provider": "minimax", "minimax_voice_id": mm_voice_id, "file_id": file_id},
        )

    async def list_voices(self) -> list[dict]:
        """Return known system voices. MiniMax doesn't have a list API."""
        # Popular English system voices
        system_voices = [
            {"id": "male-qn-qingse", "name": "Qingse (Male)", "engine": self.name},
            {"id": "female-shaonv", "name": "Shaonv (Female)", "engine": self.name},
            {"id": "presenter_male", "name": "Presenter Male", "engine": self.name},
            {"id": "presenter_female", "name": "Presenter Female", "engine": self.name},
            {"id": "audiobook_male_1", "name": "Audiobook Male", "engine": self.name},
            {"id": "audiobook_female_1", "name": "Audiobook Female", "engine": self.name},
        ]

        # Add any locally-cloned voices
        if VOICES_DIR.exists():
            for vdir in VOICES_DIR.iterdir():
                mm_meta = vdir / "minimax.json"
                if mm_meta.exists():
                    meta = json.loads(mm_meta.read_text())
                    system_voices.append({
                        "id": meta["voice_id"],
                        "name": meta.get("name", vdir.name),
                        "engine": self.name,
                        "cloned": True,
                    })

        return system_voices

    async def health_check(self) -> dict:
        """Check connectivity without making a billable TTS call."""
        try:
            # Just verify we have an API key configured
            if not self.api_key:
                return {"engine": self.name, "status": "error", "error": "no API key"}
            return {"engine": self.name, "status": "ready", "model": self.model}
        except Exception as e:
            return {"engine": self.name, "status": "error", "error": str(e)}
