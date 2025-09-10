"use client"
import { useUiStore } from '@/lib/store/ui'

export function BusyIndicator() {
  const busy = useUiStore(s => s.busy)
  if (!busy) return null
  return (
    <div className="ml-4 inline-flex items-center gap-2 rounded border bg-amber-50 px-2 py-1 text-xs text-amber-700">
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-600" />
      处理中…
    </div>
  )
}

export default BusyIndicator

