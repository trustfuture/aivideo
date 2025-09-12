# Web 多工具 AIGC 产品化改造计划（IA + 路由 + 任务编排）

> 目的：将单一“AI 视频剪辑”进化为“AI 生图 / AI 生视频 / AI 剪辑”等多能力的产品形态，统一信息架构、任务编排与资产管理，形成可扩展的多工具工作室体验。与 `docs/web-ui-ux-implementation-plan.md`（视觉/交互体系）与 `docs/web-productization-plan.md`（功能对齐）互补。

## 目标与原则
- 从“工具”转向“产品”：有清晰的信息架构、稳定的任务流与一致的反馈。
- 多能力共用的基础设施：导航、任务中心、项目/资产、模板/预设、计费/额度、Onboarding。
- 复用设计系统：沿用 tokens + shadcn 语义色、密度/半径开关与动效规范。

## 信息架构（IA）与导航
- 分组导航（Sidebar 分组 + Topbar 快捷）
  - 工作台：Dashboard（主页）、Projects（项目）、Tasks（任务中心）
  - 生成：Gen Image（生图）、Gen Video（生视频）、TTS/Audio（可选）
  - 编辑：Edit Video（剪辑/时间线）、Edit Image（修复/抠图/消除等占位）
  - 资源：Assets（素材库/历史产物）、Templates（模板/预设）
  - 实验：Labs（模型实验/Beta 能力）
  - 管理：Settings（设置）、Billing（计费/额度）、Help（帮助/反馈）
- 交互
  - Sidebar 可折叠/Tooltip，移动端 Topbar 精简。
  - 命令面板（⌘K）：跨模块跳转（最近任务、创建、模板、设置项）。

## 路由与目录（Next.js App Router）
- 路由草案（与后端 `/api/v1/*` 保持）：
  - `/` Dashboard（概览、快速入口、最近任务/项目）
  - `/projects` 列表；`/projects/[id]` 详情（任务、资产、版本）
  - `/gen/image` 生图；`/gen/video` 生视频（文本→视频/图文→视频）
  - `/edit/video` 剪辑（时间线/Shotlist）；`/edit/image` 图像编辑（占位）
  - `/assets` 素材库；`/templates` 模板中心
  - `/tasks` 任务中心；`/tasks/[id]` 任务详情（进度、日志、产物）
  - `/settings` 设置；`/billing` 计费；`/labs` 实验区
- 代码组织
  - `web/features/*` 按能力分包：`gen-image` `gen-video` `edit-video` `assets` `projects` 等。
  - 通用 UI：`components/ui/*`；数据表与表单封装 `components/ui/data-table/*`、`components/ui/form/*`。
  - 导航配置：`web/lib/nav.ts`（分组/路由/comingSoon/权限）。

### 路由映射与复用（已落地）
- 现有“基于素材剪视频”的 MVP 已迁移映射到“视频剪辑”分路由：
  - `/edit/video/create` 复用 `app/create/page.tsx`（不改动原路径，双路径可用）。
  - `/edit/video/tasks` 复用 `components/tasks/tasks-client.tsx` 作为列表页。
  - `/edit/video/tasks/[id]` 复用 `components/tasks/task-detail-client.tsx` + 与 `/tasks/[id]` 同步的数据获取逻辑。
- 兼容性：原有 `/create`、`/tasks`、`/tasks/[id]` 路径保留，确保外部链接与现有工作流不受影响。

### 顶部导航与任务中心抽象（已落地）
- Topbar 移动端导航与 Sidebar 工作台快捷项已指向新路由：`/edit/video/create` 与 `/edit/video/tasks`；Command Menu 的“新建/查看任务”已同步更新。
- 任务中心抽象：新增 `components/jobs/job-list.tsx` 与 `components/jobs/job-detail.tsx` 作为通用封装，`/tasks` 与 `/edit/video/tasks` 复用同一实现。
- 路径感知：任务列表与详情组件根据当前路径自动选择基路径（`/tasks` 或 `/edit/video/tasks`），保证在两套入口下链接与分页/跳转正确。
- Command Menu 扩展：新增“视频剪辑主页/新建剪辑任务/查看剪辑任务/素材库/模板/项目”及最近 5 条任务快捷项（自动刷新）。
- `/edit/video` 主页增强：加入“快速入口卡片”与“最近任务摘要”（前 5 条）。

