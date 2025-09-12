"use client"
import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

type ChipsInputProps = {
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  maxChips?: number
  disabled?: boolean
  className?: string
}

export default function ChipsInput({ value, onChange, placeholder, maxChips = 10, disabled, className }: ChipsInputProps) {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (disabled) setText('')
  }, [disabled])

  function addChip(raw: string) {
    const s = (raw || '').trim()
    if (!s) return
    if (value.some(v => v.toLowerCase() === s.toLowerCase())) {
      setText('')
      return
    }
    if (value.length >= maxChips) return
    onChange([...value, s])
    setText('')
  }

  function removeChip(i: number) {
    const next = value.slice()
    next.splice(i, 1)
    onChange(next)
  }

  return (
    <div
      className={cn(
        'min-h-10 w-full rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      onClick={() => inputRef.current?.focus()}
      aria-disabled={disabled}
    >
      <div className="flex flex-wrap items-center gap-1">
        {value.map((chip, i) => (
          <span key={`${chip}-${i}`} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
            {chip}
            <button
              type="button"
              aria-label="remove"
              className="-mr-1 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/60"
              onClick={(e) => { e.stopPropagation(); removeChip(i) }}
              disabled={disabled}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={text}
          disabled={disabled || value.length >= maxChips}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              addChip(text)
            } else if (e.key === 'Backspace' && text === '' && value.length > 0) {
              removeChip(value.length - 1)
            }
          }}
          onBlur={() => addChip(text)}
          placeholder={value.length === 0 ? (placeholder || '添加关键词，回车确认') : ''}
          className="flex-1 min-w-[8rem] bg-transparent p-1 outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">最多 {maxChips} 个，使用回车或逗号添加</div>
    </div>
  )
}

