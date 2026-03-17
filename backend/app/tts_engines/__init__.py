"""Pluggable TTS engine registry."""

from .base import TTSEngine, TTSResult
from .registry import get_engine, list_engines, register_engine

__all__ = ["TTSEngine", "TTSResult", "get_engine", "list_engines", "register_engine"]
