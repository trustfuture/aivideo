"use client"
import { useEffect, useState } from 'react'
import { Moon, Sun, Monitor } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

type Theme = 'light' | 'dark' | 'system'
const KEY = 'theme'

function applyTheme(theme: Theme) {
  const root = document.documentElement
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const isDark = theme === 'dark' || (theme === 'system' && systemDark)
  root.classList.toggle('dark', isDark)
  // keep data-theme for compatibility with any [data-theme="dark"] selectors
  root.setAttribute('data-theme', isDark ? 'dark' : 'light')
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system')

  useEffect(() => {
    try {
      const saved = (localStorage.getItem(KEY) as Theme) || 'system'
      setTheme(saved)
      applyTheme(saved)
    } catch {}
  }, [])

  function set(t: Theme) {
    setTheme(t)
    try { localStorage.setItem(KEY, t) } catch {}
    applyTheme(t)
  }

  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="切换主题"><Icon className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => set('light')}><Sun className="mr-2 h-4 w-4" /> 浅色</DropdownMenuItem>
        <DropdownMenuItem onClick={() => set('dark')}><Moon className="mr-2 h-4 w-4" /> 深色</DropdownMenuItem>
        <DropdownMenuItem onClick={() => set('system')}><Monitor className="mr-2 h-4 w-4" /> 跟随系统</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default ThemeToggle
