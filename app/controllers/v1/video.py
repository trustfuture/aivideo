import glob
import os
import pathlib
import shutil
from typing import Union

from fastapi import BackgroundTasks, Depends, Path, Request, UploadFile
from fastapi.params import File
from fastapi.responses import FileResponse, StreamingResponse
from loguru import logger

from app.config import config
from app.controllers import base
from app.controllers.manager.memory_manager import InMemoryTaskManager
from app.controllers.manager.redis_manager import RedisTaskManager
from app.controllers.v1.base import new_router
from app.models.exception import HttpException
from app.models.schema import (
    AudioRequest,
    BgmRetrieveResponse,
    BgmUploadResponse,
    SegmentsPlanRequest,
    SegmentsPlanResponse,
    SegmentsRenderRequest,
    SegmentsRenderResponse,
    SubtitleRequest,
    TaskDeletionResponse,
    TaskQueryRequest,
    TaskQueryResponse,
    TaskResponse,
    TaskVideoRequest,
)
from app.services import state as sm
from app.services import task as tm
from app.utils import utils
from fastapi.responses import FileResponse

# 认证依赖项
# router = new_router(dependencies=[Depends(base.verify_token)])
router = new_router()

_enable_redis = config.app.get("enable_redis", False)
_redis_host = config.app.get("redis_host", "localhost")
_redis_port = config.app.get("redis_port", 6379)
_redis_db = config.app.get("redis_db", 0)
_redis_password = config.app.get("redis_password", None)
_max_concurrent_tasks = config.app.get("max_concurrent_tasks", 5)

redis_url = f"redis://:{_redis_password}@{_redis_host}:{_redis_port}/{_redis_db}"
# 根据配置选择合适的任务管理器
if _enable_redis:
    task_manager = RedisTaskManager(
        max_concurrent_tasks=_max_concurrent_tasks, redis_url=redis_url
    )
else:
    task_manager = InMemoryTaskManager(max_concurrent_tasks=_max_concurrent_tasks)


@router.post("/videos", response_model=TaskResponse, summary="Generate a short video")
def create_video(
    background_tasks: BackgroundTasks, request: Request, body: TaskVideoRequest
):
    return create_task(request, body, stop_at="video")


@router.post("/subtitle", response_model=TaskResponse, summary="Generate subtitle only")
def create_subtitle(
    background_tasks: BackgroundTasks, request: Request, body: SubtitleRequest
):
    return create_task(request, body, stop_at="subtitle")


@router.post("/audio", response_model=TaskResponse, summary="Generate audio only")
def create_audio(
    background_tasks: BackgroundTasks, request: Request, body: AudioRequest
):
    return create_task(request, body, stop_at="audio")


@router.post(
    "/segments/plan",
    response_model=SegmentsPlanResponse,
    summary="Create a segment plan based on materials and audio",
)
def plan_segments_endpoint(request: Request, body: SegmentsPlanRequest):
    request_id = base.get_task_id(request)
    task_id = utils.get_uuid()
    try:
        # 1. script & terms
        video_script = tm.generate_script(task_id, body)
        video_terms = ""
        if body.video_source != "local":
            video_terms = tm.generate_terms(task_id, body, video_script)

        # snapshot
        tm.save_script_data(task_id, video_script, video_terms, body)

        # 2. audio
        audio_file, audio_duration, sub_maker = tm.generate_audio(task_id, body, video_script)
        if not audio_file:
            raise ValueError("audio generation failed")

        # 2.5 subtitle (generate once here so later renders have subtitles)
        subtitle_path = tm.generate_subtitle(task_id, body, video_script, sub_maker, audio_file)

        # 3. materials
        downloaded_videos = tm.get_video_materials(task_id, body, video_terms, audio_duration)
        if not downloaded_videos:
            raise ValueError("no materials found")

        # 4. segments plan
        from app.services import video as video_service

        segments = video_service.plan_segments(
            task_id=task_id,
            video_paths=downloaded_videos,
            audio_file=audio_file,
            video_aspect=body.video_aspect,
            video_concat_mode=body.video_concat_mode,
            max_clip_duration=body.video_clip_duration,
        )

        # update task state
        # unify audio duration in state with planned segments total to avoid UI mismatch
        try:
            seg_total = round(sum(float(getattr(s, 'duration', 0.0) or 0.0) for s in segments), 3)
        except Exception:
            seg_total = audio_duration
        sm.state.update_task(
            task_id,
            state=1,
            progress=100,
            script=video_script,
            terms=video_terms,
            audio_file=audio_file,
            audio_duration=seg_total,
            subtitle_path=subtitle_path,
            materials=downloaded_videos,
            segments=[s.model_dump() for s in segments],
        )
        # spawn background job to pre-generate thumbnails for faster UI
        utils.run_in_background(video_service.ensure_thumbs, task_id)

        data = {"task_id": task_id, "segments": segments}
        return utils.get_response(200, data)
    except Exception as e:
        raise HttpException(task_id=task_id, status_code=400, message=f"{request_id}: {str(e)}")


