from fastapi import Request
from loguru import logger

from app.controllers.v1.base import new_router
from app.models.schema import (
    SubtitleSuggestRequest,
    SubtitleSuggestResponse,
    SubtitleRewriteRequest,
    SubtitleOverridesListResponse,
)
from app.services import llm
from app.services import video as video_service
from app.utils import utils

router = new_router()


def _hhmmss_to_seconds(s: str) -> float:
    # format: HH:MM:SS,ms
    try:
        h, m, rest = s.split(":", 2)
        sec, ms = rest.split(",", 1)
        return int(h) * 3600 + int(m) * 60 + int(sec) + int(ms) / 1000.0
    except Exception:
        return 0.0


def _collect_segment_text(task_id: str, order: int) -> str:
    try:
        segs = video_service.load_segments(task_id)
        segs_sorted = sorted(
            segs,
            key=lambda x: (getattr(x, "order", 0) if hasattr(x, "order") else x.get("order", 0)),
        )
        start_t = 0.0
        end_t = 0.0
        for s in segs_sorted:
            dur = 0.0
            try:
                dur = float(getattr(s, "duration", 0.0) if hasattr(s, "duration") else s.get("duration", 0.0) or 0.0)
            except Exception:
                dur = 0.0
            if (getattr(s, "order", None) or (isinstance(s, dict) and s.get("order"))) == order:
                end_t = start_t + dur
                break
            start_t += dur

        # locate subtitle file from task state
        from app.services import state as sm

        st = sm.state.get_task(task_id) or {}
        subtitle_path = st.get("subtitle_path", "")
        if not subtitle_path:
            import os

            p = os.path.join(utils.task_dir(task_id), "subtitle.srt")
            if os.path.exists(p):
                subtitle_path = p
        if not subtitle_path:
            return ""

        # parse SRT
        lines = []
        with open(subtitle_path, "r", encoding="utf-8") as f:
            buf = []
            for line in f:
                buf.append(line.rstrip("\n"))
                if line.strip() == "":
                    if len(buf) >= 3:
                        # e.g., [index, time, text...]
                        try:
                            time_line = buf[1]
                            if "-->" in time_line:
                                start_s = time_line.split("-->")[0].strip()
                                end_s = time_line.split("-->")[1].strip()
                                t0 = _hhmmss_to_seconds(start_s)
                                t1 = _hhmmss_to_seconds(end_s)
                                mid = (t0 + t1) / 2.0
                                if start_t <= mid < end_t:
                                    text = " ".join(x.strip() for x in buf[2:] if x.strip())
                                    if text:
                                        lines.append(text)
                        except Exception:
                            pass
                    buf = []
        return " ".join(lines).strip()
    except Exception as e:
        logger.error(f"collect segment text failed: {str(e)}")
        return ""


def _build_prompt(mode: str, text: str, target_language: str = "") -> str:
    mode = (mode or "polish").strip().lower()
    if mode == "simplify":
        return (
            "请将以下字幕文本在不改变原意的情况下简化为更短、更口语化、更易读的中文，输出纯文本：\n\n" + text
        )
    if mode.startswith("translate"):
        # translate-zh, translate-en, or custom, fallback to target_language
        lang = target_language
        if not lang:
            if mode == "translate-zh":
                lang = "中文"
            elif mode == "translate-en":
                lang = "English"
            else:
                lang = "中文"
        return f"请将以下字幕文本翻译为{lang}，保持简洁自然，输出纯文本：\n\n" + text
    # default: polish
    return (
        "请润色以下字幕文本，使其更自然、通顺、有口语感，但不改变原意，输出纯文本：\n\n" + text
    )


