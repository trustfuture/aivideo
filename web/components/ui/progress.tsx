"use client"
import * as React from 'react'
import { cn } from '@/lib/utils'

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
}

/**
 * Minimal progress bar to surface long-running task state.
 * Accepts 0–100 value; clamps automatically.
 */
export function Progress({ value = 0, className, ...props }: ProgressProps) {
  const v = Math.max(0, Math.min(100, Number(value) || 0))
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      className={cn('relative h-2 w-48 overflow-hidden rounded bg-muted', className)}
      {...props}
    >
      <div
        className="h-full bg-primary transition-[width] duration-300"
        style={{ width: `${v}%` }}
      />
    </div>
  )
}

export default Progress
