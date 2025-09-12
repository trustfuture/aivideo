import { ReactNode } from 'react'
import AppShell from '@/components/ui/app-shell'

export default function StudioLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>
}

