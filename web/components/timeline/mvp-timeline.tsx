"use client"
import { useMemo, useRef, useState, useTransition } from 'react'
import type React from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { LoadingSpinner } from '@/components/ui/loading'
import { toast } from 'sonner'
import { post, API_BASE } from '@/lib/api'
import MaterialPicker from '@/components/material/material-picker'
import { useEffect } from 'react'
import { SegmentItem, SegmentsRenderWrappedSchema, VideoParams, VideoParamsSchema } from '@/lib/schemas'
import { useUiStore } from '@/lib/store/ui'
import { useQueryClient } from '@tanstack/react-query'

type Props = {
  taskId: string
  initialSegments: SegmentItem[]
  audioDuration?: number
  disabledExternally?: boolean
  // base task params from creation time (should include video_subject, etc.)
  baseParams?: VideoParams
  // controlled selection from parent (optional)
  selectedIds?: string[]
  onSelectedIdsChange?: (ids: string[]) => void
  // notify parent when segments change (for single source of truth in SequenceEditor)
  onSegmentsChange?: (next: SegmentItem[]) => void
  // external render params to override internal subtitle/bgm settings
  externalRenderParams?: Partial<VideoParams>
  // hide internal UI sections when parent takes over
  hideTopActions?: boolean
  hideGlobalPanel?: boolean
  // hide the small preview-only tip (useful when parent already explains)
  hidePreviewTip?: boolean
  // compact mode: hide bulk editor and per-segment cards beneath the timeline
  compact?: boolean
  // expose render controls to parent
  onRegisterControls?: (ctrl: {
    preview: (count: number) => void
    previewSegment: (id: string) => void
    renderFull: () => void
    cancel: () => void
    openLastPreview: () => void
    retryLastFailed: () => void
    getState: () => { renderMode: 'preview'|'full'|null, canRender: boolean, hasErrors: boolean, queue: number, lastPreviewUrl: string | null, disabledExternally: boolean }
    getPreviewCount: () => number
    setPreviewCount: (n: number) => void
  }) => void
}

function normalizeOrders(list: SegmentItem[]) {
  return list.map((s, idx) => ({ ...s, order: idx + 1 }))
}

