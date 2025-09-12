import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand'
import { Wand2, Film, Scissors, ListChecks, FolderOpen, Puzzle, Command, Accessibility } from 'lucide-react'

export default function OnboardingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground app-gradient">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <div className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
              <span className="text-[10px] font-bold">SC</span>
            </div>
            <span>{BRAND_NAME}</span>
          </div>
          <nav className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="#" className="rounded px-2 py-1 hover:text-foreground">产品</Link>
            <Link href="#" className="rounded px-2 py-1 hover:text-foreground">文档</Link>
            <Link href="#" className="rounded px-2 py-1 hover:text-foreground">GitHub</Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto w-full max-w-7xl px-4 pt-12 pb-8 md:pt-16 md:pb-12">
        <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-2">
          <div>
            <p className="mb-3 text-sm font-medium tracking-wide text-primary">让 AIGC 生产更可控的多工具工作室</p>
            <h1 className="text-balance text-4xl font-bold tracking-tight md:text-6xl">
              一站式 AI 生图 / 生视频 / 剪辑 与统一任务编排
            </h1>
            <p className="mt-4 max-w-xl text-pretty text-muted-foreground">
              从创意到产物，任务中心、项目与资产、模板与预设，全部在一个工作台完成。
              {BRAND_TAGLINE ? ` ${BRAND_TAGLINE}` : ''}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button asChild>
                <Link href="/">立即体验</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/tasks">查看任务</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="#">产品文档</Link>
              </Button>
            </div>
          </div>
          <div className="relative">
            {/* Preview / Illustration placeholder */}
            <div className="relative overflow-hidden rounded-xl border bg-card p-4 shadow-sm">
              <div className="pointer-events-none absolute -inset-1 rounded-xl bg-gradient-to-br from-primary/10 via-transparent to-primary/10 blur-2xl" />
              <div className="relative grid grid-cols-6 gap-2">
                <div className="col-span-4 rounded-lg border bg-muted/40 p-4">
                  <div className="mb-2 h-4 w-32 rounded bg-muted" />
                  <div className="mb-1 h-3 w-48 rounded bg-muted" />
                  <div className="mb-6 h-3 w-40 rounded bg-muted" />
                  <div className="h-40 rounded-md border bg-background" />
                </div>
                <div className="col-span-2 space-y-2">
                  <div className="h-8 rounded-md border bg-background" />
                  <div className="h-8 rounded-md border bg-background" />
                  <div className="h-8 rounded-md border bg-background" />
                  <div className="h-8 rounded-md border bg-background" />
                  <div className="h-8 rounded-md border bg-background" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto w-full max-w-7xl px-4 py-8 md:py-12">
        <h2 className="mb-6 text-2xl font-semibold tracking-tight md:text-3xl">关键特性</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Feature icon={<Wand2 className="h-5 w-5" />} title="多能力工作台" desc="生图 / 生视频 / 剪辑，统一界面与交互范式。" />
          <Feature icon={<ListChecks className="h-5 w-5" />} title="任务中心" desc="统一状态/进度/日志，失败可重试，进展一目了然。" />
          <Feature icon={<FolderOpen className="h-5 w-5" />} title="项目与资产" desc="项目聚合与素材库，产物统一沉淀与复用。" />
          <Feature icon={<Puzzle className="h-5 w-5" />} title="模板与预设" desc="参数分层（简单/高级），一键复刻提升效率。" />
          <Feature icon={<Command className="h-5 w-5" />} title="命令面板 ⌘K" desc="快速跳转与常用操作，跨模块提效。" />
          <Feature icon={<Accessibility className="h-5 w-5" />} title="可访问性" desc="全键盘可操作、对比度达标、尊重动效偏好。" />
        </div>
      </section>

      {/* Flow */}
      <section className="mx-auto w-full max-w-7xl px-4 py-8 md:py-12">
        <h2 className="mb-6 text-2xl font-semibold tracking-tight md:text-3xl">典型流程</h2>
        <ol className="grid grid-cols-1 gap-4 md:grid-cols-5">
          <FlowStep n={1} text="选择能力（生图/生视频/剪辑）" />
          <FlowStep n={2} text="配置参数（简单/高级）" />
          <FlowStep n={3} text="提交任务并跟进进度" />
          <FlowStep n={4} text="查看产物与日志" />
          <FlowStep n={5} text="复刻为模板并复用" />
        </ol>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button asChild>
            <Link href="/">立即开始</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/edit/video/create">去创建剪辑任务</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/assets">查看素材库</Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-8 border-t py-8 text-center text-sm text-muted-foreground">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 md:flex-row">
          <div>© {new Date().getFullYear()} {BRAND_NAME}</div>
          <div className="flex items-center gap-4">
            <Link href="#" className="hover:text-foreground">隐私</Link>
            <Link href="#" className="hover:text-foreground">条款</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent/10">
      <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="mb-1 font-medium">{title}</div>
      <div className="text-sm text-muted-foreground">{desc}</div>
    </div>
  )
}

function FlowStep({ n, text }: { n: number; text: string }) {
  return (
    <li className="rounded-lg border bg-card p-4">
      <div className="mb-1 text-xs font-medium text-muted-foreground">步骤 {n}</div>
      <div className="text-sm">{text}</div>
    </li>
  )
}
