import glob
import itertools
import os
import random
import gc
import shutil
from typing import List, Iterable
from loguru import logger
from moviepy import (
    AudioFileClip,
    ColorClip,
    CompositeAudioClip,
    CompositeVideoClip,
    ImageClip,
    TextClip,
    VideoFileClip,
    afx,
    concatenate_videoclips,
)
from moviepy.video.tools.subtitles import SubtitlesClip
from PIL import ImageFont, Image, ImageDraw

from app.models import const
from app.models.schema import (
    MaterialInfo,
    VideoAspect,
    VideoConcatMode,
    VideoParams,
    VideoTransitionMode,
    SegmentItem,
)
from app.services.utils import video_effects
from app.utils import utils

class SubClippedVideoClip:
    def __init__(self, file_path, start_time=None, end_time=None, width=None, height=None, duration=None):
        self.file_path = file_path
        self.start_time = start_time
        self.end_time = end_time
        self.width = width
        self.height = height
        if duration is None:
            self.duration = end_time - start_time
        else:
            self.duration = duration

    def __str__(self):
        return f"SubClippedVideoClip(file_path={self.file_path}, start_time={self.start_time}, end_time={self.end_time}, duration={self.duration}, width={self.width}, height={self.height})"


audio_codec = "aac"
video_codec = "libx264"
fps = 30

def close_clip(clip):
    if clip is None:
        return
        
    try:
        # close main resources
        if hasattr(clip, 'reader') and clip.reader is not None:
            clip.reader.close()
            
        # close audio resources
        if hasattr(clip, 'audio') and clip.audio is not None:
            if hasattr(clip.audio, 'reader') and clip.audio.reader is not None:
                clip.audio.reader.close()
            del clip.audio
            
        # close mask resources
        if hasattr(clip, 'mask') and clip.mask is not None:
            if hasattr(clip.mask, 'reader') and clip.mask.reader is not None:
                clip.mask.reader.close()
            del clip.mask
            
        # handle child clips in composite clips
        if hasattr(clip, 'clips') and clip.clips:
            for child_clip in clip.clips:
                if child_clip is not clip:  # avoid possible circular references
                    close_clip(child_clip)
            
        # clear clip list
        if hasattr(clip, 'clips'):
            clip.clips = []
            
    except Exception as e:
        logger.error(f"failed to close clip: {str(e)}")
    
    del clip
    gc.collect()

def delete_files(files: List[str] | str):
    if isinstance(files, str):
        files = [files]
        
    for file in files:
        try:
            os.remove(file)
        except:
            pass

def get_bgm_file(bgm_type: str = "random", bgm_file: str = ""):
    if not bgm_type:
        return ""

    if bgm_file and os.path.exists(bgm_file):
        return bgm_file

    if bgm_type == "random":
        suffix = "*.mp3"
        song_dir = utils.song_dir()
        files = glob.glob(os.path.join(song_dir, suffix))
        return random.choice(files)

    return ""


def _task_output_dir(task_id: str) -> str:
    return os.path.join(utils.task_dir(task_id))


def _clips_dir(task_id: str) -> str:
    d = os.path.join(utils.task_dir(task_id), "clips")
    if not os.path.exists(d):
        os.makedirs(d, exist_ok=True)
    return d


def save_segments(task_id: str, segments: List[SegmentItem]):
    """Persist segments plan to storage/tasks/<task_id>/segments.json"""
    output_dir = utils.task_dir(task_id)
    os.makedirs(output_dir, exist_ok=True)
    file_path = os.path.join(output_dir, "segments.json")
    import json

    with open(file_path, "w", encoding="utf-8") as f:
        json.dump([s.model_dump() if isinstance(s, SegmentItem) else s for s in segments], f, ensure_ascii=False, indent=2)
    return file_path


def load_segments(task_id: str) -> List[SegmentItem]:
    file_path = os.path.join(utils.task_dir(task_id), "segments.json")
    if not os.path.exists(file_path):
        return []
    import json

    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        res = []
        for item in data:
            try:
                res.append(SegmentItem(**item))
            except Exception:
                # fallback to raw dict if structure mismatched
                res.append(item)
        return res


def _thumbs_dir(task_id: str) -> str:
    d = os.path.join(utils.task_dir(task_id), "thumbs")
    if not os.path.exists(d):
        os.makedirs(d, exist_ok=True)
    return d


