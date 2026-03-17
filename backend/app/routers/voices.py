"""Voice management API — CRUD + cloning."""

import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..database import get_db
from ..models import Voice, VoiceSample
from ..tts_engines import get_engine

router = APIRouter(prefix="/voices", tags=["voices"])


@router.get("")
async def list_voices(db: AsyncSession = Depends(get_db)):
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Voice).options(selectinload(Voice.samples)).order_by(Voice.created_at.desc())
    )
    voices = result.scalars().all()
    return [
        {
            "id": v.id,
            "name": v.name,
            "description": v.description,
            "engine": v.engine,
            "is_cloned": v.is_cloned,
            "is_builtin": v.is_builtin,
            "language": v.language,
            "created_at": v.created_at.isoformat(),
            "sample_count": len(v.samples) if v.samples else 0,
        }
        for v in voices
    ]


@router.get("/{voice_id}")
async def get_voice(voice_id: str, db: AsyncSession = Depends(get_db)):
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Voice).options(selectinload(Voice.samples)).where(Voice.id == voice_id)
    )
    voice = result.scalar_one_or_none()
    if not voice:
        raise HTTPException(404, "Voice not found")
    return {
        "id": voice.id,
        "name": voice.name,
        "description": voice.description,
        "engine": voice.engine,
        "is_cloned": voice.is_cloned,
        "is_builtin": voice.is_builtin,
        "language": voice.language,
        "provider_voice_id": voice.provider_voice_id,
        "embedding_path": voice.embedding_path,
        "created_at": voice.created_at.isoformat(),
        "samples": [
            {
                "id": s.id,
                "filename": s.filename,
                "duration_seconds": s.duration_seconds,
                "created_at": s.created_at.isoformat(),
            }
            for s in voice.samples
        ],
    }


@router.post("")
async def create_voice(
    name: str = Form(...),
    description: str = Form(None),
    engine: str = Form("xtts"),
    language: str = Form("en"),
    provider_voice_id: str = Form(None),
    db: AsyncSession = Depends(get_db),
):
    import uuid
    voice_id = str(uuid.uuid4())
    voice = Voice(
        id=voice_id,
        name=name,
        description=description,
        engine=engine,
        language=language,
        provider_voice_id=provider_voice_id,
        is_cloned=False,
    )
    db.add(voice)
    await db.commit()
    return {"id": voice_id, "name": name}


@router.post("/{voice_id}/clone")
async def clone_voice(
    voice_id: str,
    samples: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload audio samples and create a cloned voice."""
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Voice).options(selectinload(Voice.samples)).where(Voice.id == voice_id)
    )
    voice = result.scalar_one_or_none()
    if not voice:
        raise HTTPException(404, "Voice not found")

    engine = get_engine(voice.engine)
    if not engine.supports_cloning:
        raise HTTPException(400, f"Engine '{voice.engine}' does not support voice cloning.")

    # Save uploaded samples
    voice_dir = settings.voices_dir / voice.id
    voice_dir.mkdir(parents=True, exist_ok=True)

    sample_paths = []
    for upload in samples:
        dest = voice_dir / upload.filename
        with open(dest, "wb") as f:
            shutil.copyfileobj(upload.file, f)
        sample_paths.append(dest)

        # Get duration
        duration = None
        try:
            import soundfile as sf
            info = sf.info(str(dest))
            duration = info.duration
        except Exception:
            pass

        sample = VoiceSample(
            voice_id=voice.id,
            filename=upload.filename,
            file_path=str(dest),
            duration_seconds=duration,
        )
        db.add(sample)

    # Run cloning
    result = await engine.clone_voice(
        name=voice.name,
        sample_paths=sample_paths,
        output_dir=voice_dir,
    )

    voice.is_cloned = True
    voice.embedding_path = str(result.embedding_path) if result.embedding_path else None
    voice.provider_voice_id = result.provider_voice_id

    await db.commit()
    await db.refresh(voice)

    return {"id": voice.id, "name": voice.name, "is_cloned": True, "status": "cloned"}


@router.delete("/{voice_id}")
async def delete_voice(voice_id: str, db: AsyncSession = Depends(get_db)):
    voice = await db.get(Voice, voice_id)
    if not voice:
        raise HTTPException(404, "Voice not found")

    # Remove files
    voice_dir = settings.voices_dir / voice.id
    if voice_dir.exists():
        shutil.rmtree(voice_dir)

    await db.delete(voice)
    await db.commit()
    return {"status": "deleted"}