@router.post(
    "/subtitles/suggest",
    response_model=SubtitleSuggestResponse,
    summary="Generate AI subtitle suggestion for a segment (polish/translate/simplify)",
)
def suggest_subtitle(request: Request, body: SubtitleSuggestRequest):
    task_id = body.task_id
    if not task_id:
        from app.models.exception import HttpException

        raise HttpException(task_id="", status_code=400, message="missing task_id")
    try:
        # resolve order and segment id
        segs = video_service.load_segments(task_id)
        segment = None
        for s in segs:
            sid = getattr(s, "segment_id", None) if hasattr(s, "segment_id") else s.get("segment_id")
            if body.segment_id and sid == body.segment_id:
                segment = s
                break
            if body.order and ((getattr(s, "order", None) if hasattr(s, "order") else s.get("order")) == body.order):
                segment = s
                break
        if not segment:
            # default to first
            segment = segs[0] if segs else None
        if not segment:
            original_text = ""
            suggestion = ""
            return utils.get_response(200, {
                "task_id": task_id,
                "segment_id": body.segment_id,
                "order": body.order,
                "mode": body.mode or "polish",
                "original_text": original_text,
                "suggestion": suggestion,
            })
        order = getattr(segment, "order", None) if hasattr(segment, "order") else segment.get("order")
        original_text = _collect_segment_text(task_id, int(order or 1))
        prompt = _build_prompt(body.mode or "polish", original_text or "", body.target_language or "")
        suggestion = llm._generate_response(prompt)
        return utils.get_response(200, {
            "task_id": task_id,
            "segment_id": getattr(segment, "segment_id", None) if hasattr(segment, "segment_id") else segment.get("segment_id"),
            "order": order,
            "mode": body.mode or "polish",
            "original_text": original_text,
            "suggestion": suggestion.strip() if isinstance(suggestion, str) else str(suggestion),
        })
    except Exception as e:
        from app.models.exception import HttpException

        raise HttpException(task_id=task_id, status_code=400, message=str(e))


