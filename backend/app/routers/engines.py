"""TTS Engine info API."""

from fastapi import APIRouter

from ..tts_engines import list_engines, get_engine

router = APIRouter(prefix="/engines", tags=["engines"])


@router.get("")
async def get_engines():
    """List all registered TTS engines and their capabilities."""
    return list_engines()


@router.get("/{engine_name}/health")
async def engine_health(engine_name: str):
    """Check health of a specific engine."""
    try:
        engine = get_engine(engine_name)
        return await engine.health_check()
    except ValueError as e:
        return {"engine": engine_name, "status": "not_found", "error": str(e)}


@router.get("/{engine_name}/voices")
async def engine_voices(engine_name: str):
    """List available voices for an engine."""
    engine = get_engine(engine_name)
    return await engine.list_voices()
