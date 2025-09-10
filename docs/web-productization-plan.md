# MoneyPrinterTurbo Web 产品化与对齐计划

面向目标：将现有 Next.js 前端从 “Demo 工具” 打磨为“可用产品”，实现与 Streamlit WebUI 功能对齐，提供清晰的任务流、可配置能力与稳定的渲染体验。

---

## 目标与范围

- 目标
  - 前端达到与 Streamlit WebUI 功能对齐（功能与参数项）。
  - 产品级信息架构与 UI/UX：清晰的创建流程、任务中心、时间线与分镜编辑、设置中心。
  - 核心控制能力：配置管理（LLM、素材 Key、字幕/TTS 等），TTS 试听，分镜编辑（含 Shotlist）、在线/本地素材选择与替换、预览与成片渲染。
  - 开发体验：API 形态清晰、参数对齐 `app/models/schema.py`、可扩展性强。

- 范围
  - 后端新增辅助接口：配置读写、声库查询、TTS 试听（可选日志流）。
  - 前端页面改造：设置中心、创建页增强、任务详情（Shotlist 与日志）、时间线增强与渲染流程。
  - 国际化（基础可选）与主题化（可选）。

- 非目标
  - 新增第三方素材源（抖音/B站/小红书）——暂不纳入本迭代。
  - 自动上传平台（YouTube 等）——后续迭代考虑。
  - 复杂权限/账号体系。

---

## 功能对齐清单（与 Streamlit WebUI）

- 基础设置与配置
  - [ ] UI 语言切换、语言包（i18n）
  - [x] LLM 供应商与参数（API Key、Base URL、Model、Secret/Account）
  - [x] Pexels / Pixabay API Keys 维护
  - [x] 字幕 Provider 选择（edge/whisper）
  - [x] Azure 语音 Region/Key、SiliconFlow API Key（前后端读写与调用已打通）
  - [ ] UI 选项（隐藏基础设置/日志）→ 产品化可只保留必要项

- 脚本与关键词
  - [x] 生成脚本（/v1/scripts）
  - [x] 生成关键词（/v1/terms）
  - [x] 脚本语言选择（Auto + zh-CN/zh-HK/zh-TW/de-DE/en-US/fr-FR/vi-VN/th-TH）

- 音频/TTS
  - [x] TTS 服务器选择（Azure V1/ V2、SiliconFlow）
  - [x] 动态声库列表（按服务器过滤）
  - [x] 试听（合成短音频并播放）
  - [x] 语音参数（voice_name、voice_rate、voice_volume）

- 视频参数
  - [x] 全局转场（None/Shuffle/FadeIn/FadeOut/SlideIn/SlideOut）
  - [x] 同时生成数量 video_count（1–5）
  - [x] BGM 类型（无/随机/自定义）、BGM 音量
  - [x] 分镜规划（/v1/segments/plan）、渲染（/v1/segments/render）

- 字幕
  - [x] 字体选择（resource/fonts 枚举）
  - [x] 字体颜色、大小、描边颜色/宽度
  - [x] 位置（顶部/居中/底部/自定义百分比）
  - [x] 时间线渲染参数同步（subtitle_offset、bgm fade/ducking 等）

- 分镜编辑
  - [x] Shotlist 表（scene_title / shot_no / shot_desc / style / duration）
  - [x] 将 Shotlist 应用于 segments、从 segments 回填 Shotlist
  - [x] 时间线拖拽排序、批量操作、素材替换/重检索、单段预览与全量渲染、预览缓存

- 任务与日志
  - [x] 列表/删除/重试、详情轮询与产物链接
  - [ ] 实时日志或增量日志（可选，后端提供流式或拉取接口）
  - [ ] “打开任务目录”的等价（提供下载打包或浏览下载链接）

---

## 优先级与里程碑（状态）

- P0（必须，第一阶段）
  - [x] 配置管理 API + 前端设置中心
  - [x] TTS 声库查询与试听 API + 前端控件
  - [x] 创建页补齐：脚本/关键词生成、脚本语言、全局视频参数（转场、数量、BGM 类型/音量）
  - [x] 时间线：Shotlist 编辑与应用/回填（保存后刷新，参数桥接）
  - [x] 材料选择器完善（库/上传/在线检索/下载并使用）

- P1（增强，第二阶段）
  - [ ] 国际化与语言切换（沿用 Streamlit 语言键）
  - [ ] 实时日志（SSE/WebSocket 或拉取）+ 前端日志区
  - [ ] UI/UX 打磨（空态、Skeleton、表单校验、错误提示一致性、快捷行动入口）
  - [ ] 可配置的默认参数模板（预设“竖屏种草”“横屏解说”等）