### 布局与品牌（已落地）
- Sidebar 品牌区：增加 LogoMark + 品牌名（展开时展示全名，收起时仅展示 LogoMark）。
- Sidebar 工作台中移除“新建”以避免与“视频剪辑”重复（后续如引入多能力“新建”，可改为类型选择或指向 `/new`）。
- Topbar 工具区靠右：搜索/语言切换/主题切换/忙碌指示右对齐；保留移动端最小导航。

## 统一任务编排（Job/Task Center）
- 领域模型
  - `Job`: `id` | `type`(`gen_image`|`gen_video`|`edit_video`|...) | `params` | `status`(`pending`/`running`/`succeeded`/`failed`) | `progress` | `createdAt` | `output[]` | `error`。
  - 日志：轮询或增量日志（SSE/WebSocket 可选），展示最近 N 行。
- 统一组件
  - `JobStarter`：提交/校验/加载态；`JobStatusCard`：状态/进度/最近日志/产物。
  - 详情布局：头部（标题/状态/主操作），主区（参数摘要+产物），侧栏（日志/关联）。

## 项目 / 资产 / 模板 / 预设
- 项目（Projects）
  - 聚合一次创作的任务与素材；支持版本（v1/v2…）、备注；生成/编辑时可指定目标项目。
- 资产（Assets/Library）
  - Tab：上传/在线检索/历史产物；标签/筛选/批量操作；与创建/编辑选择器打通。
- 模板/预设（Templates/Presets）
  - 能力化的 JSON 预设（zod schema）；“简单/高级”参数一键切换；“从任务复刻”。

## 能力页模板（生成/编辑共用骨架）
- 布局
  - 左：核心参数（Prompt/素材/模型/控制），顶部“简单/高级”切换；底部 Sticky 主操作（预览/生成）。
  - 右：实时预览/历史记录/对比；A/B 并列可选。
- 参数分组
  - 通用（Prompt/Seed/Guidance）、模型（供应商/模型/分辨率/步数/控制网）、风格（风格库/LoRA/负面提示）、输出（尺寸/fps/时长/字幕/水印/格式）。
- 预览先行
  - 低成本“快速预览”参数（低分辨率/短时长）以提升试错效率。

## 编辑工作区（Edit）
- 视频剪辑
  - 左：片段/层级；中：时间线（视频/音频/字幕/特效轨道）；右：属性面板（参数/转场/字幕）。
  - 支持 Shotlist 导入；渲染产出写回项目；与任务流打通。
- 图像编辑
  - 画布与图层；局部编辑/一键风格化（占位 UI），与生图共享预设与素材。

## 计费/额度与 Onboarding
- Billing/Credits
  - 显示剩余额度与单次扣费估算；不足时引导充值/绑定 Key；支持“用户自带 Key / 平台额度”。
- Onboarding & 空状态
  - 三步引导（配置 Key → 创建 → 预览/任务）；空状态统一（图标/一句话/主按钮/文档链接）。
- 错误与保护
  - 配置缺失时页内 banner + 去设置；提交前禁用并给出原因；失败提供可复制的上下文/参数。

## 工程一致性（与现有 UI/UX 方案对齐）
- 设计系统：使用 Indigo 品牌色 tokens、密度/半径开关、Linear 风格动效与焦点态。
- 数据层：TanStack Query + zod；列表用 TanStack Table + 虚拟滚动；RSC 优先，交互组件 client。
- 国际化：`web/lib/i18n.ts` 统一 key；空态/错误/按钮文案抽离。
- 性能与可访问性：懒加载、`next/image`、避免 CLS；AA 对比度、键盘可达、尊重 `prefers-reduced-motion`。