@router.get(
    "/tasks/{task_id}/segments",
    response_model=SegmentsPlanResponse,
    summary="Get saved segment plan of task",
)
def get_segments_endpoint(request: Request, task_id: str = Path(..., description="Task ID")):
    from app.services import video as video_service

    request_id = base.get_task_id(request)
    try:
        segments = video_service.load_segments(task_id)
        data = {"task_id": task_id, "segments": segments}
        return utils.get_response(200, data)
    except Exception as e:
        raise HttpException(task_id=task_id, status_code=404, message=f"{request_id}: {str(e)}")


@router.get(
    "/tasks/{task_id}/segments/{segment_id}/thumb",
    summary="Get or generate a thumbnail image for the given segment",
)
def get_segment_thumb_endpoint(request: Request, task_id: str = Path(...), segment_id: str = Path(...)):
    from app.services import video as video_service

    request_id = base.get_task_id(request)
    try:
        path = video_service.get_segment_thumbnail(task_id, segment_id)
        # naive content-type detection by extension
        ext = os.path.splitext(path)[1].lower()
        media = "image/jpeg"
        if ext in [".png"]:
            media = "image/png"
        elif ext in [".webp"]:
            media = "image/webp"
        elif ext in [".gif"]:
            media = "image/gif"
        return FileResponse(path, media_type=media)
    except Exception as e:
        raise HttpException(task_id=task_id, status_code=404, message=f"{request_id}: {str(e)}")


@router.get(
    "/tasks/{task_id}/segments/thumbs",
    summary="Ensure thumbnails for all segments and return their URLs",
)
def list_segment_thumbs_endpoint(request: Request, task_id: str = Path(...)):
    from app.services import video as video_service
    endpoint = config.app.get("endpoint", "")
    if not endpoint:
        endpoint = str(request.base_url)
    endpoint = endpoint.rstrip("/")

    request_id = base.get_task_id(request)
    try:
        segments = video_service.load_segments(task_id)
        result = []
        for s in segments:
            seg_id = s.segment_id if hasattr(s, 'segment_id') else s.get('segment_id')
            if not seg_id:
                continue
            try:
                _ = video_service.get_segment_thumbnail(task_id, seg_id)
                # public path under /tasks
                public_path = f"{endpoint}/tasks/{task_id}/thumbs/{seg_id}.jpg"
                result.append({"segment_id": seg_id, "thumb": public_path})
            except Exception:
                result.append({"segment_id": seg_id, "thumb": ""})
        return utils.get_response(200, {"task_id": task_id, "thumbs": result})
    except Exception as e:
        raise HttpException(task_id=task_id, status_code=404, message=f"{request_id}: {str(e)}")


