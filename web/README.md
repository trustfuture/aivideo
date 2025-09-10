# MoneyPrinterTurbo Web (Next.js)

基于 Next.js + Tailwind CSS v4 + TypeScript 的新前端。后端复用 FastAPI 接口，按 `/api/v1/*` 路由联调。

## 开发

1) 复制环境变量

```
cp .env.example .env.local
```

2) 安装依赖（需要网络权限）

```
pnpm install
```

3) 启动开发服务

```
pnpm dev
```

- 默认 API 地址：`NEXT_PUBLIC_API_BASE`（`.env.local` 中配置，默认 http://localhost:8080/api）
- 目录结构：
  - `app/` App Router 页面
  - `lib/` API 封装与类型 schema
  - `components/` 基础组件
  - `components/ui/` 基于 shadcn‑ui 的通用组件（Button/Input/Select/Dialog/Skeleton/Progress 等）

## 与后端联调
- 默认后端运行在 `http://localhost:8080`，Next 前端通过 `NEXT_PUBLIC_API_BASE` 指向 `http://localhost:8080/api`。
- 关键接口：
  - `POST /v1/segments/plan` 仅生成分镜并返回 `task_id` + `segments`
  - `POST /v1/videos` 一键生成，返回 `task_id`
  - `GET /v1/tasks` 任务列表（分页）
  - `GET /v1/tasks/{id}` 任务进度与产物链接（详情页轮询）
  - `GET /v1/tasks/{id}/segments` 读取分镜（时间线初始化）
  - `POST /v1/segments/render` 预览 N 段或全量渲染（支持 `preview=true`，单段预览写入 `preview-<segment_id>.mp4`）
  - `POST /v1/segments/save` 持久化当前分镜（写回 `segments.json`）

### P1：可视化编辑增强
- 时间线支持拖拽排序、多选批量操作、缩略图与时码标尺，单段预览与“重检索并替换”。
- 字幕与音频可调：
  - 字幕：开关、位置（含自定义百分比）、字号、描边、颜色、整片时移（秒）。
  - 音频：BGM 音量、淡入/淡出秒数、语音下压（ducking）。
- 渲染稳定性：
  - 预览缓存（相同分镜与参数命中直接打开）。
  - 并发限制 + 简易队列，支持取消、失败重试与“打开最近预览”。

## 注意
- Tailwind v4 使用 `@import "tailwindcss";` 方式引入，已在 `app/globals.css` 中配置。
- 已接入 shadcn‑ui（按需引入），通知采用 Sonner Toaster。
