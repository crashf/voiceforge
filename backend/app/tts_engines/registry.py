"""Engine registry — register and retrieve TTS backends by name."""

from .base import TTSEngine

_engines: dict[str, TTSEngine] = {}


def register_engine(engine: TTSEngine):
    """Register a TTS engine instance."""
    _engines[engine.name] = engine


def get_engine(name: str) -> TTSEngine:
    """Get a registered engine by name."""
    if name not in _engines:
        available = ", ".join(_engines.keys()) or "(none)"
        raise ValueError(f"TTS engine '{name}' not found. Available: {available}")
    return _engines[name]


def list_engines() -> list[dict]:
    """List all registered engines with their capabilities."""
    return [
        {
            "name": e.name,
            "supports_cloning": e.supports_cloning,
            "supports_streaming": e.supports_streaming,
        }
        for e in _engines.values()
    ]
