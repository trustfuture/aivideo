"use client"
import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { Search } from 'lucide-react'

interface CommandMenuProps {
  open: boolean
  onOpenChange: (v: boolean) => void
}

const commands = [
  { label: '首页', href: '/' },
  { label: '查看任务', href: '/tasks' },
  { label: '新建任务', href: '/create' },
  { label: '设置', href: '/settings' }
]

export function CommandMenu({ open, onOpenChange }: CommandMenuProps) {
  const [q, setQ] = useState('')
  const pathname = usePathname()

  useEffect(() => {
    if (!open) setQ('')
  }, [open])

  const results = useMemo(() => {
    if (!q.trim()) return commands
    const s = q.trim().toLowerCase()
    return commands.filter(c => c.label.toLowerCase().includes(s))
  }, [q])

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
          {results.map(c => (
            <Link
              key={c.href}
              href={c.href}
              onClick={() => onOpenChange(false)}
              className={cn(
                'block rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground',
                pathname === c.href ? 'bg-accent text-accent-foreground' : 'text-foreground'
              )}
            >
              {c.label}
            </Link>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default CommandMenu