## Sidebar 配置示例（`web/lib/nav.ts`）
```ts
export type NavItem = { href: string; label: string; icon: string; comingSoon?: boolean; badge?: string };
export type NavGroup = { title: string; items: NavItem[] };
export const NAV_GROUPS: NavGroup[] = [
  { title: '工作台', items: [
    { href: '/', label: '主页', icon: 'Home' },
    { href: '/projects', label: '项目', icon: 'FolderKanban' },
    { href: '/tasks', label: '任务', icon: 'ListChecks' },
  ]},
  { title: '生成', items: [
    { href: '/gen/image', label: '生图', icon: 'Image' },
    { href: '/gen/video', label: '生视频', icon: 'Video' },
  ]},
  { title: '编辑', items: [
    { href: '/edit/video/create', label: '视频剪辑', icon: 'Scissors' },
    { href: '/edit/image', label: '图像编辑', icon: 'Wand2', comingSoon: true },
  ]},
  { title: '资源', items: [
    { href: '/assets', label: '素材库', icon: 'Library' },
    { href: '/templates', label: '模板', icon: 'Shapes' },
  ]},
  { title: '实验', items: [ { href: '/labs', label: 'Labs', icon: 'FlaskConical' } ]},
  { title: '管理', items: [
    { href: '/settings', label: '设置', icon: 'Settings' },
    { href: '/billing', label: '计费', icon: 'CreditCard' },
  ]},
];
```

## 里程碑（建议 3–5 周）
- M1 基础外观（1 周）：分组 Sidebar + `/gen/*`、`/edit/*`、`/assets`、`/templates`、`/projects`、`/billing`、`/labs` 占位；Dashboard 最小版；统一空态/加载/错误组件。
- M2 任务中心统一（0.5–1 周）：`Job` 模型 + 列表/详情统一视图；增量日志（轮询）；任务卡/详情复用。
- M3 项目与素材（1 周）：项目列表/详情；素材库最小版（上传/历史产物）；与生成/编辑联通。
- M4 能力页与预设（1 周）：生图/生视频最小参数 + 快速预览；模板/预设读写；剪辑页接入时间线与 Shotlist。
- M5 计费/Onboarding/打磨（0.5–1 周）：额度显示/引导；首登引导；命令面板常用项；动效/密度/主题面板与视觉巡检。

## 最小可行落地清单（立即着手）
- [x] 新建 `web/lib/nav.ts` 导航配置，改造 Sidebar 读取分组配置渲染。（保留现有 `/create` 入口，确保 MVP 功能不受影响）
- [x] 创建占位路由：`/gen/image`、`/gen/video`、`/edit/video`、`/edit/image`、`/assets`、`/templates`、`/projects`、`/billing`、`/labs`。
- [x] 将“素材剪视频”MVP 集成到 `/edit/video/*`：新增 `create`、`tasks`、`tasks/[id]` 并复用既有组件。
- [x] 顶部导航指向新路由；任务中心抽象为 `components/jobs/*` 并实现路径感知跳转。
- [ ] 统一任务中心：抽出 `JobStatusCard` 与任务详情布局；跨能力共享。
- [ ] Dashboard：最近任务/项目/快捷入口/文档链接。
- [ ] 能力页模板：左参数右预览 + Sticky 主按钮；参数“简单/高级”。
- [ ] 模板/预设：定义 zod Schema，JSON 保存/加载；支持“从任务复刻”。

## 验收标准
- IA 清晰：侧边分组 + 命令面板，3 次点击完成关键路径。
- 一致性：主题/动效/焦点/状态反馈一致；空态/加载/错误统一。
- 可访问性：键盘全覆盖、对比度 AA、尊重动效偏好。
- 性能：首屏 LCP 本地 < 2.5s；列表/预览流畅（60fps）。
- 可扩展性：新增能力仅需增加 `features/*`、路由与导航配置即可接入任务中心与资产体系。