- P2（可选，第三阶段）
  - [ ] Dark Mode、主题与品牌化
  - [ ] 任务产物打包下载、一键清理缓存资源
  - [ ] DevOps：Docker 化前后端一体化启动（现已具备基础 compose）

---

## 后端改造任务（P0 必须）

1) 新增 Config 控制器（已完成）
- 目的：前端读写 config.toml 的重要子集
- 路由
  - GET `/api/v1/config`
  - PUT `/api/v1/config`
- 字段（白名单）
  - app: `llm_provider`, `pexels_api_keys[]`, `pixabay_api_keys[]`, `subtitle_provider`（edge|whisper）, `endpoint`, `max_concurrent_tasks`
  - azure: `speech_region`, `speech_key`
  - siliconflow: `api_key`
  - ui: `language`, `font_name`, `text_fore_color`, `font_size`
- 响应示例
```json
// GET
{
  "status": 200,
  "data": {
    "app": { "llm_provider": "deepseek", "subtitle_provider": "edge", "pexels_api_keys": ["..."] },
    "azure": { "speech_region": "eastasia" },
    "siliconflow": { "api_key": "" },
    "ui": { "language": "zh-CN", "font_name": "MicrosoftYaHeiBold.ttc" }
  }
}
```
```json
// PUT body（仅传需要更新的字段；后端 merge 并 save_config）
{
  "app": { "llm_provider": "moonshot" },
  "ui": { "language": "en-US" }
}
```
- 验收标准
  - 仅白名单字段读写；保存成功后可立即影响新任务。
  - 数组或字符串 Key 均支持（如 Keys 输入以逗号分隔 → 服务端存数组）。

2) 新增 Voice 控制器（已完成）
- 目的：声库检索与 TTS 试听
- 路由
  - GET `/api/v1/voices?server=azure-tts-v1|azure-tts-v2|siliconflow`
  - POST `/api/v1/tts/test`
- 逻辑
  - GET /voices
    - `siliconflow` → `voice.get_siliconflow_voices()`
    - `azure-tts-v1|v2` → `voice.get_all_azure_voices()` 并按 V1/V2 过滤
  - POST /tts/test
    - body: `{ "text": "Hello", "server": "azure-tts-v2", "voice_name": "...", "voice_rate": 1.0, "voice_volume": 1.0 }`
    - 返回：`{ "file": "/absolute/path/to/tmp.mp3", "url": "http://.../tasks/<id>/tmp-tts.mp3" }`（建议用任务目录或 temp 统一暴露）
- 验收标准
  - 声库数量与 Streamlit 一致或可替代，试听成功率可接受（失败有错误信息）。

3) 可选：日志接口（未完成）
- GET `/api/v1/tasks/{task_id}/logs?offset=N`
  - 返回新增 N 之后的日志片段，或直接返回最近 K 行。
- SSE `/api/v1/tasks/{task_id}/logs/stream`
  - 产线可选，先提供简单 GET 拉取。

---

## 前端改造任务（P0 必须）

1) 设置中心（Settings）
- 模块
  - 配置读取/保存（对应 Config API）
  - 供应商与 LLM 参数说明：引导去设置 API Key（可不直接展示明文）。
  - 素材 Keys、字幕提供商、Azure/SiliconFlow Key、UI 语言、字体默认值。
- 验收标准
  - 保存即生效；必要字段校验与提示；错误 Toast 反馈；返回后能被 Create/Timeline 使用。

2) 创建页（Create）增强
- 表单新增
  - 脚本语言选择（Auto + 列表）
  - “生成视频脚本与关键词”“仅关键词”按钮（调用 /v1/scripts 与 /v1/terms）
  - 全局视频设置：全局转场、同时生成数量 video_count、BGM 类型（无/随机/自定义文件）、BGM 音量
  - TTS：服务器选择、声库下拉、Azure/SiliconFlow 鉴权（引导在 Settings 设置）、试听按钮
  - 字幕：字体/颜色/描边/大小（默认值可从 Settings 读取）
- 交互
  - 按钮 disable 条件与加载态；错误提示清晰
- 验收标准
  - 提交 `/v1/segments/plan` 与 `/v1/videos` 参数齐全且与后端对齐；能在任务详情页正确显示与渲染。

