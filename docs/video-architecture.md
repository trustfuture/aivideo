# MoneyPrinterTurbo 视频生成原理说明

本说明面向开发者，概述项目的端到端生成流程、核心模块职责、数据流、关键配置与可扩展点。文件路径均为仓库相对路径，便于对照阅读与调试。

## 目录
- [总体概览](#总体概览)
- [端到端流程](#端到端流程)
- [核心模块](#核心模块)
- [数据与产物目录](#数据与产物目录)
- [关键配置](#关键配置)
- [API 入口](#api-入口)
- [鲁棒性与性能优化](#鲁棒性与性能优化)
- [可扩展点](#可扩展点)

## 总体概览
- 输入：视频主题/脚本、尺寸、拼接与转场策略、配音（人声/语速/音量）、字幕配置、BGM 等（`app/models/schema.py:VideoParams`）。
- 产出：一个或多个短视频（`final-*.mp4`），以及中间合并视频（`combined-*.mp4`）、音频与字幕。
- 架构：FastAPI 提供 API 与任务编排；MoviePy 进行音视频处理；Edge/Azure/SiliconFlow 完成 TTS；Pexels/Pixabay 提供视频素材；Faster-Whisper 可选用于字幕。

## 端到端流程
主流程由 `app/services/task.py:start` 统一编排，`stop_at` 支持切分到各阶段便于调试。

1) 生成视频脚本（可选）
- 函数：`app/services/llm.py:generate_script`
- 说明：根据主题与段落数构造提示词，调用配置的 LLM 供应商，返回纯文本脚本。

2) 生成检索词（素材搜索）
- 函数：`app/services/llm.py:generate_terms`
- 说明：从脚本抽取英文短语数组，用于 Pexels/Pixabay 搜索，限制 1–3 个词/项。

3) 合成旁白音频（TTS）
- 入口：`app/services/voice.py:tts`
- 分支：
  - `edge-tts`（`azure_tts_v1`）：默认；返回 mp3 与逐词时间边界（WordBoundary）。
  - Azure 认知语音新版（`azure_tts_v2`）：当人声名包含 `-V2-`。
  - SiliconFlow（`siliconflow_tts`）：当人声名以 `siliconflow:` 前缀。

4) 生成字幕（可选）
- Edge 对齐：`app/services/voice.py:create_subtitle` 使用 TTS WordBoundary 与脚本句法对齐生成 SRT。
- Whisper 回落：`app/services/subtitle.py:create` 识别音频后，`subtitle.py:correct` 按脚本纠偏（相似度拼接）。
- 策略：由 `config.toml` 的 `app.subtitle_provider = edge|whisper` 决定。

5) 搜索/下载视频素材
- 函数：`app/services/material.py:download_videos`
- 说明：按检索词调用 `search_videos_pexels|pixabay` 过滤出目标分辨率/最小时长素材；去重下载并累计时长至覆盖音频。

6) 拼接素材与统一尺寸
- 函数：`app/services/video.py:combine_videos`
- 说明：
  - 子片段切分：按 `video_clip_duration` 将素材切段（`SubClippedVideoClip`）。
  - 拼接模式：顺序或随机（`VideoConcatMode`）。
  - 尺寸适配：比较宽高比，等比缩放，不足以黑底居中（`ColorClip` + `CompositeVideoClip`）。
  - 转场效果：无/淡入/淡出/滑入/滑出/随机（`app/services/utils/video_effects.py`）。
  - 时长兜底：若不足音频时长，循环已处理片段直至覆盖。
  - 渐进合并：逐段加载与写盘，控制内存峰值。

7) 字幕渲染与混音导出
- 函数：`app/services/video.py:generate_video`
- 说明：
  - 字幕：`Pillow` 计算断行宽度（`wrap_text`），`TextClip` 渲染；位置支持 top/bottom/center/custom。
  - 混音：旁白乘 `voice_volume`，BGM 乘 `bgm_volume`，自动 Loop 并尾部淡出。
  - 编码：视频 `libx264`，音频 `aac`，`fps=30`。

## 核心模块
- 任务编排与状态
  - `app/services/task.py`：`start` 编排 1→7；`generate_*` 系列分步实现；`state` 记录进度与结果。
  - `app/services/state.py`：内存/Redis 状态实现。
- 文案与检索词
  - `app/services/llm.py`：对接 OpenAI、Moonshot、Azure、DeepSeek、Gemini、Qwen、Ollama、OneAPI、g4f、Cloudflare、Ernie、Pollinations。
- 语音与字幕
  - `app/services/voice.py`：Edge/Azure/SiliconFlow TTS，字幕生成与对齐，音频时长计算。
  - `app/services/subtitle.py`：Faster-Whisper 识别、SRT 纠错对齐。
- 素材获取
  - `app/services/material.py`：Pexels/Pixabay 搜索、下载与缓存。
- 视频处理
  - `app/services/video.py`：拼接、尺寸适配、转场、字幕叠加、混音与导出。
  - `app/services/utils/video_effects.py`：转场效果封装。
- API 与路由
  - `app/controllers/v1/video.py`：创建任务（/videos、/audio、/subtitle）、查询与下载、BGM 上传/枚举。

## 数据与产物目录
- 任务目录：`storage/tasks/<task_id>/`
  - `script.json`（脚本与参数快照）
  - `audio.mp3`（TTS 输出）
  - `subtitle.srt`（字幕）
  - `combined-*.mp4`（拼接过的无字幕视频）
  - `final-*.mp4`（叠字+混音成片）
- 素材缓存：`storage/cache_videos/`（可通过 `app.material_directory` 改为固定目录或按任务隔离）
- 资源：`resource/songs/`（BGM）、`resource/fonts/`（字体）

## 关键配置
- 文件：`config.toml`（参考 `config.example.toml`）
- LLM：`app.llm_provider` 与对应的 `*_api_key/_base_url/_model_name`。
- 素材 Key：`app.pexels_api_keys`、`app.pixabay_api_keys`（支持多 Key 轮换避限流）。
- 字幕：`app.subtitle_provider = edge|whisper`；Whisper 参数在 `[whisper]` 段配置。
- 工具链路径：`app.ffmpeg_path`、`app.imagemagick_path`（Windows 必配）。
- 端点与并发：`app.endpoint`（用于生成下载 URL）、`app.max_concurrent_tasks`；可启用 Redis 状态。
- 配置加载：`app/config/config.py`（自动复制 example 并支持 utf-8-sig）。

## API 入口
- 创建短视频：`POST /v1/videos`（请求体：`TaskVideoRequest`）
- 仅生成音频/字幕：`POST /v1/audio`、`POST /v1/subtitle`
- 查询任务：`GET /v1/tasks/{task_id}`（返回可下载 URL）
- 下载/流式播放：`GET /v1/stream/{file_path:path}`、`GET /v1/download/{file_path}`（见 `app/controllers/v1/video.py`）
- BGM 管理：`GET/POST /v1/musics`

## 鲁棒性与性能优化
- 渐进式合并：逐段 `concatenate_videoclips` 并写临时文件，避免一次性加载所有片段。
- 显式资源释放：`close_clip` 关闭 reader/audio/mask 并 `gc.collect()`，降低内存峰值与句柄泄漏。
- 尺寸自适应：按宽高比等比缩放，黑底居中避免拉伸变形。
- 时长兜底：拼接不足时循环片段，保证成片时长 ≥ 音频时长。
- 分辨率门槛：素材低于 480×480 会被跳过，避免低清素材。
- 网络与限流：多 Key 轮换、失败重试、下载缓存命中（按 URL md5 命名）。

## 可扩展点
- 新 LLM 供应商：在 `app/services/llm.py:_generate_response` 添加分支与配置项。
- 新 TTS 服务：在 `app/services/voice.py:tts` 分发并实现合成函数，产出与 Edge 兼容的时间边界结构以复用对齐。
- 新素材源：在 `app/services/material.py` 实现 `search_videos_*` 与下载逻辑，接入 `download_videos`。
- 新转场与效果：在 `app/services/utils/video_effects.py` 增加效果并扩展 `VideoTransitionMode`。
- 新尺寸模板：扩展 `app/models/schema.py:VideoAspect` 与分辨率映射。

---

参考文件（部分）：
- `app/services/task.py`
- `app/services/llm.py`
- `app/services/voice.py`
- `app/services/subtitle.py`
- `app/services/material.py`
- `app/services/video.py`
- `app/services/utils/video_effects.py`
- `app/models/schema.py`
- `app/controllers/v1/video.py`
- `app/config/config.py`
- `config.example.toml`

