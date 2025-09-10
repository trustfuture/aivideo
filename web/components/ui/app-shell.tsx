"use client"
import { ReactNode, useState, useEffect } from 'react'
import TopNav from '@/components/topbar/top-nav'
import { Sidebar } from '@/components/ui/sidebar'
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
    <div className="flex min-h-screen bg-background text-foreground app-gradient">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(v => !v)} />
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <TopNav onOpenCommand={() => setOpenCmd(true)} />
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
