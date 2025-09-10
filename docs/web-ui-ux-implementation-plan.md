# Web UI/UX 设计实施方案（Next.js + shadcn‑ui + Tailwind v4，Linear 风格）

> 目的：暂停功能开发，集中统一视觉与交互范式，建立可扩展设计系统，提升关键用户旅程与可访问性。本方案与 `docs/web-productization-plan.md` 互补，聚焦 UI/UX 规范与落地步骤。

## 目标与范围
- 统一视觉/交互，降低视觉噪音与认知负担。
- 建立可扩展设计系统（Tokens + 组件库），支撑后续功能稳定扩张。
- 强化关键用户旅程（创建/浏览/编辑/搜索），保证顺滑操作流。
- 提升可访问性（a11y）与性能（RSC、Streaming、虚拟化）。

## 里程碑与优先级
（进度：P0 已完成；品牌强调色：Indigo）
- P0 基础（约 1 周）✅ 已完成
  - 设计 Tokens + 主题（浅/深）→ Tailwind v4 + shadcn 变量对齐。
  - AppShell 布局：Sidebar + Topbar + Content + Command Menu（最小实现）。
  - 基础组件规范化：Button/Input/Select/Dialog/Dropdown/Tabs/Tooltip/Toaster（已接入）。
  - 状态系统：Loading/Empty/Error/Skeleton，统一占位与文案（已有组件）。
- P1 核心体验（约 1–1.5 周）
  - Data Table（TanStack Table）+ 虚拟滚动 + Toolbar（筛选/排序/密度）。
  - 表单模式：react‑hook‑form + zod，内联校验，表单布局规范。
  - 搜索与命令面板（⌘K），常用命令与最近操作。
  - 通知与反馈（非阻塞 toast，阻塞 dialog，轻量 banner）。
- P2 质感打磨（约 1 周）
  - 动效系统（过渡/缩放/弹性），Micro‑interaction 细节。
  - 高级主题设置（密度/半径/色彩偏好/对比度）。
  - 空间节律：间距层级、分隔线、分组标题、密集列表优化。
  - Onboarding/空状态引导与快捷键提示（kbd）。

## 信息架构与页面类型
- 导航结构
  - 左侧 Sidebar：主模块 + 二级分组（可折叠/可收起）。
  - 顶部 Topbar：Search/Command、用户菜单、全局状态/环境切换。
- 页面类型
  - 列表视图：高密度表格/卡片，支持过滤、排序、分页、批量操作。
  - 详情视图：面包屑 + Header（标题/状态/操作）+ 主信息 + 侧栏。
  - 创建/编辑：表单（2 栏或单栏）+ Sticky Footer/Toolbar。
  - 设置/偏好：分组标签 + 垂直导航，立即保存或显式保存。

## 设计系统（Tokens 与主题）
- 颜色（HSL 变量，兼容 shadcn）
  - 中性基调：低饱和灰阶，细边框（1px）+ subtle 分割。
  - 品牌强调：建议 Violet/Indigo 系，参考 Linear 的低噪音高对比。
- 触感与密度
  - 半径：`xs=6px, sm=8px, md=10px`（页面主要用 `sm/md`）。
  - 间距：4/8/12/16/20/24（优先 8 的倍数）。
  - 阴影：低高度（卡片/弹层），避免重阴影。
- 排版
  - 字体：`Geist` 或 `Inter`（Next.js `next/font`），字重 400/500/600。
  - 字号：`12/14/16/20/24`，默认 14/16，高密场景 14。

将以下 Tokens 写入 `web/app/globals.css`：

```css
@import "tailwindcss";

:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --card: 0 0% 100%;
  --card-foreground: 240 10% 3.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 240 10% 3.9%;
  --primary: 252 83% 57%;
  --primary-foreground: 0 0% 98%;
  --secondary: 240 4.8% 95.9%;
  --secondary-foreground: 240 5.9% 10%;
  --muted: 240 4.8% 95.9%;
  --muted-foreground: 240 3.8% 46.1%;
  --accent: 252 83% 57%;
  --accent-foreground: 0 0% 100%;
  --destructive: 0 84% 60%;
  --destructive-foreground: 0 0% 98%;
  --border: 240 5.9% 90%;
  --input: 240 5.9% 90%;
  --ring: 252 83% 57%;
  --radius: 8px;
}
:root[data-theme="dark"] {
  --background: 240 10% 3.5%;
  --foreground: 0 0% 98%;
  --card: 240 7% 6%;
  --card-foreground: 0 0% 98%;
  --popover: 240 7% 6%;
  --popover-foreground: 0 0% 98%;
  --primary: 252 83% 68%;
  --primary-foreground: 240 10% 3.5%;
  --secondary: 240 6% 14%;
  --secondary-foreground: 0 0% 98%;
  --muted: 240 6% 14%;
  --muted-foreground: 240 5% 65%;
  --accent: 252 83% 68%;
  --accent-foreground: 240 10% 3.5%;
  --destructive: 0 72% 51%;
  --destructive-foreground: 0 0% 98%;
  --border: 240 6% 18%;
  --input: 240 6% 18%;
  --ring: 252 83% 68%;
}
.text-balance { text-wrap: balance; }
```

Tailwind 使用：优先 `bg-background text-foreground border-border` 等 shadcn 语义类；或用 `bg-[hsl(var(--background))]`/`text-[hsl(var(--foreground))]` 细化。密度/半径通过 `data-density="compact|cozy"`、`[--radius:6px]` 控制。

## 布局与导航实现
- 目录结构（`web/`）
  - `app/layout.tsx`：注入字体、主题脚本、全局 Toaster。
  - `components/ui/app-shell.tsx`：AppShell（Sidebar/Topbar/Content）。
  - `components/ui/sidebar.tsx`：折叠/收起、当前高亮、分组标题、Tooltip。
  - `components/ui/command-menu.tsx`：⌘K 命令面板（lucide 图标）。
