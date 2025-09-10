from typing import List, Optional

from fastapi import Request, UploadFile, File, Query
from loguru import logger

from app.config import config
from app.controllers.v1.base import new_router
from app.models.schema import VideoAspect, MaterialInfo
from app.services import material as material_service
from app.utils import utils
import os
import glob


router = new_router()


def _material_base_dir(task_id: Optional[str] = None) -> str:
    base = (config.app.get("material_directory", "") or "").strip()
    if base == "task" and task_id:
        return utils.task_dir(task_id)
    if base and os.path.isdir(base):
        return base
    # default cache dir
    return utils.storage_dir("cache_videos", create=True)


@router.get("/materials", summary="List local materials (videos/images)")
def list_materials(
    request: Request,
    task_id: Optional[str] = Query(None, description="Task ID when material_directory=task"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    q: Optional[str] = Query(None, description="Filter by filename contains"),
):
    request_id = request.headers.get("X-Request-ID", "")
    try:
        base_dir = _material_base_dir(task_id)
        if not os.path.isdir(base_dir):
            return utils.get_response(200, {"files": [], "total": 0, "page": page, "page_size": page_size})

        video_exts = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".mpg", ".mpeg", ".m4v"}
        image_exts = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}
        files: List[str] = []
        # only list top-level files to avoid heavy recursion
        for entry in os.scandir(base_dir):
            if entry.is_file():
                ext = os.path.splitext(entry.name)[1].lower()
                if ext in video_exts or ext in image_exts:
                    if q and q.strip() and q.strip().lower() not in entry.name.lower():
                        continue
                    files.append(entry.path)
        files.sort()

        total = len(files)
        start = (page - 1) * page_size
        end = min(start + page_size, total)
        page_files = files[start:end]

        items = []
        for f in page_files:
            item = {"name": os.path.basename(f), "size": os.path.getsize(f), "file": f}
            # best-effort duration probe for videos
            try:
                ext = os.path.splitext(f)[1].lower()
                if ext not in image_exts:
                    from moviepy.video.io.VideoFileClip import VideoFileClip

                    clip = VideoFileClip(f)
                    item["duration"] = float(clip.duration)
                    clip.close()
            except Exception:
                pass
            items.append(item)

        return utils.get_response(200, {"files": items, "total": total, "page": page, "page_size": page_size})
    except Exception as e:
        logger.error(f"list materials failed: {str(e)}")
        return utils.get_response(400, message=f"{request_id}: {str(e)}")


@router.post("/materials", summary="Upload a material file (video/image)")
def upload_material(
    request: Request,
    file: UploadFile = File(...),
    task_id: Optional[str] = Query(None, description="Task ID when material_directory=task"),
):
    request_id = request.headers.get("X-Request-ID", "")
    try:
        allowed = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".mpg", ".mpeg", ".m4v", ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in allowed:
            return utils.get_response(400, message=f"{request_id}: unsupported file type {ext}")

        base_dir = _material_base_dir(task_id)
        os.makedirs(base_dir, exist_ok=True)
        save_path = os.path.join(base_dir, file.filename)
        # if file exists, overwrite
        with open(save_path, "wb+") as buffer:
            file.file.seek(0)
            buffer.write(file.file.read())

        # if uploading an image, convert it into a short mp4 clip for compatibility
        try:
            if ext in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}:
                from app.services import video as video_service
                mats = [MaterialInfo(url=save_path)]
                mats = video_service.preprocess_video(mats, clip_duration=5)
                if mats and mats[0].url:
                    save_path = mats[0].url
        except Exception as e:
            logger.warning(f"image preprocess failed: {str(e)}")

        res = {"file": save_path, "name": os.path.basename(save_path), "size": os.path.getsize(save_path)}
        # probe duration best-effort
        try:
            from moviepy.video.io.VideoFileClip import VideoFileClip

            clip = VideoFileClip(save_path)
            res["duration"] = float(clip.duration)
            clip.close()
        except Exception:
            pass
        return utils.get_response(200, res)
    except Exception as e:
        logger.error(f"upload material failed: {str(e)}")
        return utils.get_response(400, message=f"{request_id}: {str(e)}")


@router.get("/materials/search", summary="Search third-party materials (pexels/pixabay)")
def search_materials(
    request: Request,
    q: str = Query(..., description="search term"),
    source: str = Query("pexels", pattern="^(pexels|pixabay)$"),
    min_dur: int = Query(3, ge=0),
    aspect: str = Query("9:16", pattern=r"^(9:16|16:9|1:1)$"),
):
    request_id = request.headers.get("X-Request-ID", "")
    try:
        va = VideoAspect.portrait
        if aspect in (VideoAspect.landscape.value, VideoAspect.square.value, VideoAspect.portrait.value):
            va = VideoAspect(aspect)

        if source == "pixabay":
            items = material_service.search_videos_pixabay(q, min_dur, va)
        else:
            items = material_service.search_videos_pexels(q, min_dur, va)

        data = [{"provider": it.provider, "url": it.url, "duration": it.duration, "thumb": getattr(it, 'thumb', '')} for it in items]
        return utils.get_response(200, {"items": data})
    except Exception as e:
        logger.error(f"search materials failed: {str(e)}")
        return utils.get_response(400, message=f"{request_id}: {str(e)}")


@router.post("/materials/download", summary="Download a remote material and return saved path")
def download_material(request: Request, body: dict):
    request_id = request.headers.get("X-Request-ID", "")
    try:
        url = (body or {}).get("url", "").strip()
        task_id = (body or {}).get("task_id", "").strip()
        if not url:
            return utils.get_response(400, message=f"{request_id}: missing url")

        base_dir = _material_base_dir(task_id)
        os.makedirs(base_dir, exist_ok=True)
        saved = material_service.save_video(url, save_dir=base_dir)
        if not saved:
            return utils.get_response(400, message=f"{request_id}: download failed")

        res = {"file": saved, "name": os.path.basename(saved), "size": os.path.getsize(saved)}
        try:
            from moviepy.video.io.VideoFileClip import VideoFileClip

            clip = VideoFileClip(saved)
            res["duration"] = float(clip.duration)
            clip.close()
        except Exception:
            pass
        return utils.get_response(200, res)
    except Exception as e:
        logger.error(f"download material failed: {str(e)}")
        return utils.get_response(400, message=f"{request_id}: {str(e)}")
