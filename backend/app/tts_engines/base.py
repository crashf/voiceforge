"""Abstract base for all TTS engines."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class TTSResult:
    """Result of a TTS generation."""
    file_path: Path
    duration_seconds: float
    sample_rate: int
    format: str  # wav, mp3, etc.
    file_size_bytes: int = 0
    metadata: dict = field(default_factory=dict)


@dataclass
class VoiceCloneResult:
    """Result of a voice cloning operation."""
    voice_id: str
    embedding_path: Path | None = None
    provider_voice_id: str | None = None
    metadata: dict = field(default_factory=dict)


class TTSEngine(ABC):
    """Base class for TTS engines. All engines must implement these methods."""

    name: str = "base"
    supports_cloning: bool = False
    supports_streaming: bool = False

    @abstractmethod
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
        """Generate speech from text."""
        ...

    @abstractmethod
    async def clone_voice(
        self,
        name: str,
        sample_paths: list[Path],
        output_dir: Path,
        **kwargs,
    ) -> VoiceCloneResult:
        """Clone a voice from audio samples. Raises NotImplementedError if unsupported."""
        ...

    @abstractmethod
    async def list_voices(self) -> list[dict]:
        """List available voices for this engine."""
        ...

    async def health_check(self) -> dict:
        """Check if the engine is available and ready."""
        return {"engine": self.name, "status": "unknown"}