@router.post(
    "/segments/save",
    response_model=SegmentsPlanResponse,
    summary="Save provided segments plan for a task",
)
def save_segments_endpoint(request: Request, body: SegmentsRenderRequest):
    from app.services import video as video_service

    request_id = base.get_task_id(request)
    task_id = body.task_id
    try:
        if not task_id:
            raise ValueError("missing task_id")
        if not body.segments or len(body.segments) == 0:
            raise ValueError("segments is empty")

        # persist to segments.json
        video_service.save_segments(task_id, body.segments)

        # keep audio_duration consistent with segments sum to avoid UI mismatch
        try:
            seg_total = round(sum(float(getattr(s, 'duration', 0.0) or 0.0) for s in body.segments), 3)
        except Exception:
            seg_total = None

        # update state snapshot
        if seg_total is not None and seg_total > 0:
            sm.state.update_task(task_id, state=1, progress=100, segments=[s.model_dump() for s in body.segments], audio_duration=seg_total)
        else:
            sm.state.update_task(task_id, state=1, progress=100, segments=[s.model_dump() for s in body.segments])

        # pre-generate thumbs in background
        utils.run_in_background(video_service.ensure_thumbs, task_id)

        data = {"task_id": task_id, "segments": body.segments}
        return utils.get_response(200, data)
    except Exception as e:
        raise HttpException(task_id=task_id, status_code=400, message=f"{request_id}: {str(e)}")


@router.post(
    "/segments/render",
    response_model=SegmentsRenderResponse,
    summary="Render video from provided segments plan",
)
def render_segments_endpoint(request: Request, body: SegmentsRenderRequest):
    from app.services import video as video_service

    request_id = base.get_task_id(request)
    task_id = body.task_id
    try:
        task_state = sm.state.get_task(task_id) or {}
        audio_file = task_state.get("audio_file", "")
        subtitle_path = task_state.get("subtitle_path", "")
        # be robust: if state lost fields, fall back to default task file locations
        try:
            task_path = utils.task_dir(task_id)
        except Exception:
            task_path = None
        if (not audio_file) and task_path:
            import os
            candidate = os.path.join(task_path, "audio.mp3")
            if os.path.exists(candidate):
                audio_file = candidate
        if (not subtitle_path) and task_path:
            import os
            candidate = os.path.join(task_path, "subtitle.srt")
            if os.path.exists(candidate):
                subtitle_path = candidate
        if not audio_file:
            raise ValueError("missing audio_file: please run segments/plan first")

        params = body.params
        if params is None:
            # fallback to minimal defaults
            from app.models.schema import VideoParams

            params = VideoParams(
                video_subject="",
                video_aspect=task_state.get("params", {}).get("video_aspect", "9:16"),
                video_concat_mode=task_state.get("params", {}).get("video_concat_mode", "random"),
                video_transition_mode=task_state.get("params", {}).get("video_transition_mode", None),
                video_clip_duration=task_state.get("params", {}).get("video_clip_duration", 5),
            )

        # ensure subtitle exists when enabled
        try:
            import os
            from app.services import subtitle as subtitle_service
            # resolve boolean safely
            sub_enabled = True
            try:
                sub_enabled = bool(getattr(params, 'subtitle_enabled', True))
            except Exception:
                sub_enabled = True
            if sub_enabled and (not subtitle_path or not os.path.exists(subtitle_path)) and audio_file:
                # try to get script content from state or script.json
                script_text = task_state.get('script', '')
                if not script_text:
                    try:
                        import json
                        script_file = os.path.join(utils.task_dir(task_id), 'script.json')
                        if os.path.exists(script_file):
                            with open(script_file, 'r', encoding='utf-8') as fd:
                                s = json.load(fd)
                                script_text = s.get('script', '')
                    except Exception:
                        script_text = ''
                # generate via whisper then correct if script available
                _subtitle_path = os.path.join(utils.task_dir(task_id), 'subtitle.srt')
                subtitle_service.create(audio_file=audio_file, subtitle_file=_subtitle_path)
                if script_text:
                    try:
                        subtitle_service.correct(subtitle_file=_subtitle_path, video_script=script_text)
                    except Exception:
                        pass
                # update local var and state snapshot
                subtitle_path = _subtitle_path
                sm.state.update_task(task_id, subtitle_path=subtitle_path)
        except Exception:
            # best-effort fallback; ignore subtitle generation failure
            pass

        preview_mode = False
        try:
            preview_mode = bool(getattr(body, 'preview', False))
        except Exception:
            preview_mode = False

        preview_label = None
        try:
            if len(body.segments or []) == 1:
                seg0 = body.segments[0]
                preview_label = getattr(seg0, 'segment_id', None) or 'single'
                if not preview_mode:
                    preview_mode = True
        except Exception:
            pass

        combined, final = video_service.render_from_segments(
            task_id=task_id,
            segments=body.segments,
            params=params,
            audio_file=audio_file,
            subtitle_path=subtitle_path,
            preview=preview_mode,
            preview_label=preview_label,
        )

        endpoint = config.app.get("endpoint", "")
        if not endpoint:
            endpoint = str(request.base_url)
        endpoint = endpoint.rstrip("/")
        task_dir = utils.task_dir()
        def to_uri(file):
            if not file:
                return ""
            if not file.startswith(endpoint):
                _uri_path = file.replace(task_dir, "tasks").replace("\\", "/")
                _uri_path = f"{endpoint}/{_uri_path}"
            else:
                _uri_path = file
            return _uri_path

        sm.state.update_task(task_id, state=1, progress=100, videos=[final] if final else [], combined_videos=[combined] if combined else [])
        data = {
            "task_id": task_id,
            "combined_video": to_uri(combined),
            "final_video": to_uri(final),
        }
        return utils.get_response(200, data)
    except Exception as e:
        raise HttpException(task_id=task_id, status_code=400, message=f"{request_id}: {str(e)}")


