"use client"
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Home,
  ListChecks,
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Image as ImageIcon,
  Video,
  Scissors,
  Wand2,
  Library,
  Shapes,
  FlaskConical,
  CreditCard
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { NAV_GROUPS } from '@/lib/nav'
import { BRAND_NAME } from '@/lib/brand'

interface SidebarProps {
  collapsed?: boolean
  onToggle?: () => void // 与 AppShell 保持兼容
}

const ICONS = {
  Home,
  ListChecks,
  Settings: SettingsIcon,
  FolderKanban,
  Image: ImageIcon,
  Video,
  Scissors,
  Wand2,
  Library,
  Shapes,
  FlaskConical,
  CreditCard
} as const

export function Sidebar({ collapsed = false, onToggle }: SidebarProps) {
  const pathname = usePathname()
  return (
    <aside
      className={cn(
        'sticky top-0 z-40 hidden h-screen shrink-0 border-r bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:block',
        collapsed ? 'w-[64px]' : 'w-[220px]'
      )}
    >
      <div className="flex h-12 items-center justify-between px-2">
        <Link href="/" className={cn('flex items-center gap-2 rounded-md px-2 py-1.5', collapsed && 'mx-auto')}
          aria-label={BRAND_NAME}
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-primary to-indigo-400 text-xs font-semibold text-white">
            {BRAND_NAME?.[0]?.toUpperCase() || 'A'}
          </span>
          {!collapsed && (
            <span className="truncate text-sm font-semibold tracking-tight">{BRAND_NAME}</span>
          )}
        </Link>
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
      <nav className={cn('mt-2 grid gap-2 p-2', collapsed && 'gap-1')}
        aria-label="主导航"
      >
        <TooltipProvider delayDuration={300}>
          {NAV_GROUPS.map(group => (
            <div key={group.title} className="space-y-1">
              {!collapsed && (
                <div className="px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                  {group.title}
                </div>
              )}
              <div className="grid gap-1">
                {group.items.map(item => {
                  const Icon = ICONS[item.icon as keyof typeof ICONS]
                  const active = pathname === item.href
                  const content = (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'group inline-flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                        active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
                      )}
                      aria-current={active ? 'page' : undefined}
                    >
                      {Icon ? <Icon className="h-4 w-4" /> : <span className="h-4 w-4" />}
                      {!collapsed && (
                        <span className="truncate">
                          {item.label}
                          {item.badge && (
                            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{item.badge}</span>
                          )}
                          {item.comingSoon && (
                            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Soon</span>
                          )}
                        </span>
                      )}
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
              </div>
            </div>
          ))}
        </TooltipProvider>
      </nav>
    </aside>
  )
}

export default Sidebar