def get_segment_thumbnail(task_id: str, segment_id: str) -> str:
    """Ensure and return a thumbnail image path for a segment.

    Returns absolute filesystem path to an image file.
    """
    segments = load_segments(task_id)
    seg = None
    for s in segments:
        try:
            if isinstance(s, SegmentItem) and s.segment_id == segment_id:
                seg = s
                break
            if not isinstance(s, SegmentItem) and s.get("segment_id") == segment_id:
                # tolerate raw dict
                seg = SegmentItem(**s)
                break
        except Exception:
            continue

    if seg is None:
        raise FileNotFoundError("segment not found")

    material = getattr(seg, "material", None)
    if not material or not isinstance(material, str) or not os.path.exists(material):
        # Fallback: try to capture from combined/final video at timeline offset
        output_dir = utils.task_dir(task_id)
        import glob as _glob
        cand = []
        cand.extend(_glob.glob(os.path.join(output_dir, "combined-*.mp4")))
        cand.extend(_glob.glob(os.path.join(output_dir, "final-*.mp4")))
        if cand:
            try:
                # estimate position by summing durations before this segment
                segs = load_segments(task_id)
                pos = 0.0
                for s in segs:
                    sid = s.segment_id if hasattr(s, 'segment_id') else s.get('segment_id')
                    if sid == segment_id:
                        break
                    try:
                        pos += float(getattr(s, 'duration', 0) if hasattr(s, 'duration') else s.get('duration', 0) or 0)
                    except Exception:
                        continue
                vid = cand[0]
                clip = VideoFileClip(vid)
                t = max(0.0, min(pos + 0.05, float(clip.duration) - 0.01))
                frame = clip.get_frame(t)
                img = Image.fromarray(frame)
                img.thumbnail((640, 640))
                thumb_dir = _thumbs_dir(task_id)
                thumb_path = os.path.join(thumb_dir, f"{segment_id}.jpg")
                img.save(thumb_path, format="JPEG", quality=80)
                close_clip(clip)
                return thumb_path
            except Exception:
                try:
                    close_clip(clip)
                except Exception:
                    pass
        # If still no source, return a generated placeholder to avoid 404
        thumb_dir = _thumbs_dir(task_id)
        thumb_path = os.path.join(thumb_dir, f"{segment_id}.jpg")
        try:
            img = Image.new('RGB', (640, 360), color=(240, 240, 240))
            draw = ImageDraw.Draw(img)
            text = "No Material"
            try:
                fpath = os.path.join(utils.font_dir(), "MicrosoftYaHeiBold.ttc")
                font = ImageFont.truetype(fpath, 28)
            except Exception:
                font = ImageFont.load_default()
            tw, th = draw.textsize(text, font=font)
            draw.text(((640 - tw)//2, (360 - th)//2), text, fill=(128, 128, 128), font=font)
            img.save(thumb_path, format="JPEG", quality=80)
            return thumb_path
        except Exception:
            raise FileNotFoundError("material not found")

    # if material is an image, return it directly
    ext = os.path.splitext(material)[1].lower()
    image_exts = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
    if ext in image_exts:
        return material

    # otherwise capture a middle frame from video as thumbnail
    thumb_dir = _thumbs_dir(task_id)
    thumb_path = os.path.join(thumb_dir, f"{segment_id}.jpg")
    if os.path.exists(thumb_path):
        return thumb_path

    # pick a timestamp within the segment range
    try:
        cap_t = float(getattr(seg, "start", 0) or 0)
        dur = float(getattr(seg, "duration", 0) or 0)
        if dur and dur > 0:
            cap_t = cap_t + max(0.05, min(dur * 0.5, dur - 0.05))
        else:
            # fallback to 0.2s
            cap_t = cap_t + 0.2
    except Exception:
        cap_t = 0.2

    try:
        clip = VideoFileClip(material)
        t = max(0.0, min(cap_t, float(clip.duration) - 0.01))
        frame = clip.get_frame(t)
        img = Image.fromarray(frame)
        img.thumbnail((640, 640))
        img.save(thumb_path, format="JPEG", quality=80)
        close_clip(clip)
        return thumb_path
    except Exception as e:
        try:
            close_clip(clip)
        except Exception:
            pass
        raise e


def ensure_thumbs(task_id: str):
    """Generate thumbnails for all segments of the task if missing."""
    try:
        segs = load_segments(task_id)
        for s in segs:
            try:
                seg_id = s.segment_id if hasattr(s, 'segment_id') else s.get('segment_id')
                if seg_id:
                    _ = get_segment_thumbnail(task_id, seg_id)
            except Exception:
                continue
    except Exception:
        pass


def plan_segments(
    task_id: str,
    video_paths: List[str],
    audio_file: str,
    video_aspect: VideoAspect = VideoAspect.portrait,
    video_concat_mode: VideoConcatMode = VideoConcatMode.random,
    max_clip_duration: int = 5,
) -> List[SegmentItem]:
    """Create a segment plan based on materials and audio length.

    - Slices each source video into <= max_clip_duration chunks.
    - Shuffles when concat mode is random, otherwise keeps order.
    - Loops segments until total >= audio duration.
    """
    audio_clip = AudioFileClip(audio_file)
    audio_duration = float(audio_clip.duration)
    close_clip(audio_clip)

    segments_all: List[SegmentItem] = []
    order = 1

    # pre-scan all materials and form base segments list
    for src in video_paths:
        try:
            clip = VideoFileClip(src)
        except Exception:
            # skip invalid video
            continue
        clip_duration = float(clip.duration)
        clip_w, clip_h = clip.size
        close_clip(clip)

        start_time = 0.0
        min_piece = min(max_clip_duration, clip_duration)

        # at least one piece per video
        while start_time < clip_duration:
            end_time = min(start_time + max_clip_duration, clip_duration)
            dur = float(max(0.0, end_time - start_time))
            # drop too tiny tail pieces (<0.6s)
            if dur >= 0.6:
                segments_all.append(
                    SegmentItem(
                        segment_id=f"seg-{order}",
                        order=order,
                        scene_title="",
                        shot_no=None,
                        shot_desc="",
                        style="",
                        duration=dur,
                        transition=None,
                        speed=1.0,
                        fit="contain",
                        material=src,
                        start=float(start_time),
                        end=float(end_time),
                        width=int(clip_w),
                        height=int(clip_h),
                    )
                )
                order += 1
            if video_concat_mode.value == VideoConcatMode.sequential.value:
                # only one sub-clip from each video in sequential mode
                break
            start_time = end_time

    if not segments_all:
        logger.warning("plan_segments: no valid segments found from sources")
        return []

    # shuffle for random mode
    if video_concat_mode.value == VideoConcatMode.random.value:
        random.shuffle(segments_all)

    # loop base segments to fill audio duration
    planned: List[SegmentItem] = []
    total = 0.0
    base: List[SegmentItem] = segments_all.copy()
    idx = 0
    while total < audio_duration and base:
        if idx >= len(base):
            idx = 0
        base_seg = base[idx]
        # create a copy with new order and id to reflect timeline position
        new_seg = SegmentItem(
            segment_id=f"seg-{len(planned)+1}",
            order=len(planned) + 1,
            scene_title=base_seg.scene_title,
            shot_no=base_seg.shot_no,
            shot_desc=base_seg.shot_desc,
            style=base_seg.style,
            duration=min(base_seg.duration, max_clip_duration),
            transition=base_seg.transition,
            speed=base_seg.speed,
            fit=base_seg.fit,
            material=base_seg.material,
            start=base_seg.start,
            end=base_seg.start + min(base_seg.duration, max_clip_duration),
            width=base_seg.width,
            height=base_seg.height,
        )
        planned.append(new_seg)
        total += new_seg.duration
        idx += 1

    save_segments(task_id, planned)
    return planned


def _apply_transition_to_clip(clip, transition: VideoTransitionMode, t: float = 1.0, side: str | None = None):
    shuffle_side = side or random.choice(["left", "right", "top", "bottom"])
    if transition is None or transition.value == VideoTransitionMode.none.value:
        return clip
    if transition.value == VideoTransitionMode.fade_in.value:
        return video_effects.fadein_transition(clip, max(0.1, float(t)))
    if transition.value == VideoTransitionMode.fade_out.value:
        return video_effects.fadeout_transition(clip, max(0.1, float(t)))
    if transition.value == VideoTransitionMode.slide_in.value:
        return video_effects.slidein_transition(clip, max(0.1, float(t)), shuffle_side)
    if transition.value == VideoTransitionMode.slide_out.value:
        return video_effects.slideout_transition(clip, max(0.1, float(t)), shuffle_side)
    if transition.value == VideoTransitionMode.mask.value:
        # approximate mask transitions using existing effects
        # circle -> fadein; horizontal/vertical -> slide from given side; blinds -> fadein
        if side is None:
            side = "left"
        return _apply_transition_to_clip(clip, VideoTransitionMode.fade_in, t=t, side=side)
    if transition.value == VideoTransitionMode.shuffle.value:
        transition_funcs = [
            lambda c: video_effects.fadein_transition(c, max(0.1, float(t))),
            lambda c: video_effects.fadeout_transition(c, max(0.1, float(t))),
            lambda c: video_effects.slidein_transition(c, max(0.1, float(t)), shuffle_side),
            lambda c: video_effects.slideout_transition(c, max(0.1, float(t)), shuffle_side),
        ]
        func = random.choice(transition_funcs)
        return func(clip)
    return clip


def _resize_to_aspect(clip, video_width: int, video_height: int, fit: str = "contain"):
    clip_w, clip_h = clip.size
    if clip_w == video_width and clip_h == video_height:
        return clip
    clip_ratio = clip_w / clip_h
    video_ratio = video_width / video_height
    # exact match
    if clip_ratio == video_ratio:
        return clip.resized(new_size=(video_width, video_height))

    # center without scaling
    if fit == "center":
        background = ColorClip(size=(video_width, video_height), color=(0, 0, 0)).with_duration(clip.duration)
        return CompositeVideoClip([background, clip.with_position("center")])

    # contain: fit inside, keep black borders
    if fit == "contain":
        if clip_ratio > video_ratio:
            scale_factor = video_width / clip_w
        else:
            scale_factor = video_height / clip_h
        new_width = int(clip_w * scale_factor)
        new_height = int(clip_h * scale_factor)
        background = ColorClip(size=(video_width, video_height), color=(0, 0, 0)).with_duration(clip.duration)
        clip_resized = clip.resized(new_size=(new_width, new_height)).with_position("center")
        return CompositeVideoClip([background, clip_resized])

    # cover: fill and crop overflow
    if fit == "cover":
        if clip_ratio > video_ratio:
            scale_factor = video_height / clip_h
        else:
            scale_factor = video_width / clip_w
        new_width = int(clip_w * scale_factor)
        new_height = int(clip_h * scale_factor)
        background = ColorClip(size=(video_width, video_height), color=(0, 0, 0)).with_duration(clip.duration)
        clip_resized = clip.resized(new_size=(new_width, new_height)).with_position("center")
        return CompositeVideoClip([background, clip_resized])

    # fallback to contain
    if clip_ratio > video_ratio:
        scale_factor = video_width / clip_w
    else:
        scale_factor = video_height / clip_h
    new_width = int(clip_w * scale_factor)
    new_height = int(clip_h * scale_factor)
    background = ColorClip(size=(video_width, video_height), color=(0, 0, 0)).with_duration(clip.duration)
    clip_resized = clip.resized(new_size=(new_width, new_height)).with_position("center")
    return CompositeVideoClip([background, clip_resized])


def _merge_clip_files(progressed_files: Iterable[str], output_dir: str, threads: int = 2) -> str:
    progressed_files = list(progressed_files)
    if not progressed_files:
        return ""
    if len(progressed_files) == 1:
        dst = os.path.join(output_dir, "temp-merged-video.mp4")
        shutil.copy(progressed_files[0], dst)
        return dst

    temp_merged_video = os.path.join(output_dir, "temp-merged-video.mp4")
    temp_merged_next = os.path.join(output_dir, "temp-merged-next.mp4")
    shutil.copy(progressed_files[0], temp_merged_video)
    for i, f in enumerate(progressed_files[1:], 1):
        try:
            base_clip = VideoFileClip(temp_merged_video)
            next_clip = VideoFileClip(f)
            merged_clip = concatenate_videoclips([base_clip, next_clip])
            merged_clip.write_videofile(
                filename=temp_merged_next,
                threads=threads,
                logger=None,
                temp_audiofile_path=output_dir,
                audio_codec=audio_codec,
                fps=fps,
            )
            close_clip(base_clip)
            close_clip(next_clip)
            close_clip(merged_clip)
            delete_files(temp_merged_video)
            os.rename(temp_merged_next, temp_merged_video)
        except Exception as e:
            logger.error(f"failed to merge clip: {str(e)}")
            continue
    return temp_merged_video


def render_from_segments(
    task_id: str,
    segments: List[SegmentItem],
    params: VideoParams,
    audio_file: str,
    subtitle_path: str = "",
    preview: bool = False,
    preview_label: str | None = None,
) -> (str, str):
    """Bake each segment, progressively merge, then overlay audio/subtitle.

    Returns: (combined_video_path, final_video_path)
    """
    output_dir = _task_output_dir(task_id)
    clips_dir = _clips_dir(task_id)

    aspect = VideoAspect(params.video_aspect)
    video_width, video_height = aspect.to_resolution()

    baked_files: List[str] = []
    for i, s in enumerate(sorted(segments, key=lambda x: x.order)):
        try:
            base_clip = VideoFileClip(s.material).subclipped(s.start, s.end).without_audio()
        except Exception as e:
            logger.error(f"failed to open source clip: {s.material}, err: {str(e)}")
            continue

        # apply playback speed (clamped)
        try:
            spd = float(s.speed or 1.0)
        except Exception:
            spd = 1.0
        if spd != 1.0:
            # clamp to reasonable bounds
            if spd < 0.75:
                spd = 0.75
            if spd > 1.25:
                spd = 1.25
            try:
                from moviepy import vfx
                base_clip = base_clip.with_effects([vfx.MultiplySpeed(spd)])
            except Exception:
                try:
                    from moviepy import vfx as _vfx
                    # fallback to alternative naming if available
                    base_clip = base_clip.with_effects([_vfx.Speedx(spd)])
                except Exception:
                    logger.warning("speed effect not supported by current moviepy, skipping")

        # resize to aspect with fit mode
        fit = getattr(s, "fit", None) or "contain"
        clip = _resize_to_aspect(base_clip, video_width, video_height, fit)

        # apply transition (fallback to global param if empty)
        trans = None
        try:
            if s.transition:
                trans = VideoTransitionMode(s.transition)
            elif params.video_transition_mode:
                trans = VideoTransitionMode(params.video_transition_mode)
        except Exception:
            trans = None
        if trans:
            try:
                t = float(getattr(s, "transition_duration", None) or 1.0)
            except Exception:
                t = 1.0
            if t < 0.2:
                t = 0.2
            if t > 2:
                t = 2
            side = getattr(s, "transition_direction", None)
            # map mask type to direction if not set
            if (getattr(trans, 'value', None) == VideoTransitionMode.mask.value) and not side:
                m = getattr(s, "transition_mask", None)
                if m == "vertical":
                    side = random.choice(["top", "bottom"])  # default vertical
                elif m == "horizontal":
                    side = random.choice(["left", "right"])  # default horizontal
                else:
                    side = None
            if isinstance(side, str) and side not in ["left", "right", "top", "bottom"]:
                side = None
            clip = _apply_transition_to_clip(clip, trans, t=t, side=side)

        # trim to declared duration if needed
        if clip.duration > s.duration:
            clip = clip.subclipped(0, s.duration)

        # write baked file
        clip_file = os.path.join(clips_dir, f"seg-{i+1}.mp4")
        try:
            clip.write_videofile(clip_file, logger=None, fps=fps, codec=video_codec)
            baked_files.append(clip_file)
        except Exception as e:
            logger.error(f"failed to write baked clip: {str(e)}")
        finally:
            close_clip(base_clip)
            if clip is not base_clip:
                close_clip(clip)

    if not baked_files:
        logger.warning("no baked files to merge")
        return "", ""

    # merge baked clips progressively
    merged_tmp = _merge_clip_files(baked_files, output_dir, params.n_threads or 2)
    if not merged_tmp or not os.path.exists(merged_tmp):
        logger.error("merge failed")
        return "", ""

    # move to combined path (use dedicated preview filename when previewing)
    if preview:
        tag = preview_label or "preview"
        # normalize tag to filesystem-friendly
        import re, time
        tag = re.sub(r"[^a-zA-Z0-9_-]", "-", str(tag))[:40] or str(int(time.time()))
        combined_video_path = os.path.join(output_dir, f"preview-{tag}.mp4")
    else:
        combined_video_path = os.path.join(output_dir, "combined-1.mp4")
    if os.path.exists(combined_video_path):
        delete_files(combined_video_path)
    os.rename(merged_tmp, combined_video_path)

    # overlay audio and subtitle to final output
    if preview:
        # In preview mode, return combined only and skip final mux to speed up
        return combined_video_path, ""
    else:
        final_video_path = os.path.join(output_dir, "final-1.mp4")
        generate_video(
            video_path=combined_video_path,
            audio_path=audio_file,
            subtitle_path=subtitle_path,
            output_file=final_video_path,
            params=params,
        )
        return combined_video_path, final_video_path

def combine_videos(
    combined_video_path: str,
    video_paths: List[str],
    audio_file: str,
    video_aspect: VideoAspect = VideoAspect.portrait,
    video_concat_mode: VideoConcatMode = VideoConcatMode.random,
    video_transition_mode: VideoTransitionMode = None,
    max_clip_duration: int = 5,
    threads: int = 2,
) -> str:
    # normalize enums if strings are passed in
    try:
        if isinstance(video_concat_mode, str):
            video_concat_mode = VideoConcatMode(video_concat_mode)
    except Exception:
        pass
    try:
        if isinstance(video_transition_mode, str):
            video_transition_mode = VideoTransitionMode(video_transition_mode)
    except Exception:
        video_transition_mode = None
    audio_clip = AudioFileClip(audio_file)
    audio_duration = audio_clip.duration
    logger.info(f"audio duration: {audio_duration} seconds")
    # Required duration of each clip
    req_dur = audio_duration / len(video_paths)
    req_dur = max_clip_duration
    logger.info(f"maximum clip duration: {req_dur} seconds")
    output_dir = os.path.dirname(combined_video_path)

    aspect = VideoAspect(video_aspect)
    video_width, video_height = aspect.to_resolution()

    processed_clips = []
    subclipped_items = []
    video_duration = 0
    for video_path in video_paths:
        clip = VideoFileClip(video_path)
        clip_duration = clip.duration
        clip_w, clip_h = clip.size
        close_clip(clip)
        
        start_time = 0

        while start_time < clip_duration:
            end_time = min(start_time + max_clip_duration, clip_duration)
            # accept even short tails; don't drop clips shorter than max_clip_duration
            if end_time - start_time > 0:
                subclipped_items.append(
                    SubClippedVideoClip(
                        file_path=video_path,
                        start_time=start_time,
                        end_time=end_time,
                        width=clip_w,
                        height=clip_h,
                    )
                )
            start_time = end_time
            if video_concat_mode.value == VideoConcatMode.sequential.value:
                break

    # random subclipped_items order
    if video_concat_mode.value == VideoConcatMode.random.value:
        random.shuffle(subclipped_items)
        
    logger.debug(f"total subclipped items: {len(subclipped_items)}")
    
    # Add downloaded clips over and over until the duration of the audio (max_duration) has been reached
    for i, subclipped_item in enumerate(subclipped_items):
        if video_duration > audio_duration:
            break
        
        logger.debug(f"processing clip {i+1}: {subclipped_item.width}x{subclipped_item.height}, current duration: {video_duration:.2f}s, remaining: {audio_duration - video_duration:.2f}s")
        
        try:
            clip = VideoFileClip(subclipped_item.file_path).subclipped(subclipped_item.start_time, subclipped_item.end_time)
            clip_duration = clip.duration
            # Not all videos are same size, so we need to resize them
            clip_w, clip_h = clip.size
            if clip_w != video_width or clip_h != video_height:
                clip_ratio = clip.w / clip.h
                video_ratio = video_width / video_height
                logger.debug(f"resizing clip, source: {clip_w}x{clip_h}, ratio: {clip_ratio:.2f}, target: {video_width}x{video_height}, ratio: {video_ratio:.2f}")
                
                if clip_ratio == video_ratio:
                    clip = clip.resized(new_size=(video_width, video_height))
                else:
                    if clip_ratio > video_ratio:
                        scale_factor = video_width / clip_w
                    else:
                        scale_factor = video_height / clip_h

                    new_width = int(clip_w * scale_factor)
                    new_height = int(clip_h * scale_factor)

                    background = ColorClip(size=(video_width, video_height), color=(0, 0, 0)).with_duration(clip_duration)
                    clip_resized = clip.resized(new_size=(new_width, new_height)).with_position("center")
                    clip = CompositeVideoClip([background, clip_resized])
                    
            shuffle_side = random.choice(["left", "right", "top", "bottom"])
            # normalize transition mode; treat None or falsy as no transition
            _vt = getattr(video_transition_mode, "value", video_transition_mode)
            if not _vt:
                pass  # no transition
            elif _vt == VideoTransitionMode.fade_in.value:
                clip = video_effects.fadein_transition(clip, 1)
            elif _vt == VideoTransitionMode.fade_out.value:
                clip = video_effects.fadeout_transition(clip, 1)
            elif _vt == VideoTransitionMode.slide_in.value:
                clip = video_effects.slidein_transition(clip, 1, shuffle_side)
            elif _vt == VideoTransitionMode.slide_out.value:
                clip = video_effects.slideout_transition(clip, 1, shuffle_side)
            elif _vt == VideoTransitionMode.shuffle.value:
                transition_funcs = [
                    lambda c: video_effects.fadein_transition(c, 1),
                    lambda c: video_effects.fadeout_transition(c, 1),
                    lambda c: video_effects.slidein_transition(c, 1, shuffle_side),
                    lambda c: video_effects.slideout_transition(c, 1, shuffle_side),
                ]
                shuffle_transition = random.choice(transition_funcs)
                clip = shuffle_transition(clip)

            if clip.duration > max_clip_duration:
                clip = clip.subclipped(0, max_clip_duration)
                
            # wirte clip to temp file
            clip_file = f"{output_dir}/temp-clip-{i+1}.mp4"
            clip.write_videofile(clip_file, logger=None, fps=fps, codec=video_codec)
            
            close_clip(clip)
        
            processed_clips.append(SubClippedVideoClip(file_path=clip_file, duration=clip.duration, width=clip_w, height=clip_h))
            video_duration += clip.duration
            
        except Exception as e:
            logger.error(f"failed to process clip: {str(e)}")
    
    # loop processed clips until the video duration matches or exceeds the audio duration.
    if video_duration < audio_duration:
        logger.warning(f"video duration ({video_duration:.2f}s) is shorter than audio duration ({audio_duration:.2f}s), looping clips to match audio length.")
        base_clips = processed_clips.copy()
        for clip in itertools.cycle(base_clips):
            if video_duration >= audio_duration:
                break
            processed_clips.append(clip)
            video_duration += clip.duration
        logger.info(f"video duration: {video_duration:.2f}s, audio duration: {audio_duration:.2f}s, looped {len(processed_clips)-len(base_clips)} clips")
     
    # merge video clips progressively, avoid loading all videos at once to avoid memory overflow
    logger.info("starting clip merging process")
    if not processed_clips:
        logger.error("no clips available for merging; ensure materials are valid and readable")
        raise ValueError("no clips available for merging")
    
    # if there is only one clip, use it directly
    if len(processed_clips) == 1:
        logger.info("using single clip directly")
        shutil.copy(processed_clips[0].file_path, combined_video_path)
        # clean up temp single clip
        delete_files(processed_clips[0].file_path)
        logger.info("video combining completed")
        return combined_video_path
    
    # create initial video file as base
    base_clip_path = processed_clips[0].file_path
    temp_merged_video = f"{output_dir}/temp-merged-video.mp4"
    temp_merged_next = f"{output_dir}/temp-merged-next.mp4"
    
    # copy first clip as initial merged video
    shutil.copy(base_clip_path, temp_merged_video)
    
    # merge remaining video clips one by one
    for i, clip in enumerate(processed_clips[1:], 1):
        logger.info(f"merging clip {i}/{len(processed_clips)-1}, duration: {clip.duration:.2f}s")
        
        try:
            # load current base video and next clip to merge
            base_clip = VideoFileClip(temp_merged_video)
            next_clip = VideoFileClip(clip.file_path)
            
            # merge these two clips
            merged_clip = concatenate_videoclips([base_clip, next_clip])

            # save merged result to temp file
            merged_clip.write_videofile(
                filename=temp_merged_next,
                threads=threads,
                logger=None,
                temp_audiofile_path=output_dir,
                audio_codec=audio_codec,
                fps=fps,
            )
            close_clip(base_clip)
            close_clip(next_clip)
            close_clip(merged_clip)
            
            # replace base file with new merged file
            delete_files(temp_merged_video)
            os.rename(temp_merged_next, temp_merged_video)
            
        except Exception as e:
            logger.error(f"failed to merge clip: {str(e)}")
            continue
    
    # after merging, rename final result to target file name
    os.rename(temp_merged_video, combined_video_path)
    
    # clean temp files
    clip_files = [clip.file_path for clip in processed_clips]
    delete_files(clip_files)
            
    logger.info("video combining completed")
    return combined_video_path


def wrap_text(text, max_width, font="Arial", fontsize=60):
    # Create ImageFont
    font = ImageFont.truetype(font, fontsize)

    def get_text_size(inner_text):
        inner_text = inner_text.strip()
        left, top, right, bottom = font.getbbox(inner_text)
        return right - left, bottom - top

    width, height = get_text_size(text)
    if width <= max_width:
        return text, height

    processed = True

    _wrapped_lines_ = []
    words = text.split(" ")
    _txt_ = ""
    for word in words:
        _before = _txt_
        _txt_ += f"{word} "
        _width, _height = get_text_size(_txt_)
        if _width <= max_width:
            continue
        else:
            if _txt_.strip() == word.strip():
                processed = False
                break
            _wrapped_lines_.append(_before)
            _txt_ = f"{word} "
    _wrapped_lines_.append(_txt_)
    if processed:
        _wrapped_lines_ = [line.strip() for line in _wrapped_lines_]
        result = "\n".join(_wrapped_lines_).strip()
        height = len(_wrapped_lines_) * height
        return result, height

    _wrapped_lines_ = []
    chars = list(text)
    _txt_ = ""
    for word in chars:
        _txt_ += word
        _width, _height = get_text_size(_txt_)
        if _width <= max_width:
            continue
        else:
            _wrapped_lines_.append(_txt_)
            _txt_ = ""
    _wrapped_lines_.append(_txt_)
    result = "\n".join(_wrapped_lines_).strip()
    height = len(_wrapped_lines_) * height
    return result, height


def generate_video(
    video_path: str,
    audio_path: str,
    subtitle_path: str,
    output_file: str,
    params: VideoParams,
):
    # Validate input video exists and is non-empty before proceeding
    if not os.path.exists(video_path) or os.path.getsize(video_path) == 0:
        raise ValueError(f"invalid input video for rendering: {video_path}")

    aspect = VideoAspect(params.video_aspect)
    video_width, video_height = aspect.to_resolution()

    logger.info(f"generating video: {video_width} x {video_height}")
    logger.info(f"  ① video: {video_path}")
    logger.info(f"  ② audio: {audio_path}")
    logger.info(f"  ③ subtitle: {subtitle_path}")
    logger.info(f"  ④ output: {output_file}")

    # https://github.com/harry0703/MoneyPrinterTurbo/issues/217
    # PermissionError: [WinError 32] The process cannot access the file because it is being used by another process: 'final-1.mp4.tempTEMP_MPY_wvf_snd.mp3'
    # write into the same directory as the output file
    output_dir = os.path.dirname(output_file)

    font_path = ""
    if params.subtitle_enabled:
        if not params.font_name:
            params.font_name = "STHeitiMedium.ttc"
        font_path = os.path.join(utils.font_dir(), params.font_name)
        if os.name == "nt":
            font_path = font_path.replace("\\", "/")

        logger.info(f"  ⑤ font: {font_path}")

    def create_text_clip(subtitle_item):
        params.font_size = int(params.font_size)
        params.stroke_width = int(params.stroke_width)
        phrase = subtitle_item[1]
        max_width = video_width * 0.9
        wrapped_txt, txt_height = wrap_text(
            phrase, max_width=max_width, font=font_path, fontsize=params.font_size
        )
        interline = int(params.font_size * 0.25)
        size=(int(max_width), int(txt_height + params.font_size * 0.25 + (interline * (wrapped_txt.count("\n") + 1))))

        _clip = TextClip(
            text=wrapped_txt,
            font=font_path,
            font_size=params.font_size,
            color=params.text_fore_color,
            bg_color=params.text_background_color,
            stroke_color=params.stroke_color,
            stroke_width=params.stroke_width,
            # interline=interline,
            # size=size,
        )
        duration = subtitle_item[0][1] - subtitle_item[0][0]
        _clip = _clip.with_start(subtitle_item[0][0])
        _clip = _clip.with_end(subtitle_item[0][1])
        _clip = _clip.with_duration(duration)
        if params.subtitle_position == "bottom":
            _clip = _clip.with_position(("center", video_height * 0.95 - _clip.h))
        elif params.subtitle_position == "top":
            _clip = _clip.with_position(("center", video_height * 0.05))
        elif params.subtitle_position == "custom":
            # Ensure the subtitle is fully within the screen bounds
            margin = 10  # Additional margin, in pixels
            max_y = video_height - _clip.h - margin
            min_y = margin
            custom_y = (video_height - _clip.h) * (params.custom_position / 100)
            custom_y = max(
                min_y, min(custom_y, max_y)
            )  # Constrain the y value within the valid range
            _clip = _clip.with_position(("center", custom_y))
        else:  # center
            _clip = _clip.with_position(("center", "center"))
        return _clip

    video_clip = VideoFileClip(video_path).without_audio()
    audio_clip = AudioFileClip(audio_path).with_effects(
        [afx.MultiplyVolume(params.voice_volume)]
    )

    def make_textclip(text):
        return TextClip(
            text=text,
            font=font_path,
            font_size=params.font_size,
        )

    if subtitle_path and os.path.exists(subtitle_path):
        sub = SubtitlesClip(
            subtitles=subtitle_path, encoding="utf-8", make_textclip=make_textclip
        )
        text_clips = []
        # global subtitle time shift (can be negative)
        try:
            shift = float(getattr(params, "subtitle_offset", 0.0) or 0.0)
        except Exception:
            shift = 0.0
        for item in sub.subtitles:
            if shift != 0:
                try:
                    item = ((item[0][0] + shift, item[0][1] + shift), item[1])
                except Exception:
                    pass
            clip = create_text_clip(subtitle_item=item)
            text_clips.append(clip)
        video_clip = CompositeVideoClip([video_clip, *text_clips])

    bgm_file = get_bgm_file(bgm_type=params.bgm_type, bgm_file=params.bgm_file)
    if bgm_file:
        try:
            effects = [afx.MultiplyVolume(params.bgm_volume)]
            # optional fade in/out controls
            try:
                fi = float(getattr(params, "bgm_fade_in_sec", 0.0) or 0.0)
            except Exception:
                fi = 0.0
            try:
                fo = float(getattr(params, "bgm_fade_out_sec", 3.0) or 0.0)
            except Exception:
                fo = 0.0
            if fi > 0:
                effects.append(afx.AudioFadeIn(fi))
            if fo > 0:
                effects.append(afx.AudioFadeOut(fo))
            # loop to match duration
            effects.append(afx.AudioLoop(duration=video_clip.duration))
            # simple ducking: apply additional volume reduction when enabled
            try:
                if bool(getattr(params, "bgm_ducking", False)):
                    effects.append(afx.MultiplyVolume(0.6))
            except Exception:
                pass
            bgm_clip = AudioFileClip(bgm_file).with_effects(effects)
            audio_clip = CompositeAudioClip([audio_clip, bgm_clip])
        except Exception as e:
            logger.error(f"failed to add bgm: {str(e)}")

    video_clip = video_clip.with_audio(audio_clip)
    video_clip.write_videofile(
        output_file,
        audio_codec=audio_codec,
        temp_audiofile_path=output_dir,
        threads=params.n_threads or 2,
        logger=None,
        fps=fps,
    )
    video_clip.close()
    del video_clip


def preprocess_video(materials: List[MaterialInfo], clip_duration=4):
    for material in materials:
        if not material.url:
            continue

        ext = utils.parse_extension(material.url)
        try:
            clip = VideoFileClip(material.url)
        except Exception:
            clip = ImageClip(material.url)

        width = clip.size[0]
        height = clip.size[1]
        if width < 480 or height < 480:
            logger.warning(f"low resolution material: {width}x{height}, minimum 480x480 required")
            continue

        if ext in const.FILE_TYPE_IMAGES:
            logger.info(f"processing image: {material.url}")
            # Create an image clip and set its duration to 3 seconds
            clip = (
                ImageClip(material.url)
                .with_duration(clip_duration)
                .with_position("center")
            )
            # Apply a zoom effect using the resize method.
            # A lambda function is used to make the zoom effect dynamic over time.
            # The zoom effect starts from the original size and gradually scales up to 120%.
            # t represents the current time, and clip.duration is the total duration of the clip (3 seconds).
            # Note: 1 represents 100% size, so 1.2 represents 120% size.
            zoom_clip = clip.resized(
                lambda t: 1 + (clip_duration * 0.03) * (t / clip.duration)
            )

            # Optionally, create a composite video clip containing the zoomed clip.
            # This is useful when you want to add other elements to the video.
            final_clip = CompositeVideoClip([zoom_clip])

            # Output the video to a file.
            video_file = f"{material.url}.mp4"
            final_clip.write_videofile(video_file, fps=30, logger=None)
            close_clip(clip)
            material.url = video_file
            logger.success(f"image processed: {video_file}")
    return materials