- 交互
  - Sidebar 收起后显示图标 + Tooltip；Hover 展开；保持键盘可达。
  - Topbar：全局搜索/命令、用户菜单、环境切换（开发/生产）。
  - Content：最大宽度约束（如 `max-w-[1400px]`），左右留白。

## 关键组件清单（基于 shadcn）
- 基础：`button input textarea select checkbox radio label badge separator tooltip`
- 弹层：`dialog dropdown-menu drawer/sheet popover hover-card`
- 导航：`tabs breadcrumb navigation-menu`
- 数据：`table scroll-area skeleton`
- 反馈：`toast`（建议 `sonner`）+ `alert`
- 表单：`form`（封装 `react-hook-form` + `zod`），`date-picker`（可选）
- 安装命令（在 `web/` 下运行）：

```bash
pnpm dlx shadcn-ui@latest add button input textarea select checkbox radio label badge separator tooltip dialog dropdown-menu sheet tabs breadcrumb table scroll-area skeleton toast
```

## 状态与反馈规范
- Loading：骨架屏 + 线性渐变（淡动效 1.1s），占位比例接近真实内容。
- Empty：图标 + 1 行标题 + 1 行说明 + 主要行动（优先 “创建/导入”）。
- Error：局部错误提示（可重试），全局错误页保留导航。
- 成功/失败：非阻塞 toast，关键破坏性操作用确认 dialog（明确后果）。
- 表单校验：失焦即时 + 提交校验，错误上浮到字段下方，保留焦点。

## 交互与动效（Linear 风格）
- 过渡：`duration-100/150/200` 为主；进入 `cubic-bezier(0.2, 0, 0, 1)`，离开 `cubic-bezier(0.4, 0, 1, 1)`。
- 悬停：细微阴影/边框增强、背景轻微提升；按钮微缩放 `scale-98 → 100`。
- 焦点：`ring-2 ring-[hsl(var(--ring))] ring-offset-2`（暗色可 `ring-offset-1`）。
- 键盘：为主操作提供快捷键（按钮文本右侧 `kbd` 提示）。
- Command Menu：最近操作/常用命令优先展示；支持 `>` 跳转子命令。

## 可访问性与国际化
- a11y：对比度 AA，焦点可见，语义标签与 `aria-*` 完整。
- 键盘：Tab 顺序、Escape 关闭弹层、Enter 提交、Space/Arrows 导航列表。
- 动画敏感：尊重 `prefers-reduced-motion`，在 CSS 降级动效。
- 多语言：文案抽离 `web/lib/i18n.ts`（若已有方案，沿用），按钮/占位语统一 key。

## 性能与工程规范
- RSC/Streaming：页面默认服务端组件，交互组件 `"use client"`。
- 数据表：TanStack Table + 虚拟滚动（行 > 100）+ 列定义缓存。
- 代码组织：将复杂样式封装为组件，复用 `cn()`（见 `web/lib/utils.ts`）。
- 图片：`next/image`，占位与尺寸约束，避免 CLS。
- 状态：UI 状态轻量用组件内 state；数据状态用 TanStack Query。
- 暗色模式：`<html data-theme="dark">` 切换，持久化在 `localStorage`。

## 实施清单（逐项落地）
- P0（已完成）
  - 在 `app/layout.tsx` 引入 Toaster；集成 AppShell（Sidebar/Topbar/Content）。
  - 在 `app/globals.css` 写入 Indigo 主题 Tokens（浅/深）。
  - 搭建 `components/ui/app-shell.tsx`、`components/ui/sidebar.tsx`、`components/ui/command-menu.tsx`。
  - 统一基础组件：Button/Input/Dialog/Dropdown/Tabs/Tooltip/Toast（已接入）。
  - 最小演示页：`app/demo/page.tsx` 展示按钮、输入、Tabs、Tooltip。
- P1
  - 集成 TanStack Table，封装 `components/ui/data-table/*`（列定义、Toolbar、密度切换）。
  - 统一表单：`components/ui/form/*` 封装 RHF + zod + 表单行/分组组件。
  - Command Menu：`components/ui/command-menu.tsx` + 常用命令 + 快捷键提示。
  - 通知策略：非阻塞 toast、阻塞 dialog、轻 banner；规范何时使用。
- P2
  - 动效系统：过渡与弹层动画变量化，Skeleton 渐变，Hover 微缩放。
  - 主题面板：用户可选密度/半径/颜色偏好（写入 `localStorage`）。
  - Onboarding：空状态引导（示例数据/快捷入口/文档链接）。
  - 全站间距/分隔线巡检与统一（视觉回归对比）。

## 验收标准
- 主题一致：浅/深模式视觉对齐，无突兀对比与阴影。
- 交互顺滑：关键流程（创建/查看/编辑/搜索）可在 3 次点击内完成。
- 可访问性：焦点可见、键盘全覆盖、对比度 AA 通过。
- 性能：首屏 LCP < 2.5s（本地），数据密集页面滑动流畅（60fps）。
- 代码规范：组件位于 `components/ui/*`，样式原子化且无重复 CSS。

## 参考命令与路径
- 组件安装：见上方 shadcn 安装命令。
- 入口与布局：`web/app/layout.tsx`、`web/app/(app)/page.tsx`。
- 样式：`web/app/globals.css`。
- 组件：`web/components/ui/*`。
- 工具：`web/lib/utils.ts`（`cn()` 保持）。

---

后续可在 `web/` 内开一个 P0 启动 PR（主题 Tokens + AppShell + 基础组件接入清单 + 最小演示页）。若需要，我可以按 Indigo 或 Violet 作为强调色预置主题。