export default function MvpTimeline({ taskId, initialSegments, audioDuration = 0, disabledExternally = false, baseParams, selectedIds, onSelectedIdsChange, externalRenderParams, hideTopActions, hideGlobalPanel, hidePreviewTip, compact, onRegisterControls, onSegmentsChange }: Props) {
  const [segments, setSegments] = useState(() => normalizeOrders(initialSegments))
  const [isPending, startTransition] = useTransition()
  const canRender = segments && segments.length > 0
  const [previewCount, setPreviewCount] = useState(3)
  // timeline scale: pixels per second
  const [pxPerSec, setPxPerSec] = useState<number>(60)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const controlledSelection = Array.isArray(selectedIds) && typeof onSelectedIdsChange === 'function'
  const selectedSet = useMemo(() => controlledSelection ? new Set(selectedIds) : selected, [controlledSelection, selectedIds, selected])
  const setSelection = (next: Set<string>) => {
    if (controlledSelection) onSelectedIdsChange!(Array.from(next))
    else setSelected(next)
  }
  const [anchorId, setAnchorId] = useState<string | null>(null)
  const [deleted, setDeleted] = useState<SegmentItem[]>([])
  const [saving, setSaving] = useState(false)
  const [renderMode, setRenderMode] = useState<null | 'preview' | 'full'>(null)
  const [pickerIndex, setPickerIndex] = useState<number | null>(null)
  const [pickerMode, setPickerMode] = useState<null | 'replace' | 'requery'>(null)
  // render params (P1: 字幕与音频体验)
  const [subtitleEnabled, setSubtitleEnabled] = useState(true)
  const [subtitlePosition, setSubtitlePosition] = useState<'bottom' | 'top' | 'center' | 'custom'>('bottom')
  const [subtitleCustomPos, setSubtitleCustomPos] = useState<number>(70) // percentage, 0-100
  const [subtitleOffset, setSubtitleOffset] = useState<number>(0)
  const [fontSize, setFontSize] = useState<number>(60)
  const [strokeWidth, setStrokeWidth] = useState<number>(1.5 as any)
  const [textColor, setTextColor] = useState<string>('#FFFFFF')
  const [strokeColor, setStrokeColor] = useState<string>('#000000')
  const [textBgEnabled, setTextBgEnabled] = useState<boolean>(true)
  const [textBgColor, setTextBgColor] = useState<string>('#000000') // used when bg enabled as color
  // font selection
  const [fontName, setFontName] = useState<string>('')
  const [fontOptions, setFontOptions] = useState<string[]>([])
  const [loadingFonts, setLoadingFonts] = useState<boolean>(false)
  // audio/bgm controls
  const [bgmVolume, setBgmVolume] = useState<number>(0.2)
  const [bgmFadeInSec, setBgmFadeInSec] = useState<number>(0)
  const [bgmFadeOutSec, setBgmFadeOutSec] = useState<number>(3)
  const [bgmDucking, setBgmDucking] = useState<boolean>(false)
  // preview caching / simple queue
  const [queue, setQueue] = useState<{ key: string; mode: 'preview' | 'full' | 'single'; segs: SegmentItem[] }[]>([])
  const previewCache = useRef<Map<string, string>>(new Map())
  const lastPreviewUrlRef = useRef<string | null>(null)
  const [lastFailed, setLastFailed] = useState<{ segs: SegmentItem[]; mode: 'preview' | 'full' | 'single'; sig: string } | null>(null)
  const renderAbortRef = useRef<AbortController | null>(null)
  const setBusy = useUiStore(s => s.setBusy)
  const queryClient = useQueryClient()
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    })
  )

  const signature = useMemo(() => JSON.stringify(normalizeOrders(segments).map(s => ({
    id: s.segment_id,
    order: s.order,
    duration: s.duration,
    transition: s.transition,
    transition_duration: (s as any).transition_duration,
    transition_direction: (s as any).transition_direction,
    speed: s.speed,
    fit: s.fit
  }))), [segments])
  const initialSignature = useMemo(() => JSON.stringify(normalizeOrders(initialSegments).map(s => ({
    id: s.segment_id, order: s.order, duration: s.duration, transition: s.transition, speed: s.speed
  }))), [initialSegments])
  const dirty = signature !== initialSignature

  const totalDuration = useMemo(() => segments.reduce((acc, s) => acc + Number(s.duration || 0), 0), [segments])
  const hasErrors = useMemo(() => {
    const segErrors = segments.some(s => {
      const d = Number(s.duration)
      const st = Number(s.start)
      const ed = Number(s.end)
      const invalidDuration = !isFinite(d) || d <= 0
      const invalidSpeed = s.speed != null && (Number(s.speed) < 0.75 || Number(s.speed) > 1.25)
      const td = (s as any).transition_duration == null ? null : Number((s as any).transition_duration)
      const invalidTd = td != null && (!isFinite(td) || td < 0.2 || td > 2)
      const hasStartEnd = s.start != null && s.end != null
      const invalidStartEnd = hasStartEnd && (!isFinite(st) || st < 0 || !isFinite(ed) || ed <= st)
      const inconsistent = hasStartEnd && isFinite(d) && Math.abs(d - (ed - st)) > 0.051
      return invalidDuration || invalidSpeed || invalidTd || invalidStartEnd || inconsistent
    })
    const audioInvalid = audioDuration > 0 && totalDuration - audioDuration > 0.05
    return segErrors || audioInvalid
  }, [segments, audioDuration, totalDuration])

  // compute render params object to send
  const renderParams = useMemo(() => {
    const bgColor: any = textBgEnabled ? (textBgColor || true) : false
    return {
      subtitle_enabled: subtitleEnabled,
      subtitle_position: subtitlePosition,
      custom_position: subtitleCustomPos,
      font_name: fontName || undefined,
      font_size: Number(fontSize) || 60,
      stroke_width: Number(strokeWidth) || 1,
      text_fore_color: textColor,
      stroke_color: strokeColor,
      text_background_color: bgColor,
      subtitle_offset: Number(subtitleOffset) || 0,
      bgm_volume: Number(bgmVolume) || 0,
      bgm_fade_in_sec: Number(bgmFadeInSec) || 0,
      bgm_fade_out_sec: Number(bgmFadeOutSec) || 0,
      bgm_ducking: !!bgmDucking,
    }
  }, [subtitleEnabled, subtitlePosition, subtitleCustomPos, fontName, fontSize, strokeWidth, textColor, strokeColor, textBgEnabled, textBgColor, subtitleOffset, bgmVolume, bgmFadeInSec, bgmFadeOutSec, bgmDucking])

  // merge base params with local overrides; only send when we have a valid base (contains video_subject)
  const mergedParams = useMemo(() => {
    const subject = (baseParams || {})?.video_subject
    if (typeof subject === 'string') {
      return { ...baseParams, ...(externalRenderParams || renderParams) }
    }
    return undefined
  }, [baseParams, renderParams, externalRenderParams])

  useEffect(() => {
    let canceled = false
    async function loadFonts() {
      try {
        setLoadingFonts(true)
        const res = await get('/v1/fonts')
        const json = await res.json()
        const list = (json?.data?.files as string[]) || []
        if (!canceled) setFontOptions(list)
      } catch {
        if (!canceled) setFontOptions([])
      } finally {
        if (!canceled) setLoadingFonts(false)
      }
    }
    loadFonts()
    return () => { canceled = true }
  }, [])

  useEffect(() => {
    let canceled = false
    async function loadDefaultFont() {
      try {
        const res = await get('/v1/config')
        const json = await res.json()
        const name = json?.data?.ui?.font_name
        if (!canceled && name && !fontName) setFontName(String(name))
      } catch {
        // ignore
      }
    }
    loadDefaultFont()
    return () => { canceled = true }
  }, [])

  function move(index: number, dir: -1 | 1) {
    const next = [...segments]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    const tmp = next[index]
    next[index] = next[target]
    next[target] = tmp
    const norm = normalizeOrders(next)
    setSegments(norm)
    try { onSegmentsChange && onSegmentsChange(norm) } catch {}
  }

  function onDragEnd(event: DragEndEvent) {
    if (renderMode !== null || disabledExternally) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = segments.findIndex(s => s.segment_id === active.id)
    const newIndex = segments.findIndex(s => s.segment_id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const moved = arrayMove(segments, oldIndex, newIndex)
    const norm = normalizeOrders(moved)
    setSegments(norm)
    try { onSegmentsChange && onSegmentsChange(norm) } catch {}
  }

  function updateField(index: number, key: keyof SegmentItem, value: any) {
    const next = [...segments]
    // special case: transition '' => null
    const v = key === 'transition' && value === '' ? null : value
    // duration/start/end should be numbers
    const numericKeys: (keyof SegmentItem)[] = ['duration', 'start', 'end', 'speed', 'transition_duration']
    const casted = numericKeys.includes(key) ? Number(v) : v
    // @ts-expect-error index assignment
    next[index][key] = casted
    setSegments(next)
    try { onSegmentsChange && onSegmentsChange(next) } catch {}
  }

  function updateStart(index: number, value: any) {
    const next = [...segments]
    const minDur = 0.1
    const start = Math.max(0, Number(value) || 0)
    const end = Number(next[index].end ?? 0)
    const safeStart = isFinite(end) ? Math.min(start, end - minDur) : start
    next[index].start = safeStart
    const dur = isFinite(end) ? Math.max(minDur, end - safeStart) : Number(next[index].duration) || minDur
    next[index].duration = dur
    setSegments(next)
    try { onSegmentsChange && onSegmentsChange(next) } catch {}
  }

  function updateEnd(index: number, value: any) {
    const next = [...segments]
    const minDur = 0.1
    const end = Number(value) || 0
    const start = Number(next[index].start ?? 0)
    const safeEnd = Math.max(end, start + minDur)
    next[index].end = safeEnd
    next[index].duration = Math.max(minDur, safeEnd - start)
    setSegments(next)
    try { onSegmentsChange && onSegmentsChange(next) } catch {}
  }

  function updateDuration(index: number, value: any) {
    const next = [...segments]
    const minDur = 0.1
    const dur = Math.max(minDur, Number(value) || 0)
    const start = Number(next[index].start ?? 0)
    next[index].duration = dur
    next[index].end = start + dur
    setSegments(next)
    try { onSegmentsChange && onSegmentsChange(next) } catch {}
  }

  function toggleSelect(id: string, checked: boolean) {
    const next = new Set(selectedSet)
    if (checked) next.add(id)
    else next.delete(id)
    setSelection(next)
    setAnchorId(id)
  }

  function selectAll(checked: boolean) {
    if (!checked) return setSelection(new Set())
    setSelection(new Set(segments.map(s => s.segment_id)))
  }

  function deleteSelected() {
    if (selectedSet.size === 0) return
    const keep: SegmentItem[] = []
    const removed: SegmentItem[] = []
    for (const s of segments) {
      if (selectedSet.has(s.segment_id)) removed.push(s)
      else keep.push(s)
    }
    setDeleted(prev => [...prev, ...removed])
    const norm = normalizeOrders(keep)
    setSegments(norm)
    try { onSegmentsChange && onSegmentsChange(norm) } catch {}
    setSelection(new Set())
    toast.success(`已删除 ${removed.length} 段，可点击“恢复一段”撤销`)
  }

  function restoreOne() {
    if (deleted.length === 0) return
    const copy = [...deleted]
    const seg = copy.pop()!
    setDeleted(copy)
    const norm = normalizeOrders([...segments, seg])
    setSegments(norm)
    try { onSegmentsChange && onSegmentsChange(norm) } catch {}
    toast.success('已恢复 1 段到列表末尾')
  }

  function applyBulk(patch: Partial<Pick<SegmentItem, 'duration' | 'speed' | 'transition'>>) {
    if (selectedSet.size === 0) return
    const next = segments.map(s => selectedSet.has(s.segment_id) ? { ...s, ...patch } : s)
    setSegments(next)
    try { onSegmentsChange && onSegmentsChange(next) } catch {}
  }

  function buildSignature(segs: SegmentItem[]) {
    // keep signature lightweight: only critical fields
    const key = JSON.stringify(normalizeOrders(segs).map(s => ({
      id: s.segment_id, d: s.duration, st: s.start, ed: s.end, tr: s.transition, sp: s.speed, fit: s.fit, mat: s.material
    }))) + '::' + JSON.stringify(renderParams)
    return key
  }

  async function render(subset?: number) {
    const list = subset ? normalizeOrders(segments.slice(0, Math.max(1, Math.min(subset, segments.length)))) : normalizeOrders(segments)
    return renderWithSegments(list, subset ? 'preview' : 'full')
  }

  async function runNextInQueue() {
    if (renderMode !== null) return
    setQueue((q) => {
      if (q.length === 0) return q
      const [job, ...rest] = q
      _renderInternal(job.segs, job.mode, buildSignature(job.segs))
      return rest
    })
  }

  async function _renderInternal(segList: SegmentItem[], mode: 'preview' | 'full' | 'single', sigKey: string) {
    setRenderMode(mode === 'single' ? 'preview' : mode)
    setBusy(true)
    const controller = new AbortController()
    renderAbortRef.current = controller
    // validate params if present; on failure, surface error and fall back to omit params
    let paramsToSend: VideoParams | undefined
    if (mergedParams) {
      const parsed = VideoParamsSchema.safeParse(mergedParams)
      if (parsed.success) {
        paramsToSend = parsed.data
      } else {
        const msgs = parsed.error.issues.slice(0, 5).map(i => `${i.path.join('.')}: ${i.message}`)
        toast.error(`渲染参数无效，已使用默认参数：\n${msgs.join('\n')}`)
      }
    }
    const body: any = {
      task_id: taskId,
      segments: segList,
      ...(paramsToSend ? { params: paramsToSend } : {})
    }
    if (mode !== 'full') body.preview = true
    try {
      const res = await post('/v1/segments/render', body, { signal: controller.signal })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message || '渲染失败')
      const parsed = SegmentsRenderWrappedSchema.safeParse(json)
      if (!parsed.success) throw new Error('响应解析失败')
      const { combined_video, final_video } = parsed.data.data
      // 更新任务与任务列表缓存，让进度更快显现
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      if (mode !== 'full' && combined_video) {
        previewCache.current.set(sigKey, combined_video)
        lastPreviewUrlRef.current = combined_video
        toast.success('预览就绪，正在打开…')
        window.open(combined_video, '_blank')
      } else if (final_video) {
        toast.success('成片完成，正在打开…')
        window.open(final_video, '_blank')
      } else {
        toast.success('渲染完成，返回了空链接')
      }
      setLastFailed(null)
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        toast.info('已取消渲染请求')
      } else {
        toast.error(e?.message || '渲染失败')
      }
      // record last failed job for retry
      setLastFailed({ segs: segList, mode, sig: sigKey })
    } finally {
      setRenderMode(null)
      renderAbortRef.current = null
      setBusy(false)
      // run next if queued
      setTimeout(runNextInQueue, 0)
    }
  }

  async function renderWithSegments(segList: SegmentItem[], mode: 'preview' | 'full' | 'single') {
    if (!canRender) return
    const sig = buildSignature(segList)
    if (mode !== 'full') {
      const cached = previewCache.current.get(sig)
      if (cached) {
        toast.info('已命中预览缓存，直接打开')
        window.open(cached, '_blank')
        return
      }
    }
    if (renderMode !== null) {
      // enqueue
      setQueue(q => [...q, { key: sig, mode, segs: segList }])
      toast.info('已加入渲染队列')
      return
    }
    await _renderInternal(segList, mode, sig)
  }

  // Expose controls to parent when requested
  useEffect(() => {
    if (!onRegisterControls) return
    const ctrl = {
      preview: (count: number) => startTransition(() => render(Math.max(1, Math.floor(count || 1)))),
      previewSegment: (id: string) => {
        const idx = segments.findIndex(x => x.segment_id === id)
        if (idx >= 0) previewOne(idx)
      },
      renderFull: () => startTransition(() => render()),
      cancel: () => { try { renderAbortRef.current?.abort() } catch {} },
      openLastPreview: () => { if (lastPreviewUrlRef.current) window.open(lastPreviewUrlRef.current, '_blank') },
      retryLastFailed: () => { if (lastFailed) _renderInternal(lastFailed.segs, lastFailed.mode, lastFailed.sig) },
      getState: () => ({ renderMode, canRender, hasErrors, queue: queue.length, lastPreviewUrl: lastPreviewUrlRef.current, disabledExternally }),
      getPreviewCount: () => previewCount,
      setPreviewCount: (n: number) => setPreviewCount(Math.max(1, Math.min(Math.floor(n || 1), segments.length || 1))),
    }
    onRegisterControls(ctrl)
  }, [onRegisterControls, renderMode, canRender, hasErrors, queue, disabledExternally, previewCount, segments.length])

  async function previewOne(index: number) {
    const s = segments[index]
    if (!s) return
    const seg: SegmentItem = {
      ...s,
      order: 1
    }
    await renderWithSegments([seg], 'single')
  }

  async function save() {
    try {
      setBusy(true)
      setSaving(true)
      const body = { task_id: taskId, segments: normalizeOrders(segments) }
      const res = await post('/v1/segments/save', body)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message || '保存失败')
      toast.success('分镜已保存')
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    } catch (e: any) {
      toast.error(e?.message || '保存失败')
    } finally {
      setSaving(false)
      setBusy(false)
    }
  }

  const INHERIT = '__inherit__'
  const transitionOptions = useMemo(() => [
    { label: '继承/无', value: INHERIT },
    { label: 'Shuffle', value: 'Shuffle' },
    { label: 'FadeIn', value: 'FadeIn' },
    { label: 'FadeOut', value: 'FadeOut' },
    { label: 'SlideIn', value: 'SlideIn' },
    { label: 'SlideOut', value: 'SlideOut' },
    { label: '遮罩（Mask）', value: 'Mask' },
  ], [])
  const directionOptions = useMemo(() => [
    { label: '左', value: 'left' },
    { label: '右', value: 'right' },
    { label: '上', value: 'top' },
    { label: '下', value: 'bottom' },
  ], [])
  const fitOptions = useMemo(() => [
    { label: '自适应留边（contain）', value: 'contain' },
    { label: '裁剪铺满（cover）', value: 'cover' },
    { label: '居中（center）', value: 'center' },
  ], [])

  // prewarm: ensure thumbs are generated server-side, then images can load via static path
  useEffect(() => {
    fetch(`${API_BASE}/v1/tasks/${taskId}/segments/thumbs`).catch(() => {})
  }, [taskId])

  // load & persist timeline scale locally
  useEffect(() => {
    try {
      const saved = localStorage.getItem('timeline.scale')
      if (saved) {
        const n = Number(saved)
        if (isFinite(n) && n >= 10 && n <= 240) setPxPerSec(n)
      }
    } catch {}
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem('timeline.scale', String(pxPerSec))
    } catch {}
  }, [pxPerSec])

  return (
    <div className="space-y-4">
      {!hideTopActions && (
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" className="h-4 w-4" onChange={e => selectAll(e.target.checked)}
                 checked={selectedSet.size > 0 && selectedSet.size === segments.length} aria-label="全选" />
          全选
        </label>
        <div className="text-sm text-muted-foreground">已选 {selectedSet.size} 段</div>
        <div className="ml-auto" />
        <Button
          disabled={isPending || !canRender || hasErrors || disabledExternally || renderMode !== null}
          onClick={() => startTransition(() => render(previewCount))}
        >
          {renderMode === 'preview' ? (
            <span className="inline-flex items-center gap-2"><LoadingSpinner size={14} /> 预览中…</span>
          ) : (
            <>预览前 {previewCount} 段</>
          )}
        </Button>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">数量</span>
          <Input type="number" className="h-8 w-20" min={1} max={segments.length || 1} value={previewCount} disabled={renderMode !== null || disabledExternally}
                 onChange={e => setPreviewCount(Math.max(1, Math.min(Number(e.target.value || '1'), segments.length || 1)))} />
        </div>
        <Button
          variant="outline"
          disabled={isPending || !canRender || hasErrors || disabledExternally || renderMode !== null}
          onClick={() => startTransition(() => render())}
        >
          {renderMode === 'full' ? (
            <span className="inline-flex items-center gap-2"><LoadingSpinner size={14} /> 渲染中…</span>
          ) : (
            '全量渲染'
          )}
        </Button>
        {renderMode !== null && (
          <Button variant="ghost" onClick={() => renderAbortRef.current?.abort()}>
            取消渲染
          </Button>
        )}
        {queue.length > 0 && (
        <div className="text-xs text-muted-foreground">队列：{queue.length}</div>
        )}
        {lastPreviewUrlRef.current && (
          <Button variant="ghost" onClick={() => window.open(lastPreviewUrlRef.current!, '_blank')}>打开最近预览</Button>
        )}
        {lastFailed && (
          <Button variant="ghost" onClick={() => _renderInternal(lastFailed.segs, lastFailed.mode, lastFailed.sig)}>重试上次失败</Button>
        )}
        <Button
          variant="outline"
          disabled={saving || !dirty || hasErrors || disabledExternally || renderMode !== null}
          onClick={save}
        >
          {saving ? '保存中…' : (dirty ? '保存分镜' : '已保存')}
        </Button>
      </div>
      )}

      {/* 预览提示：仅合成不混流，不含字幕/音频 */}
      {!hidePreviewTip && (
        <div className="rounded border border-border bg-muted p-2 text-xs text-muted-foreground">
          提示：预览仅返回合成画面用于快看节奏，不包含字幕与 BGM/配音；字幕会在“全量渲染”后出现在成片中。
        </div>
      )}

      {/* 字幕与音频体验（P1） */}
      {!hideGlobalPanel && (
      <div className="rounded border bg-card p-3 text-sm transition-all hover:shadow-sm">
        <div className="mb-2 font-medium">字幕与音频</div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="flex items-center gap-2">
            <span className="w-20 text-muted-foreground">字体</span>
            <div className="flex-1">
              <Select value={fontName || 'default'} onValueChange={(v) => setFontName(v === 'default' ? '' : v)}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="默认" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">默认</SelectItem>
                  {fontOptions.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4" checked={subtitleEnabled} onChange={e => setSubtitleEnabled(e.target.checked)} />
            启用字幕
          </label>
          <label className="flex items-center gap-2">
            <span className="w-20 text-muted-foreground">位置</span>
            <div className="flex-1">
              <Select value={subtitlePosition} onValueChange={(v) => setSubtitlePosition(v as any)}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="bottom" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bottom">底部</SelectItem>
                  <SelectItem value="center">居中</SelectItem>
                  <SelectItem value="top">顶部</SelectItem>
                  <SelectItem value="custom">自定义</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </label>
          {subtitlePosition === 'custom' && (
            <label className="flex items-center gap-2">
              <span className="w-20 text-muted-foreground">纵向位置</span>
              <div className="flex-1 flex items-center gap-2">
                <Slider value={[subtitleCustomPos]} min={0} max={100} step={1} onValueChange={(v) => setSubtitleCustomPos(v?.[0] ?? 70)} />
                <span className="w-10 text-right tabular-nums">{Math.round(subtitleCustomPos)}%</span>
              </div>
            </label>
          )}
          <label className="flex items-center gap-2">
            <span className="w-20 text-muted-foreground">字号</span>
            <Input type="number" className="h-8" min={12} max={120} value={fontSize} onChange={e => setFontSize(Math.max(12, Math.min(120, Number(e.target.value || 60))))} />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-20 text-muted-foreground">描边</span>
            <Input type="number" className="h-8" min={0} max={8} step={0.5} value={strokeWidth} onChange={e => setStrokeWidth(Math.max(0, Math.min(8, Number(e.target.value || 0))))} />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-20 text-muted-foreground">时移(秒)</span>
            <Input type="number" className="h-8" min={-5} max={5} step={0.1} value={subtitleOffset} onChange={e => setSubtitleOffset(Number(e.target.value || 0))} />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-20 text-muted-foreground">文字颜色</span>
            <Input type="text" className="h-8" value={textColor} onChange={e => setTextColor(e.target.value)} />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-20 text-muted-foreground">描边颜色</span>
            <Input type="text" className="h-8" value={strokeColor} onChange={e => setStrokeColor(e.target.value)} />
          </label>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4" checked={textBgEnabled} onChange={e => setTextBgEnabled(e.target.checked)} /> 背景框
            </label>
            {textBgEnabled && (
              <>
                <span className="w-20 text-muted-foreground">背景色</span>
                <Input type="text" className="h-8" value={textBgColor} onChange={e => setTextBgColor(e.target.value)} />
              </>
            )}
          </div>

          <div className="col-span-full h-px bg-muted" />
          <label className="flex items-center gap-2">
            <span className="w-20 text-muted-foreground">BGM 音量</span>
            <div className="flex-1 flex items-center gap-2">
              <Slider value={[Math.round((bgmVolume || 0) * 100)]} min={0} max={100} step={1} onValueChange={(v) => setBgmVolume((v?.[0] ?? 0) / 100)} />
              <span className="w-10 text-right tabular-nums">{Math.round((bgmVolume || 0) * 100)}%</span>
            </div>
          </label>
          <label className="flex items-center gap-2">
            <span className="w-20 text-muted-foreground">淡入</span>
            <Input type="number" className="h-8" min={0} max={10} step={0.5} value={bgmFadeInSec} onChange={e => setBgmFadeInSec(Number(e.target.value || 0))} />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-20 text-muted-foreground">淡出</span>
            <Input type="number" className="h-8" min={0} max={10} step={0.5} value={bgmFadeOutSec} onChange={e => setBgmFadeOutSec(Number(e.target.value || 0))} />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4" checked={bgmDucking} onChange={e => setBgmDucking(e.target.checked)} />
            语音下压（ducking）
          </label>
        </div>
      </div>
      )}

      {/* 横向时间线（P1：dnd-kit 拖拽 + 选中高亮 + 缩略图 + 时码标尺） */}
      {segments.length > 0 && (
      <div className="rounded border bg-card p-3 transition-all hover:shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm text-foreground">时间线</div>
            <div className="flex w-64 items-center gap-2 text-xs text-muted-foreground">
              <span className="whitespace-nowrap">缩放</span>
              <Slider
                value={[pxPerSec]}
                min={10}
                max={240}
                step={5}
                onValueChange={(v) => setPxPerSec(v?.[0] ?? 60)}
              />
              <span className="w-16 text-right tabular-nums">{pxPerSec} px/s</span>
            </div>
          </div>
          <TimelineRuler segments={segments} scale={pxPerSec} audioDuration={audioDuration} />
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <SortableContext items={segments.map(s => s.segment_id)} strategy={horizontalListSortingStrategy}>
              <div
                className="flex items-stretch gap-2 overflow-x-auto p-1 outline-none"
                tabIndex={0}
                role="listbox"
                aria-multiselectable
                onKeyDown={(e) => {
                  if (renderMode !== null || disabledExternally) return
                  if ((e.key === 'a' || e.key === 'A') && (e.metaKey || e.ctrlKey)) {
                    selectAll(true)
                    e.preventDefault()
                  } else if (e.key === 'Escape') {
                    setSelection(new Set())
                    e.preventDefault()
                  } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedSet.size > 0) {
                    deleteSelected()
                    e.preventDefault()
                  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    // 键盘左右键在时间线上移动选中焦点
                    const ids = segments.map(x => x.segment_id)
                    if (ids.length === 0) return
                    const currentId = anchorId && ids.includes(anchorId) ? anchorId : ids[0]
                    const idx = ids.indexOf(currentId)
                    const nextIdx = e.key === 'ArrowLeft' ? Math.max(0, idx - 1) : Math.min(ids.length - 1, idx + 1)
                    const nextId = ids[nextIdx]
                    setSelection(new Set([nextId]))
                    setAnchorId(nextId)
                    e.preventDefault()
                  }
                }}
                onClick={(e) => {
                  if (e.currentTarget === e.target) {
                    // 点击空白区域清空选择
                    setSelection(new Set())
                    setAnchorId(null)
                  }
                }}
              >
                {segments.map((s) => {
                  const widthPx = Math.max(120, Math.round((Number(s.duration) || 1) * pxPerSec))
                  const assetBase = API_BASE.replace(/\/?api\/?$/, '')
                  const thumbUrl = `${assetBase}/tasks/${taskId}/thumbs/${s.segment_id}.jpg`
                  const fallbackThumbUrl = `${API_BASE}/v1/tasks/${taskId}/segments/${s.segment_id}/thumb`
                  return (
                    <SortableChip
                      key={s.segment_id}
                      id={s.segment_id}
                      segment={s}
                      widthPx={widthPx}
                      thumbUrl={thumbUrl}
                      fallbackThumbUrl={fallbackThumbUrl}
                      label={(s.order ?? 0) + '. ' + (s.scene_title || '未命名')}
                      selected={selectedSet.has(s.segment_id)}
                      disabled={renderMode !== null || disabledExternally}
                      scale={pxPerSec}
                      onTrim={(deltaSec, side, baseStart, baseEnd) => {
                        if (renderMode !== null || disabledExternally) return
                        const idx = segments.findIndex(x => x.segment_id === s.segment_id)
                        if (idx === -1) return
                        const next = [...segments]
                        const minDur = 0.1
                        const st = Number(baseStart ?? 0)
                        const ed = Number(baseEnd ?? (st + (Number(next[idx].duration) || minDur)))
                        if (side === 'left') {
                          let ns = st + deltaSec
                          ns = Math.max(0, Math.min(ns, ed - minDur))
                          next[idx].start = ns
                          next[idx].duration = Math.max(minDur, ed - ns)
                        } else {
                          let ne = ed + deltaSec
                          ne = Math.max(st + minDur, ne)
                          next[idx].end = ne
                          next[idx].duration = Math.max(minDur, ne - st)
                        }
                        setSegments(next)
                      }}
                      onClick={(ev) => {
                        if (renderMode !== null || disabledExternally) return
                        const idx = segments.findIndex(x => x.segment_id === s.segment_id)
                        if (ev.shiftKey) {
                          const anchorIdx = anchorId ? segments.findIndex(x => x.segment_id === anchorId) : 0
                          const start = Math.max(0, Math.min(anchorIdx === -1 ? 0 : anchorIdx, idx))
                          const end = Math.max(anchorIdx === -1 ? 0 : anchorIdx, idx)
                          const ids = segments.slice(start, end + 1).map(x => x.segment_id)
                          setSelection(new Set(ids))
                          setAnchorId(s.segment_id)
                        } else if (ev.metaKey || ev.ctrlKey) {
                          toggleSelect(s.segment_id, !selectedSet.has(s.segment_id))
                          setAnchorId(s.segment_id)
                        } else {
                          setSelection(new Set([s.segment_id]))
                          setAnchorId(s.segment_id)
                        }
                      }}
                    />
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {(renderMode !== null || disabledExternally) && (
        <div className="rounded border bg-amber-50 p-2 text-xs text-amber-700">
          {renderMode !== null ? '渲染进行中，部分控件已禁用…' : '任务处理中（来自后端状态），部分控件已禁用…'}
        </div>
      )}

      {!compact && (
      <div className="flex flex-wrap items-center gap-3 rounded border bg-card p-3 text-sm transition-all hover:shadow-sm">
        <div className="text-muted-foreground">批量编辑（作用于已选 {selectedSet.size} 段）</div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">时长</span>
          <Input type="number" min={0.5} step={0.1} className="h-8 w-24" placeholder="秒" disabled={renderMode !== null || disabledExternally}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter') {
                     const v = Number((e.target as HTMLInputElement).value)
                     if (isFinite(v) && v > 0) applyBulk({ duration: v })
                   }
                 }} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">速度</span>
          <Input type="number" min={0.5} max={2} step={0.05} className="h-8 w-24" placeholder="0.5~2.0" disabled={renderMode !== null || disabledExternally}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter') {
                     const v = Number((e.target as HTMLInputElement).value)
                     if (isFinite(v) && v >= 0.5 && v <= 2) applyBulk({ speed: v })
                   }
                 }} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">转场</span>
          <Select onValueChange={(v) => applyBulk({ transition: (v === INHERIT ? (null as any) : v) as any })} disabled={renderMode !== null || disabledExternally}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue placeholder="继承/无" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={INHERIT}>继承/无</SelectItem>
              {transitionOptions.slice(1).map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" disabled={selectedSet.size === 0} onClick={deleteSelected}>删除已选</Button>
          <Button variant="outline" disabled={deleted.length === 0} onClick={restoreOne}>恢复一段</Button>
        </div>
      </div>
      )}

      {!compact && (segments.length === 0 ? (
        <div className="text-sm text-muted-foreground">暂无分镜。</div>
      ) : (
        <ol className="space-y-2">
          {segments.map((s, i) => (
            <li key={s.segment_id} className="rounded border bg-card p-3 text-sm transition-all hover:bg-muted/60">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={selectedSet.has(s.segment_id)}
                  onChange={e => toggleSelect(s.segment_id, e.target.checked)}
                  aria-label={`选择分镜 ${s.order}`}
                />
                <div className="min-w-[3rem] text-muted-foreground">#{s.order}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{s.scene_title || '未命名'}</div>
                  {s.shot_desc && <div className="text-muted-foreground">{s.shot_desc}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => move(i, -1)} disabled={i === 0}>上移</Button>
                  <Button variant="outline" size="sm" onClick={() => move(i, 1)} disabled={i === segments.length - 1}>下移</Button>
                  <Button variant="outline" size="sm" onClick={() => { setDeleted(d => [...d, s]); setSegments(normalizeOrders(segments.filter(x => x.segment_id !== s.segment_id))); const n = new Set(selectedSet); n.delete(s.segment_id); setSelection(n) }}>删除</Button>
                  <Button variant="outline" size="sm" onClick={() => { setPickerIndex(i); setPickerMode('replace') }}>替换素材</Button>
                  <Button variant="outline" size="sm" onClick={() => { setPickerIndex(i); setPickerMode('requery') }}>重检索</Button>
                  <Button variant="outline" size="sm" onClick={() => previewOne(i)}>预览此段</Button>
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <label className="flex items-center gap-2">
                  <span className="w-16 text-muted-foreground">时长</span>
                  <Input type="number" className={`h-8 ${(!isFinite(Number(s.duration)) || Number(s.duration) <= 0) ? 'border-red-500 focus-visible:ring-red-500' : ''}`} disabled={renderMode !== null || disabledExternally}
                         min={0.1} step={0.1} value={s.duration ?? 0}
                         onChange={e => updateDuration(i, e.target.value)} />
                </label>
                <label className="flex items-center gap-2">
                  <span className="w-16 text-muted-foreground">入点</span>
                  <Input type="number" className={`h-8 ${(!isFinite(Number(s.start)) || Number(s.start) < 0) ? 'border-red-500 focus-visible:ring-red-500' : ''}`} disabled={renderMode !== null || disabledExternally}
                         min={0} step={0.1} value={s.start ?? 0}
                         onChange={e => updateStart(i, e.target.value)} />
                </label>
                <label className="flex items-center gap-2">
                  <span className="w-16 text-muted-foreground">出点</span>
                  <Input type="number" className={`h-8 ${(!isFinite(Number(s.end)) || Number(s.end) <= Number(s.start ?? 0)) ? 'border-red-500 focus-visible:ring-red-500' : ''}`} disabled={renderMode !== null || disabledExternally}
                         min={0} step={0.1} value={s.end ?? (Number(s.start ?? 0) + Number(s.duration ?? 0))}
                         onChange={e => updateEnd(i, e.target.value)} />
                </label>
                <label className="flex items-center gap-2">
                  <span className="w-16 text-muted-foreground">转场</span>
                  <div className="flex-1">
                    <Select value={s.transition ?? INHERIT} onValueChange={(v) => updateField(i, 'transition', v === INHERIT ? null : v)} disabled={renderMode !== null || disabledExternally}>
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="继承/无" />
                      </SelectTrigger>
                      <SelectContent>
                        {transitionOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </label>
                {(s.transition === 'Mask') && (
                  <label className="flex items-center gap-2">
                    <span className="w-16 text-muted-foreground">遮罩</span>
                    <div className="flex-1">
                      <Select value={(s as any).transition_mask ?? 'horizontal'} onValueChange={(v) => updateField(i, 'transition_mask' as any, v)} disabled={renderMode !== null || disabledExternally}>
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="horizontal" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="horizontal">水平擦除</SelectItem>
                          <SelectItem value="vertical">竖直擦除</SelectItem>
                          <SelectItem value="circle">圆形</SelectItem>
                          <SelectItem value="blinds">百叶窗</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </label>
                )}
                {(s.transition && s.transition !== INHERIT) && (
                  <label className="flex items-center gap-2">
                    <span className="w-16 text-muted-foreground">转场时长</span>
                    <Input type="number" className={`h-8 ${(((s as any).transition_duration ?? 1) < 0.2 || ((s as any).transition_duration ?? 1) > 2) ? 'border-red-500 focus-visible:ring-red-500' : ''}`} disabled={renderMode !== null || disabledExternally}
                           min={0.2} max={2} step={0.1} value={(s as any).transition_duration ?? 1}
                           onChange={e => updateField(i, 'transition_duration' as any, e.target.value)} />
                  </label>
                )}
                {(s.transition === 'SlideIn' || s.transition === 'SlideOut' || s.transition === 'Mask') && ((s as any).transition_mask !== 'circle') && (
                  <label className="flex items-center gap-2">
                    <span className="w-16 text-muted-foreground">方向</span>
                    <div className="flex-1">
                      <Select value={(s as any).transition_direction ?? 'left'} onValueChange={(v) => updateField(i, 'transition_direction' as any, v)} disabled={renderMode !== null || disabledExternally}>
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="left" />
                        </SelectTrigger>
                        <SelectContent>
                          {directionOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </label>
                )}
                <label className="flex items-center gap-2">
                  <span className="w-16 text-muted-foreground">速度</span>
                  <Input type="number" className={`h-8 ${((s.speed ?? 1) < 0.75 || (s.speed ?? 1) > 1.25) ? 'border-red-500 focus-visible:ring-red-500' : ''}`} disabled={renderMode !== null || disabledExternally}
                         min={0.75} max={1.25} step={0.01} value={s.speed ?? 1}
                         onChange={e => updateField(i, 'speed', e.target.value)} />
                </label>
                <label className="flex items-center gap-2">
                  <span className="w-16 text-muted-foreground">填充</span>
                  <div className="flex-1">
                    <Select value={s.fit ?? 'contain'} onValueChange={(v) => updateField(i, 'fit', v)} disabled={renderMode !== null || disabledExternally}>
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="contain" />
                      </SelectTrigger>
                      <SelectContent>
                        {fitOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </label>
              </div>
              {(!isFinite(Number(s.duration)) || Number(s.duration) <= 0) && (
                <div className="mt-2 text-xs text-red-600">时长需为大于 0 的数字</div>
              )}
              {(isFinite(Number(s.start)) && isFinite(Number(s.end)) && Number(s.end) <= Number(s.start)) && (
                <div className="mt-1 text-xs text-red-600">出点需大于入点</div>
              )}
              {((s.speed ?? 1) < 0.75 || (s.speed ?? 1) > 1.25) && (
                <div className="mt-1 text-xs text-red-600">速度范围 0.75 – 1.25</div>
              )}
            </li>
          ))}
        </ol>
      ))}
      {!compact && (
      <div className="text-xs">
        <div className="text-muted-foreground">总时长：{formatTime(totalDuration)}{audioDuration ? ` / 音频：${formatTime(audioDuration)}` : ''}</div>
        {audioDuration > 0 && totalDuration - audioDuration > 0.05 && (
          <div className="text-red-600">总视频时长超过音频长度，建议修剪或调整。</div>
        )}
        {hasErrors && (
          <div className="text-red-600">存在无效参数，请修正红框字段后再渲染。</div>
        )}
      </div>
      )}
      {!compact && (
      <MaterialPicker
        open={pickerIndex != null}
        onOpenChange={(v) => { if (!v) { setPickerIndex(null); setPickerMode(null) } }}
        taskId={taskId}
        initialTab={pickerMode === 'requery' ? 'online' : undefined}
        initialQuery={pickerMode === 'requery' && pickerIndex != null ? (segments[pickerIndex]?.shot_desc || segments[pickerIndex]?.scene_title || '') as any : undefined}
        onPicked={async (p) => {
          if (pickerIndex == null) return
          const idx = pickerIndex
          const next = [...segments]
          const seg = { ...next[idx] }
          const segDur = Math.max(0.1, Number(seg.duration || 0))
          const srcDur = Number(p.duration || 0)
          const end = (isFinite(srcDur) && srcDur > 0) ? Math.min(segDur, srcDur) : segDur
          // @ts-expect-error index assignment
          seg.material = p.file
          // @ts-expect-error index assignment
          seg.start = 0
          // @ts-expect-error index assignment
          seg.end = end
          // @ts-expect-error index assignment
          seg.duration = end
          // @ts-expect-error index assignment
          next[idx] = seg
          setSegments(next)
          const mode = pickerMode
          setPickerIndex(null)
          setPickerMode(null)
          if (mode === 'requery') {
            // auto preview the updated single segment
            await previewOne(idx)
          }
        }}
      />
      )}
    </div>
  )
}

function SortableChip({ id, label, segment, widthPx, thumbUrl, fallbackThumbUrl, selected, disabled, scale, onTrim, onClick }: { id: string, label: string, segment: SegmentItem, widthPx: number, thumbUrl: string, fallbackThumbUrl?: string, selected: boolean, disabled?: boolean, scale: number, onTrim?: (deltaSec: number, side: 'left'|'right', baseStart: number, baseEnd: number) => void, onClick?: (e: React.MouseEvent) => void }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id, disabled })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }
  const leftDragRef = useRef<{startX: number, baseStart: number, baseEnd: number} | null>(null)
  const rightDragRef = useRef<{startX: number, baseStart: number, baseEnd: number} | null>(null)

  function onPointerDown(e: React.PointerEvent, side: 'left'|'right') {
    if (disabled) return
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX
    const baseStart = Number(segment.start ?? 0)
    const baseEnd = Number(segment.end ?? (baseStart + (segment.duration || 0)))
    const ref = side === 'left' ? leftDragRef : rightDragRef
    ref.current = { startX, baseStart, baseEnd }
    const onMove = (ev: PointerEvent) => {
      const deltaX = ev.clientX - startX
      const deltaSec = deltaX / (scale || 60)
      onTrim && onTrim(deltaSec, side, baseStart, baseEnd)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      leftDragRef.current = null
      rightDragRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  return (
    <button
      ref={setNodeRef}
      style={{ ...(style as any), width: `${widthPx}px` }}
      {...attributes}
      {...listeners}
      type="button"
      onClick={onClick}
      className={
        `group relative min-w-[120px] select-none rounded border p-2 text-left text-sm shadow-sm transition-all ` +
        (selected ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted') +
        (disabled ? ' opacity-60 cursor-not-allowed' : ' cursor-grab active:cursor-grabbing') +
        (isDragging ? ' ring-2 ring-primary/30' : '')
      }
      role="option"
      aria-selected={selected}
    >
      {/* trim handles */}
      {!disabled && (
        <>
          <div
            className="absolute left-0 top-0 z-10 h-full w-1 cursor-ew-resize bg-blue-500 opacity-0 group-hover:opacity-80"
            onPointerDown={(e) => onPointerDown(e, 'left')}
            aria-label="左侧修剪"
          />
          <div
            className="absolute right-0 top-0 z-10 h-full w-1 cursor-ew-resize bg-blue-500 opacity-0 group-hover:opacity-80"
            onPointerDown={(e) => onPointerDown(e, 'right')}
            aria-label="右侧修剪"
          />
        </>
      )}
      <div className="truncate font-medium">{label}</div>
      <div className="mt-1 h-[64px] w-full overflow-hidden rounded bg-muted">
        <img
          src={thumbUrl}
          alt="thumb"
          className="h-[64px] w-full object-cover"
          onError={(e) => {
            const img = e.currentTarget as HTMLImageElement
            if (fallbackThumbUrl && !img.dataset.retry) {
              img.dataset.retry = '1'
              img.src = fallbackThumbUrl
            } else {
              img.style.display = 'none'
            }
          }}
        />
        {/* fallback placeholder when image fails */}
        <div className="flex h-[64px] w-full items-center justify-center text-xs text-muted-foreground">
          缩略图
        </div>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{formatTime(segment.duration ?? 0)}</div>
    </button>
  )
}

function formatTime(sec: number) {
  const s = Math.max(0, Number(sec || 0))
  const m = Math.floor(s / 60)
  const rest = Math.floor(s % 60)
  return `${m}:${rest.toString().padStart(2, '0')}`
}

function TimelineRuler({ segments, scale, audioDuration = 0 }: { segments: SegmentItem[]; scale: number; audioDuration?: number }) {
  const total = Math.max(0, segments.reduce((acc, s) => acc + Number(s.duration || 0), 0))
  const totalPx = Math.max(300, Math.round(total * scale))
  const seconds = Math.ceil(total)
  return (
    <div className="mb-2 overflow-x-auto">
      <div className="relative h-8 min-w-full" style={{ width: `${totalPx}px` }}>
        {[...Array(seconds + 1)].map((_, i) => (
          <div key={i} className="absolute top-0 h-full border-l border-border text-[10px] text-muted-foreground" style={{ left: `${i * scale}px` }}>
            <div className="absolute top-0 h-2 w-px bg-border" />
            <div className="absolute top-0 left-1">{formatTime(i)}</div>
          </div>
        ))}
        {audioDuration > 0 && (
          <div className="absolute top-0 h-full border-l-2 border-red-500" style={{ left: `${audioDuration * scale}px` }}>
            <div className="absolute -top-1 -ml-2 rounded bg-red-500 px-1 py-0.5 text-[10px] text-white">音频</div>
          </div>
        )}
      </div>
    </div>
  )
}
