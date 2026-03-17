"""Project management API — CRUD + clip generation."""

import io
import shutil
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..config import settings
from ..database import get_db
from ..models import Project, Clip, Voice
from ..tts_engines import get_engine

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    client_name: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    client_name: str | None = None


class ClipCreate(BaseModel):
    title: str
    text: str
    voice_id: str | None = None
    engine: str = "xtts"
    speed: float = 1.0
    output_format: str = "wav"
    language: str = "en"


class BatchClipCreate(BaseModel):
    clips: list[ClipCreate]


# ── Projects ──

@router.get("")
async def list_projects(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project).options(selectinload(Project.clips)).order_by(Project.updated_at.desc())
    )
    projects = result.scalars().all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "client_name": p.client_name,
            "clip_count": len(p.clips),
            "created_at": p.created_at.isoformat(),
            "updated_at": p.updated_at.isoformat(),
        }
        for p in projects
    ]


@router.get("/{project_id}")
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project).options(selectinload(Project.clips)).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")

    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "client_name": project.client_name,
        "created_at": project.created_at.isoformat(),
        "updated_at": project.updated_at.isoformat(),
        "clips": [
            {
                "id": c.id,
                "title": c.title,
                "text": c.text,
                "voice_id": c.voice_id,
                "engine": c.engine,
                "speed": c.speed,
                "status": c.status,
                "duration_seconds": c.duration_seconds,
                "file_size_bytes": c.file_size_bytes,
                "output_format": c.output_format,
                "error_message": c.error_message,
                "created_at": c.created_at.isoformat(),
            }
            for c in sorted(project.clips, key=lambda c: c.created_at)
        ],
    }


@router.post("")
async def create_project(data: ProjectCreate, db: AsyncSession = Depends(get_db)):
    project = Project(**data.model_dump())
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return {"id": project.id, "name": project.name}


@router.patch("/{project_id}")
async def update_project(project_id: str, data: ProjectUpdate, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(project, key, val)
    await db.commit()
    await db.refresh(project)
    return {"id": project.id, "name": project.name}


@router.delete("/{project_id}")
async def delete_project(project_id: str, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    # Remove project files
    project_dir = settings.projects_dir / project.id
    if project_dir.exists():
        shutil.rmtree(project_dir)
    await db.delete(project)
    await db.commit()
    return {"status": "deleted"}


# ── Clips ──

@router.post("/{project_id}/clips")
async def create_clip(project_id: str, data: ClipCreate, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    clip = Clip(project_id=project_id, **data.model_dump())
    db.add(clip)
    await db.commit()
    await db.refresh(clip)
    return {"id": clip.id, "title": clip.title, "status": clip.status}


@router.post("/{project_id}/clips/batch")
async def create_clips_batch(project_id: str, data: BatchClipCreate, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    clips = []
    for clip_data in data.clips:
        clip = Clip(project_id=project_id, **clip_data.model_dump())
        db.add(clip)
        clips.append(clip)

    await db.commit()
    return {"created": len(clips), "clip_ids": [c.id for c in clips]}


@router.patch("/{project_id}/clips/{clip_id}")
async def update_clip(project_id: str, clip_id: str, data: dict, db: AsyncSession = Depends(get_db)):
    """Update a clip's text, title, voice, speed, etc."""
    clip = await db.get(Clip, clip_id)
    if not clip or clip.project_id != project_id:
        raise HTTPException(404, "Clip not found")

    allowed = {"title", "text", "voice_id", "engine", "speed", "language", "output_format"}
    for key, val in data.items():
        if key in allowed:
            setattr(clip, key, val)

    # Reset status so user can re-generate
    clip.status = "pending"
    clip.error_message = None
    await db.commit()
    await db.refresh(clip)
    return {"id": clip.id, "title": clip.title, "status": clip.status}


@router.post("/{project_id}/clips/{clip_id}/generate")
async def generate_clip(project_id: str, clip_id: str, db: AsyncSession = Depends(get_db)):
    """Generate audio for a clip using the configured TTS engine."""
    clip = await db.get(Clip, clip_id)
    if not clip or clip.project_id != project_id:
        raise HTTPException(404, "Clip not found")

    clip.status = "generating"
    await db.commit()

    try:
        engine = get_engine(clip.engine)

        # Get voice reference audio if it's a cloned voice
        reference_audio = None
        if clip.voice_id:
            voice = await db.get(Voice, clip.voice_id)
            if voice and voice.embedding_path:
                reference_audio = Path(voice.embedding_path)

        # Output path
        project_dir = settings.projects_dir / project_id
        project_dir.mkdir(parents=True, exist_ok=True)
        output_path = project_dir / f"{clip.id}.{clip.output_format}"

        result = await engine.generate(
            text=clip.text,
            output_path=output_path,
            voice_id=clip.voice_id,
            reference_audio=reference_audio,
            speed=clip.speed,
            output_format=clip.output_format,
        )

        clip.file_path = str(result.file_path)
        clip.duration_seconds = result.duration_seconds
        clip.file_size_bytes = result.file_size_bytes
        clip.status = "done"
        clip.error_message = None

    except Exception as e:
        clip.status = "error"
        clip.error_message = str(e)

    await db.commit()
    await db.refresh(clip)

    return {
        "id": clip.id,
        "status": clip.status,
        "duration_seconds": clip.duration_seconds,
        "file_size_bytes": clip.file_size_bytes,
        "error": clip.error_message,
    }


@router.get("/{project_id}/clips/{clip_id}/audio")
async def download_clip_audio(project_id: str, clip_id: str, db: AsyncSession = Depends(get_db)):
    clip = await db.get(Clip, clip_id)
    if not clip or clip.project_id != project_id:
        raise HTTPException(404, "Clip not found")
    if not clip.file_path or not Path(clip.file_path).exists():
        raise HTTPException(404, "Audio file not found — generate the clip first")

    return FileResponse(
        clip.file_path,
        media_type=f"audio/{clip.output_format}",
        filename=f"{clip.title}.{clip.output_format}",
    )


@router.delete("/{project_id}/clips/{clip_id}")
async def delete_clip(project_id: str, clip_id: str, db: AsyncSession = Depends(get_db)):
    clip = await db.get(Clip, clip_id)
    if not clip or clip.project_id != project_id:
        raise HTTPException(404, "Clip not found")
    if clip.file_path and Path(clip.file_path).exists():
        Path(clip.file_path).unlink()
    await db.delete(clip)
    await db.commit()
    return {"status": "deleted"}


@router.get("/{project_id}/export")
async def export_project(project_id: str, db: AsyncSession = Depends(get_db)):
    """Export all generated clips as a ZIP file."""
    result = await db.execute(
        select(Project).options(selectinload(Project.clips)).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for clip in project.clips:
            if clip.file_path and Path(clip.file_path).exists():
                arcname = f"{clip.title}.{clip.output_format}"
                zf.write(clip.file_path, arcname)

    buf.seek(0)
    safe_name = project.name.replace(" ", "_").replace("/", "-")
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.zip"'},
    )
