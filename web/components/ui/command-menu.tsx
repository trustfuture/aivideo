"use client"
import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { Search } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { get } from '@/lib/api'
import { TasksWrappedSchema } from '@/lib/schemas'
import { toast } from 'sonner'
import { useI18n } from '@/components/providers/i18n-provider'

interface CommandMenuProps {
  open: boolean
  onOpenChange: (v: boolean) => void
}

type CommandItem =
  | { type: 'link'; label: string; href: string }
  | { type: 'action'; label: string; run: () => void }

export function CommandMenu({ open, onOpenChange }: CommandMenuProps) {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const pathname = usePathname()

  useEffect(() => {
    if (!open) setQ('')
  }, [open])

  const { data: recent, isLoading } = useQuery({
    queryKey: ['command-menu', 'recent-tasks'],
    queryFn: async () => {
      try {
        const res = await get('/v1/tasks', { searchParams: { page: 1, page_size: 5 } })
        const json = await res.json()
        const parsed = TasksWrappedSchema.safeParse(json)
        if (!parsed.success) return [] as CommandItem[]
        return parsed.data.data.tasks.map(t => ({
          type: 'link',
          label: `任务 #${t.task_id} · 进度 ${t.progress ?? 0}%`,
          href: `/edit/video/tasks/${t.task_id}`
        })) as CommandItem[]
      } catch {
        return [] as CommandItem[]
      }
    },
    refetchOnWindowFocus: false,
    staleTime: 10_000
  })

  const allCommands = useMemo(() => {
    const statics: CommandItem[] = [
      { type: 'link', label: '首页', href: '/' },
      { type: 'link', label: '视频剪辑主页', href: '/edit/video' },
      { type: 'link', label: '新建剪辑任务', href: '/edit/video/create' },
      { type: 'link', label: t('actions.applyTemplate') || '从模板应用', href: '/edit/video/create?applyTemplate=1' },
      { type: 'link', label: '查看剪辑任务', href: '/edit/video/tasks' },
      { type: 'link', label: '素材库', href: '/assets' },
      { type: 'link', label: t('cmd.templates') || '模板中心', href: '/templates' },
      { type: 'action', label: t('actions.saveTemplate') || '保存为模板', run: () => toast.info(t('dialog.comingSoon.desc.saveTemplate') || '模板功能即将上线') },
      { type: 'action', label: t('actions.duplicateTask') || '复刻为新任务', run: () => toast.info(t('dialog.comingSoon.desc.duplicate') || '复刻功能即将上线') },
      { type: 'link', label: '项目', href: '/projects' },
      { type: 'link', label: '设置', href: '/settings' }
    ]
    return [...statics, ...(recent || [])]
  }, [recent, t])

  const results = useMemo(() => {
    if (!q.trim()) return allCommands
    const s = q.trim().toLowerCase()
    return allCommands.filter(c => c.label.toLowerCase().includes(s))
  }, [q, allCommands])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 overflow-hidden border-none bg-background shadow-xl">
        <div className="flex items-center gap-2 border-b p-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索命令或页面…"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="h-9 border-none shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-[50vh] overflow-auto p-2">
          {results.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">无匹配结果</div>
          )}
          {results.map((c, idx) => (
            c.type === 'link' ? (
              <Link
                key={(c as any).href}
                href={(c as any).href}
                onClick={() => onOpenChange(false)}
                className={cn(
                  'block rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground',
                  pathname === (c as any).href ? 'bg-accent text-accent-foreground' : 'text-foreground'
                )}
              >
                {c.label}
              </Link>
            ) : (
              <button
                key={`action-${idx}`}
                type="button"
                onClick={() => { (c as any).run(); onOpenChange(false) }}
                className={cn('w-full text-left rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground')}
              >
                {c.label}
              </button>
            )
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default CommandMenu