def _format_srt_time(sec: float) -> str:
    if sec < 0:
        sec = 0.0
    ms = int(round((sec - int(sec)) * 1000.0))
    s = int(sec) % 60
    m = (int(sec) // 60) % 60
    h = int(sec) // 3600
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _ensure_override_dir(task_id: str, segment_id: str) -> str:
    import os
    d = os.path.join(utils.task_dir(task_id), 'sub_overrides', segment_id)
    os.makedirs(d, exist_ok=True)
    return d


def _window_bounds_for_segment(task_id: str, segment_ref) -> tuple[float, float, int, str]:
    segs = video_service.load_segments(task_id)
    segs_sorted = sorted(
        segs,
        key=lambda x: (getattr(x, "order", 0) if hasattr(x, "order") else x.get("order", 0)),
    )
    t = 0.0
    for s in segs_sorted:
        dur = 0.0
        try:
            dur = float(getattr(s, "duration", 0.0) if hasattr(s, "duration") else s.get("duration", 0.0) or 0.0)
        except Exception:
            dur = 0.0
        sid = getattr(s, "segment_id", None) if hasattr(s, "segment_id") else s.get("segment_id")
        order = getattr(s, "order", None) if hasattr(s, "order") else s.get("order")
        if (isinstance(segment_ref, str) and sid == segment_ref) or (
            isinstance(segment_ref, int) and order == segment_ref
        ):
            return (t, t + dur, int(order or 0), str(sid))
        t += dur
    return (0.0, 0.0, 0, "")


def _collect_window_items(subtitle_path: str, ws: float, we: float):
    items = []
    with open(subtitle_path, 'r', encoding='utf-8') as f:
        buf = []
        for line in f:
            line = line.rstrip('\n')
            if line.strip() == '':
                if len(buf) >= 3:
                    time_line = buf[1]
                    if '-->' in time_line:
                        start_s = time_line.split('-->')[0].strip()
                        end_s = time_line.split('-->')[1].strip()
                        t0 = _hhmmss_to_seconds(start_s)
                        t1 = _hhmmss_to_seconds(end_s)
                        mid = (t0 + t1) / 2.0
                        if ws <= mid < we:
                            text = ' '.join(x.strip() for x in buf[2:] if x.strip())
                            items.append(((t0, t1), text))
                buf = []
            else:
                buf.append(line)
    return items


@router.post(
    "/subtitles/rewrite",
    summary="Rewrite subtitle text for a segment window and create a versioned override; optionally apply",
)
def rewrite_subtitle(request: Request, body: SubtitleRewriteRequest):
    from app.models.exception import HttpException

    task_id = body.task_id
    if not task_id:
        raise HttpException(task_id="", status_code=400, message="missing task_id")
    try:
        seg_ref = body.segment_id or body.order
        if not seg_ref:
            raise HttpException(task_id=task_id, status_code=400, message="missing segment_id/order")
        ws, we, order, sid = _window_bounds_for_segment(task_id, seg_ref)
        if we <= ws or not sid:
            raise HttpException(task_id=task_id, status_code=404, message="segment window not found")
        # locate subtitle source
        from app.services import state as sm
        st = sm.state.get_task(task_id) or {}
        subtitle_path = st.get("subtitle_path", "")
        if not subtitle_path:
            import os
            p = os.path.join(utils.task_dir(task_id), "subtitle.srt")
            if os.path.exists(p):
                subtitle_path = p
        if not subtitle_path:
            raise HttpException(task_id=task_id, status_code=404, message="subtitle.srt not found")

        # get window items & text
        items = _collect_window_items(subtitle_path, ws, we)
        base_text = ' '.join([it[1] for it in items]).strip()

        # obtain suggestion
        suggestion = body.suggestion or ""
        if not suggestion:
            prompt = _build_prompt(body.mode or 'polish', base_text or '', body.target_language or '')
            suggestion = llm._generate_response(prompt) or ""
        suggestion = str(suggestion).strip()

        # segment suggestion across items by count; if no items, create one spanning whole window
        parts = []
        if items:
            k = len(items)
            words = suggestion.split()
            # greedy split words equally by count
            per = max(1, len(words) // k)
            for i in range(k):
                start = i * per
                end = (i + 1) * per if i < k - 1 else len(words)
                chunk = ' '.join(words[start:end]).strip()
                if not chunk and suggestion:
                    # ensure non-empty by borrowing at least something
                    chunk = suggestion if i == 0 else ''
                parts.append((items[i][0], chunk))
        else:
            parts = [(((ws, we)), suggestion)]

        # write override srt using times relative to window
        override_dir = _ensure_override_dir(task_id, sid)
        import os, time
        # compute version index
        existing = sorted([x for x in os.listdir(override_dir) if x.endswith('.srt') and x.startswith('v')])
        ver = len(existing) + 1
        ver_name = f"v{ver:03d}.srt"
        out_path = os.path.join(override_dir, ver_name)

        lines = []
        for idx, (times, txt) in enumerate(parts, start=1):
            t0, t1 = times
            t0r, t1r = max(0.0, t0 - ws), max(0.1, t1 - ws)
            lines.append(str(idx))
            lines.append(f"{_format_srt_time(t0r)} --> {_format_srt_time(t1r)}")
            lines.extend([l for l in (txt or '').split('\n') if l])
            lines.append('')
        with open(out_path, 'w', encoding='utf-8') as fd:
            fd.write('\n'.join(lines))

        # optionally apply: copy to applied.srt
        applied = None
        if body.apply:
            applied = os.path.join(override_dir, 'applied.srt')
            try:
                if os.path.exists(applied):
                    os.remove(applied)
            except Exception:
                pass
            try:
                import shutil
                shutil.copyfile(out_path, applied)
            except Exception:
                applied = None

        return utils.get_response(200, {
            'task_id': task_id,
            'segment_id': sid,
            'order': order,
            'version': ver_name,
            'applied': bool(applied),
        })
    except Exception as e:
        raise HttpException(task_id=task_id, status_code=400, message=str(e))


@router.get(
    "/subtitles/overrides",
    response_model=SubtitleOverridesListResponse,
    summary="List subtitle override versions for a segment and current applied one",
)
def list_overrides(task_id: str, segment_id: str):
    import os
    from app.models.exception import HttpException
    try:
        d = _ensure_override_dir(task_id, segment_id)
        versions = sorted([x for x in os.listdir(d) if x.endswith('.srt') and x.startswith('v')])
        applied = None
        ap = os.path.join(d, 'applied.srt')
        if os.path.exists(ap):
            applied = os.path.basename(ap)
        return utils.get_response(200, { 'task_id': task_id, 'segment_id': segment_id, 'applied': applied, 'versions': versions })
    except Exception as e:
        raise HttpException(task_id=task_id, status_code=400, message=str(e))


@router.post(
    "/subtitles/apply",
    summary="Apply an override version for a segment",
)
def apply_override(request: Request, task_id: str, segment_id: str, version: str):
    import os, shutil
    from app.models.exception import HttpException
    try:
        d = _ensure_override_dir(task_id, segment_id)
        src = os.path.join(d, version)
        if not os.path.exists(src):
            raise HttpException(task_id=task_id, status_code=404, message="version not found")
        dst = os.path.join(d, 'applied.srt')
        if os.path.exists(dst):
            os.remove(dst)
        shutil.copyfile(src, dst)
        return utils.get_response(200, { 'task_id': task_id, 'segment_id': segment_id, 'applied': os.path.basename(dst) })
    except Exception as e:
        raise HttpException(task_id=task_id, status_code=400, message=str(e))


@router.post(
    "/subtitles/revert",
    summary="Revert (unapply) the current override for a segment",
)
def revert_override(request: Request, task_id: str, segment_id: str):
    import os
    from app.models.exception import HttpException
    try:
        d = _ensure_override_dir(task_id, segment_id)
        dst = os.path.join(d, 'applied.srt')
        if os.path.exists(dst):
            os.remove(dst)
        return utils.get_response(200, { 'task_id': task_id, 'segment_id': segment_id, 'applied': None })
    except Exception as e:
        raise HttpException(task_id=task_id, status_code=400, message=str(e))
