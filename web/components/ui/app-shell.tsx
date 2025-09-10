"use client"
import { ReactNode, useState, useEffect } from 'react'
import { Menu, Command, Search, PanelLeftClose, PanelLeft } from 'lucide-react'
import TopNav from '@/components/topbar/top-nav'
import { Sidebar } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { CommandMenu } from '@/components/ui/command-menu'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [openCmd, setOpenCmd] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpenCmd(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(v => !v)} />
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto flex w-full max-w-7xl items-center gap-2 p-3">
            <Button variant="ghost" size="icon" aria-label="Toggle sidebar" onClick={() => setSidebarCollapsed(v => !v)}>
              {sidebarCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
            <div className="flex-1" />
            <Button variant="outline" size="sm" className="hidden sm:inline-flex" onClick={() => setOpenCmd(true)}>
              <Search className="mr-2 h-4 w-4" />
              搜索 / 命令
              <kbd className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">⌘K</kbd>
            </Button>
          </div>
          <TopNav />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4">
          {children}
        </main>
      </div>
      <CommandMenu open={openCmd} onOpenChange={setOpenCmd} />
    </div>
  )
}

export default AppShell

