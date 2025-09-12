"use client"
import { useEffect, useMemo, useState, useTransition } from 'react'
import { SegmentItem } from '@/lib/schemas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { post } from '@/lib/api'
import { useUiStore } from '@/lib/store/ui'

type ShotRow = {
  scene_title?: string | null
  shot_no?: string | null
  shot_desc?: string | null
  style?: string | null
  duration?: number | null
}

export default function ShotlistEditor({ taskId, segments, onApplied }: { taskId: string; segments: SegmentItem[]; onApplied?: (next: SegmentItem[]) => void }) {
  const [rows, setRows] = useState<ShotRow[]>([])
  const [isPending, startTransition] = useTransition()
  const setBusy = useUiStore(s => s.setBusy)

  useEffect(() => {
    // initialize from incoming segments when they change
    setRows(segments.map(s => ({
      scene_title: s.scene_title || '',
      shot_no: s.shot_no || '',
      shot_desc: s.shot_desc || '',
      style: s.style || '',
      duration: (typeof s.duration === 'number' ? s.duration : null) as any
    })))
  }, [segments])

  const invalidIndexes = useMemo(() => {
    const bad: number[] = []
    rows.forEach((r, i) => {
      if (r.duration != null) {
        const d = Number(r.duration)
        if (!isFinite(d) || d <= 0) bad.push(i)
      }
    })
    return bad
  }, [rows])

  function update(i: number, key: keyof ShotRow, value: any) {
    setRows(prev => {
      const next = [...prev]
      // cast number for duration
      // @ts-expect-error index
      next[i][key] = key === 'duration' ? (value === '' ? null : Number(value)) : value
      return next
    })
  }

  function fromSegments() {
    setRows(segments.map(s => ({
      scene_title: s.scene_title || '',
      shot_no: s.shot_no || '',
      shot_desc: s.shot_desc || '',
      style: s.style || '',
      duration: (typeof s.duration === 'number' ? s.duration : null) as any
    })))
    toast.success('已从分镜生成 Shotlist')
  }

  async function applyToSegments() {
    if (rows.length !== segments.length) {
      toast.error('Shotlist 行数需与分镜数量一致')
      return
    }
    if (invalidIndexes.length > 0) {
      toast.error('存在无效时长，请修正后再应用')
      return
    }
    const nextSegments: SegmentItem[] = segments.map((s, i) => ({
      ...s,
      scene_title: rows[i].scene_title || null,
      shot_no: rows[i].shot_no || null,
      shot_desc: rows[i].shot_desc || null,
      style: rows[i].style || null,
      duration: rows[i].duration != null ? Number(rows[i].duration) : s.duration
    }))
    try {
      setBusy(true)
      const res = await post('/v1/segments/save', { task_id: taskId, segments: nextSegments })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message || '保存失败')
      toast.success('已应用到分镜并保存')
      onApplied && onApplied(nextSegments)
    } catch (e: any) {
      toast.error(e?.message || '应用失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Shotlist 编辑</h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fromSegments} disabled={isPending}>从分镜生成</Button>
          <Button size="sm" onClick={() => startTransition(applyToSegments)} disabled={isPending}>应用到分镜</Button>
        </div>
      </div>
      <div className="rounded border bg-card">
        <div className="grid grid-cols-[3rem,1.2fr,7rem,1.5fr,7rem,6rem] items-center gap-1.5 border-b p-1.5 text-xs text-muted-foreground">
          <div>#</div>
          <div>场景标题</div>
          <div>镜头序号</div>
          <div>镜头描述</div>
          <div>风格</div>
          <div>时长(秒)</div>
        </div>
        <ul>
          {rows.map((r, i) => (
            <li key={i} className="grid grid-cols-[3rem,1.2fr,7rem,1.5fr,7rem,6rem] items-center gap-1.5 border-b p-1.5 text-sm">
              <div className="text-muted-foreground">#{i + 1}</div>
              <Input value={r.scene_title || ''} onChange={(e) => update(i, 'scene_title', e.target.value)} placeholder="场景标题" />
              <Input value={r.shot_no || ''} onChange={(e) => update(i, 'shot_no', e.target.value)} placeholder="如 1A" />
              <Input value={r.shot_desc || ''} onChange={(e) => update(i, 'shot_desc', e.target.value)} placeholder="镜头描述" />
              <Input value={r.style || ''} onChange={(e) => update(i, 'style', e.target.value)} placeholder="风格" />
              <Input
                type="number"
                min={0.1}
                step={0.1}
                value={r.duration == null ? '' : String(r.duration)}
                onChange={(e) => update(i, 'duration', e.target.value)}
                className={invalidIndexes.includes(i) ? 'border-red-500 focus-visible:ring-red-500' : ''}
                placeholder="秒"
              />
            </li>
          ))}
        </ul>
        {rows.length === 0 && (
          <div className="p-3 text-sm text-muted-foreground">暂无 Shotlist，可点击“从分镜生成”初始化。</div>
        )}
      </div>
      <div className="text-xs text-muted-foreground">当前行数：{rows.length} · 分镜数量：{segments.length}</div>
    </div>
  )
}