3) 任务详情（Task Detail）增强：Shotlist + 日志（Shotlist 已完成，日志待做）
- Shotlist 区域
  - 表格字段：`order`（只读）、`scene_title`、`shot_no`、`shot_desc`、`style`、`duration`
  - 按钮：“应用到分镜”“从分镜生成”，与 Streamlit 行为一致（保存后 `/v1/segments/save`）
- 日志区（可选）
  - 轮询或拉取日志 API，展示最近日志；失败提示
- 验收标准
  - Shotlist 与 segments 可双向同步；保存后预览/渲染有效。

4) 时间线（已具备基础）补足参数桥接（已完成）
- 将 Create/Settings 默认值透传为渲染参数（subtitle_offset、bgm_fade_in/out、bgm_ducking 等，渲染时传入 `/v1/segments/render` 的 params）。
- 验收标准
  - 预览命中缓存策略可保留；参数变更能导致预览缓存失效并重新渲染。

---

## UI/UX 产品化（P1 建议）

- 信息架构
  - 顶部导航：主页 / 新建 / 任务 / 设置
  - 主页：简述 + 快捷入口 + 最近任务
- 视觉与反馈
  - 统一空态、加载 Skeleton、Error 区块、Toast 提示
  - 表单一致性：输入、Select、颜色选择器、文件选择交互
  - 快捷操作：在任务卡片和详情添加“预览最近成果”“打开合成/成片链接”的快捷按钮
- 国际化
  - 采用 `next-intl` 或简单 JSON 词典（沿用 Streamlit 的 key），顶部语言切换持久化到 localStorage，并写回 Config.ui.language（可选）

---

## API/数据模型一致性

- 任务创建与渲染参数对齐 `app/models/schema.py: VideoParams`
  - Create 页与 Timeline 渲染传参必须遵循：`video_aspect`、`video_concat_mode`、`video_transition_mode`、`video_clip_duration`、`video_count`、`voice_name/voice_rate/voice_volume`、`bgm_type/bgm_file/bgm_volume/bgm_fade_in_sec/bgm_fade_out_sec/bgm_ducking`、`subtitle_enabled/subtitle_position/custom_position/subtitle_offset/font_name/text_fore_color/font_size/stroke_color/stroke_width`
- 分镜项 `SegmentItem` 对齐
  - 时间线编辑附加字段（`transition_duration/transition_direction/transition_mask/speed/fit`）后端已支持（生成阶段兼容）

- 前端 Zod Schema 对齐（已完成）
  - 新增 `VideoParamsSchema` 与 `SegmentItemSchema`，Timeline 渲染前做 `safeParse` 校验；无效时回退到后端默认。

- 渲染/字幕流程（已优化）
  - 生成分镜时同步生成字幕；渲染端若缺失字幕则兜底转写并纠正；预览仅返回合成画面以提速。

---

## 风险与对策

- 密钥明文传输风险：Config GET 可对 Secrets 做掩码；PUT 接收完整值；在本地开发环境暂时放宽。
- 试听接口资源占用：清理临时文件；限制并发或使用任务目录隔离。
- Whisper 模型下载（字幕回落）：前端设置页提示与说明文档链接。
- 预览频繁渲染：保留前端预览缓存；后台合成采用 preview 模式仅生成 combined，提升速度。

---

## 验收与测试

- 单元测试（后端）
  - Config/Voice 控制器基本逻辑与白名单校验
- 集成测试（手动）
  - 设置中心：读/写/保存/回填
  - 创建流程：无脚本 → 生成脚本/关键词 → 仅分镜 → 时间线预览 → 保存 → 全量渲染
  - TTS：服务器切换、声库加载、试听成功与失败回退
  - Shotlist：编辑并应用；从分镜生成
  - 素材选择：库/上传/在线检索/下载并使用；单段替换与重检索

---

## 迭代计划（建议）

- 迭代 1（P0）
  - 后端：Config、Voice、（可选）Logs
  - 前端：Settings、Create 增强、Task Detail（Shotlist）、Timeline 参数桥接
- 迭代 2（P1）
  - i18n、多语言切换；日志区；UI/UX 打磨
- 迭代 3（P2）
  - 主题/Dark 模式；打包下载；一键清理

---

## 交付定义（DoD）

- 所有新增 API 在 `/docs` 可见且带示例。
- Create/Settings/Task Detail/Timeline 全流程跑通；与 Streamlit 参数一致，最终产物一致。
- 文档：README（web/README.md）更新配置与运行说明；设置页字段说明；常见错误提示。
- 错误反馈清晰，Toast 覆盖常见失败路径；日志可辅助排障（如启用）。
