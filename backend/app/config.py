"""Application configuration via environment variables."""

from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    # App
    app_name: str = "VoiceForge"
    debug: bool = False
    secret_key: str = "change-me-in-production"

    # Database
    database_url: str = "sqlite+aiosqlite:///./voiceforge.db"

    # Storage paths
    data_dir: Path = Path("./data")
    voices_dir: Path = Path("./data/voices")
    projects_dir: Path = Path("./data/projects")

    # TTS Engine defaults
    default_tts_engine: str = "xtts"  # xtts | openai | elevenlabs | ollama

    # XTTS (local)
    xtts_model: str = "tts_models/multilingual/multi-dataset/xtts_v2"
    xtts_device: str = "cpu"  # cpu | cuda

    # OpenAI TTS
    openai_api_key: str = ""
    openai_tts_model: str = "tts-1-hd"
    openai_default_voice: str = "nova"

    # ElevenLabs
    elevenlabs_api_key: str = ""

    # Ollama
    ollama_base_url: str = "http://localhost:11434"
    ollama_tts_model: str = ""

    # Audio output defaults
    default_sample_rate: int = 24000
    default_output_format: str = "wav"  # wav | mp3

    # CORS
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3002", "http://localhost:5173"]

    model_config = {"env_prefix": "VF_", "env_file": ".env"}

    def ensure_dirs(self):
        """Create data directories if they don't exist."""
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.voices_dir.mkdir(parents=True, exist_ok=True)
        self.projects_dir.mkdir(parents=True, exist_ok=True)


settings = Settings()