def create_task(
    request: Request,
    body: Union[TaskVideoRequest, SubtitleRequest, AudioRequest],
    stop_at: str,
):
    task_id = utils.get_uuid()
    request_id = base.get_task_id(request)
    try:
        task = {
            "task_id": task_id,
            "request_id": request_id,
            "params": body.model_dump(),
        }
        sm.state.update_task(task_id)
        task_manager.add_task(tm.start, task_id=task_id, params=body, stop_at=stop_at)
        logger.success(f"Task created: {utils.to_json(task)}")
        return utils.get_response(200, task)
    except ValueError as e:
        raise HttpException(
            task_id=task_id, status_code=400, message=f"{request_id}: {str(e)}"
        )

from fastapi import Query

@router.get("/tasks", response_model=TaskQueryResponse, summary="Get all tasks")
def get_all_tasks(request: Request, page: int = Query(1, ge=1), page_size: int = Query(10, ge=1)):
    request_id = base.get_task_id(request)
    tasks, total = sm.state.get_all_tasks(page, page_size)

    response = {
        "tasks": tasks,
        "total": total,
        "page": page,
        "page_size": page_size,
    }
    return utils.get_response(200, response)



@router.get(
    "/tasks/{task_id}", response_model=TaskQueryResponse, summary="Query task status"
)
def get_task(
    request: Request,
    task_id: str = Path(..., description="Task ID"),
    query: TaskQueryRequest = Depends(),
):
    endpoint = config.app.get("endpoint", "")
    if not endpoint:
        endpoint = str(request.base_url)
    endpoint = endpoint.rstrip("/")

    request_id = base.get_task_id(request)
    task = sm.state.get_task(task_id)
    if task:
        # derive a consistent audio_duration when segments exist
        try:
            from app.services import video as video_service
            _segs = video_service.load_segments(task_id)
            _seg_total = 0.0
            for _s in _segs:
                try:
                    _seg_total += float(getattr(_s, 'duration', 0.0) or (_s.get('duration', 0.0) if isinstance(_s, dict) else 0.0))
                except Exception:
                    continue
            if _seg_total > 0:
                task['audio_duration'] = round(float(_seg_total), 3)
        except Exception:
            pass

        task_dir = utils.task_dir()

        def file_to_uri(file):
            if not file:
                return file
            if not str(file).startswith(endpoint):
                _uri_path = str(file).replace(task_dir, "tasks").replace("\\", "/")
                _uri_path = f"{endpoint}/{_uri_path}"
            else:
                _uri_path = file
            return _uri_path

        if "videos" in task:
            videos = task["videos"]
            urls = []
            for v in videos:
                urls.append(file_to_uri(v))
            task["videos"] = urls
        if "combined_videos" in task:
            combined_videos = task["combined_videos"]
            urls = []
            for v in combined_videos:
                urls.append(file_to_uri(v))
            task["combined_videos"] = urls
        return utils.get_response(200, task)

    raise HttpException(
        task_id=task_id, status_code=404, message=f"{request_id}: task not found"
    )


