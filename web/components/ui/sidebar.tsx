"use client"
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Home, ListChecks, PlusCircle, Settings, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface SidebarProps {
  collapsed?: boolean
  onToggle?: () => void // retained for API compatibility; no local button
}

const NAV = [
  { href: '/', label: '首页', icon: Home },
  { href: '/tasks', label: '任务', icon: ListChecks },
  { href: '/create', label: '新建', icon: PlusCircle },
  { href: '/settings', label: '设置', icon: Settings }
]

export function Sidebar({ collapsed = false, onToggle }: SidebarProps) {
  const pathname = usePathname()
  return (
    <aside
      className={cn(
        'sticky top-0 z-40 hidden h-screen shrink-0 border-r bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:block',
        collapsed ? 'w-[64px]' : 'w-[220px]'
      )}
    >
      <div className="flex h-12 items-center justify-end px-2">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'} onClick={onToggle}>
                {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{collapsed ? '展开' : '收起'}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <nav className="mt-2 grid gap-1 p-2">
        <TooltipProvider delayDuration={300}>
          {NAV.map(item => {
            const Icon = item.icon
            const active = pathname === item.href
            const content = (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group inline-flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                  active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            )
            return collapsed ? (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{content}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ) : (
              content
            )
          })}
        </TooltipProvider>
      </nav>
    </aside>
  )
}

export default Sidebar
