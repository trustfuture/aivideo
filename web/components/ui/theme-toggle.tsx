"use client"
import { useEffect, useState } from 'react'
import { Moon, Sun, Monitor, Rows, StretchHorizontal } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

type Theme = 'light' | 'dark' | 'system'
type Density = 'compact' | 'cozy'
type Radius = 'xs' | 'sm' | 'md'
const KEY = 'theme'
const KEY_DENSITY = 'density'
const KEY_RADIUS = 'radius'

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
  const [density, setDensity] = useState<Density>('compact')
  const [radius, setRadius] = useState<Radius>('sm')

  useEffect(() => {
    try {
      const saved = (localStorage.getItem(KEY) as Theme) || 'system'
      const d = (localStorage.getItem(KEY_DENSITY) as Density) || 'compact'
      const r = (localStorage.getItem(KEY_RADIUS) as Radius) || 'sm'
      setTheme(saved); applyTheme(saved)
      setDensity(d); applyDensity(d)
      setRadius(r); applyRadius(r)
    } catch {}
  }, [])

  function set(t: Theme) {
    setTheme(t)
    try { localStorage.setItem(KEY, t) } catch {}
    applyTheme(t)
  }

  function applyDensity(d: Density) {
    document.documentElement.setAttribute('data-density', d)
  }
  function setD(d: Density) {
    setDensity(d)
    try { localStorage.setItem(KEY_DENSITY, d) } catch {}
    applyDensity(d)
  }

  function applyRadius(r: Radius) {
    const map = { xs: '6px', sm: '8px', md: '10px' } as const
    document.documentElement.style.setProperty('--radius', map[r])
  }
  function setR(r: Radius) {
    setRadius(r)
    try { localStorage.setItem(KEY_RADIUS, r) } catch {}
    applyRadius(r)
  }

  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="切换主题"><Icon className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>主题</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => set('light')}><Sun className="mr-2 h-4 w-4" /> 浅色</DropdownMenuItem>
        <DropdownMenuItem onClick={() => set('dark')}><Moon className="mr-2 h-4 w-4" /> 深色</DropdownMenuItem>
        <DropdownMenuItem onClick={() => set('system')}><Monitor className="mr-2 h-4 w-4" /> 跟随系统</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>密度</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setD('compact')}><Rows className="mr-2 h-4 w-4" /> 紧凑</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setD('cozy')}><Rows className="mr-2 h-4 w-4" /> 舒适</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>圆角</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setR('xs')}><StretchHorizontal className="mr-2 h-4 w-4" /> 小</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setR('sm')}><StretchHorizontal className="mr-2 h-4 w-4" /> 中</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setR('md')}><StretchHorizontal className="mr-2 h-4 w-4" /> 大</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default ThemeToggle