@router.delete(
    "/tasks/{task_id}",
    response_model=TaskDeletionResponse,
    summary="Delete a generated short video task",
)
def delete_video(request: Request, task_id: str = Path(..., description="Task ID")):
    request_id = base.get_task_id(request)
    task = sm.state.get_task(task_id)
    if task:
        tasks_dir = utils.task_dir()
        current_task_dir = os.path.join(tasks_dir, task_id)
        if os.path.exists(current_task_dir):
            shutil.rmtree(current_task_dir)

        sm.state.delete_task(task_id)
        logger.success(f"video deleted: {utils.to_json(task)}")
        return utils.get_response(200)

    raise HttpException(
        task_id=task_id, status_code=404, message=f"{request_id}: task not found"
    )


@router.get(
    "/musics", response_model=BgmRetrieveResponse, summary="Retrieve local BGM files"
)
def get_bgm_list(request: Request):
    suffix = "*.mp3"
    song_dir = utils.song_dir()
    files = glob.glob(os.path.join(song_dir, suffix))
    bgm_list = []
    for file in files:
        bgm_list.append(
            {
                "name": os.path.basename(file),
                "size": os.path.getsize(file),
                "file": file,
            }
        )
    response = {"files": bgm_list}
    return utils.get_response(200, response)


@router.post(
    "/musics",
    response_model=BgmUploadResponse,
    summary="Upload the BGM file to the songs directory",
)
def upload_bgm_file(request: Request, file: UploadFile = File(...)):
    request_id = base.get_task_id(request)
    # check file ext
    if file.filename.endswith("mp3"):
        song_dir = utils.song_dir()
        save_path = os.path.join(song_dir, file.filename)
        # save file
        with open(save_path, "wb+") as buffer:
            # If the file already exists, it will be overwritten
            file.file.seek(0)
            buffer.write(file.file.read())
        response = {"file": save_path}
        return utils.get_response(200, response)

    raise HttpException(
        "", status_code=400, message=f"{request_id}: Only *.mp3 files can be uploaded"
    )


@router.get("/stream/{file_path:path}")
async def stream_video(request: Request, file_path: str):
    tasks_dir = utils.task_dir()
    video_path = os.path.join(tasks_dir, file_path)
    range_header = request.headers.get("Range")
    video_size = os.path.getsize(video_path)
    start, end = 0, video_size - 1

    length = video_size
    if range_header:
        range_ = range_header.split("bytes=")[1]
        start, end = [int(part) if part else None for part in range_.split("-")]
        if start is None:
            start = video_size - end
            end = video_size - 1
        if end is None:
            end = video_size - 1
        length = end - start + 1

    def file_iterator(file_path, offset=0, bytes_to_read=None):
        with open(file_path, "rb") as f:
            f.seek(offset, os.SEEK_SET)
            remaining = bytes_to_read or video_size
            while remaining > 0:
                bytes_to_read = min(4096, remaining)
                data = f.read(bytes_to_read)
                if not data:
                    break
                remaining -= len(data)
                yield data

    response = StreamingResponse(
        file_iterator(video_path, start, length), media_type="video/mp4"
    )
    response.headers["Content-Range"] = f"bytes {start}-{end}/{video_size}"
    response.headers["Accept-Ranges"] = "bytes"
    response.headers["Content-Length"] = str(length)
    response.status_code = 206  # Partial Content

    return response


@router.get("/download/{file_path:path}")
async def download_video(_: Request, file_path: str):
    """
    download video
    :param _: Request request
    :param file_path: video file path, eg: /cd1727ed-3473-42a2-a7da-4faafafec72b/final-1.mp4
    :return: video file
    """
    tasks_dir = utils.task_dir()
    video_path = os.path.join(tasks_dir, file_path)
    file_path = pathlib.Path(video_path)
    filename = file_path.stem
    extension = file_path.suffix
    headers = {"Content-Disposition": f"attachment; filename={filename}{extension}"}
    return FileResponse(
        path=video_path,
        headers=headers,
        filename=f"{filename}{extension}",
        media_type=f"video/{extension[1:]}",
    )
