import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { get } from '@/lib/api'
import { TasksWrappedSchema } from '@/lib/schemas'
import { ListChecks, PlusCircle, Library, Shapes, FolderKanban } from 'lucide-react'

export default async function Page() {
  let recent: Array<{ task_id: string; progress?: number | null }> = []
  try {
    const res = await get('/v1/tasks', { searchParams: { page: 1, page_size: 5 } })
    const json = await res.json()
    const parsed = TasksWrappedSchema.safeParse(json)
    if (parsed.success) {
      recent = parsed.data.data.tasks.map(t => ({ task_id: t.task_id, progress: t.progress }))
    }
  } catch {
    // ignore fetch errors on overview
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">视频剪辑</h1>
        <p className="text-sm text-muted-foreground">基于素材拼接、分镜与渲染的工作区。</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/edit/video/create" className="group rounded-md border p-4 transition-colors hover:bg-accent hover:text-accent-foreground">
          <div className="mb-2 inline-flex items-center gap-2 text-sm font-medium"><PlusCircle className="h-4 w-4" /> 新建剪辑任务</div>
          <div className="text-xs text-muted-foreground group-hover:text-accent-foreground/80">从主题与参数快速创建任务</div>
        </Link>
        <Link href="/edit/video/tasks" className="group rounded-md border p-4 transition-colors hover:bg-accent hover:text-accent-foreground">
          <div className="mb-2 inline-flex items-center gap-2 text-sm font-medium"><ListChecks className="h-4 w-4" /> 查看剪辑任务</div>
          <div className="text-xs text-muted-foreground group-hover:text-accent-foreground/80">跟踪进度、预览产物与重试</div>
        </Link>
        <Link href="/assets" className="group rounded-md border p-4 transition-colors hover:bg-accent hover:text-accent-foreground">
          <div className="mb-2 inline-flex items-center gap-2 text-sm font-medium"><Library className="h-4 w-4" /> 素材库</div>
          <div className="text-xs text-muted-foreground group-hover:text-accent-foreground/80">上传/管理素材与历史产物</div>
        </Link>
        <Link href="/templates" className="group rounded-md border p-4 transition-colors hover:bg-accent hover:text-accent-foreground">
          <div className="mb-2 inline-flex items-center gap-2 text-sm font-medium"><Shapes className="h-4 w-4" /> 模板中心</div>
          <div className="text-xs text-muted-foreground group-hover:text-accent-foreground/80">应用预设与示例配置</div>
        </Link>
        <Link href="/projects" className="group rounded-md border p-4 transition-colors hover:bg-accent hover:text-accent-foreground">
          <div className="mb-2 inline-flex items-center gap-2 text-sm font-medium"><FolderKanban className="h-4 w-4" /> 项目</div>
          <div className="text-xs text-muted-foreground group-hover:text-accent-foreground/80">管理多任务与版本</div>
        </Link>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">最近任务</h2>
          <Button asChild size="sm" variant="outline"><Link href="/edit/video/tasks">全部任务</Link></Button>
        </div>
        {recent.length === 0 ? (
          <div className="rounded border bg-card p-3 text-sm text-muted-foreground">暂无任务，先去创建一个吧。</div>
        ) : (
          <ul className="divide-y rounded border bg-card text-sm">
            {recent.map((t) => (
              <li key={t.task_id} className="flex items-center justify-between p-3">
                <div className="min-w-0 truncate">任务 #{t.task_id}</div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">进度 {t.progress ?? 0}%</span>
                  <Link href={`/edit/video/tasks/${t.task_id}`} className="text-primary underline">详情</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
