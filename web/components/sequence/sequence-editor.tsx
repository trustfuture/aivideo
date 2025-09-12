"use client"
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import MvpTimeline from '@/components/timeline/mvp-timeline'
import type { SegmentItem, VideoParams } from '@/lib/schemas'
import { API_BASE, post, get } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useUiStore } from '@/lib/store/ui'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { LoadingSpinner } from '@/components/ui/loading'

type Props = {
  taskId: string
  segments: SegmentItem[]
  audioDuration?: number
  disabled?: boolean
  baseParams?: VideoParams | null
  onSaved?: (next: SegmentItem[]) => void
  // Simple mode: only timeline + per-segment drawer
  simple?: boolean
}

export default function SequenceEditor({ taskId, segments, audioDuration = 0, disabled = false, baseParams, onSaved, simple = false }: Props) {
  const [items, setItems] = useState<SegmentItem[]>(segments || [])
  const [isPending, startTransition] = useTransition()
  const setBusy = useUiStore(s => s.setBusy)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [aiMode, setAiMode] = useState<'polish'|'simplify'|'translate-zh'|'translate-en'>('polish')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiOriginal, setAiOriginal] = useState('')
  const [aiSuggestion, setAiSuggestion] = useState('')
  const [aiCache, setAiCache] = useState<Record<string, { mode: string, original: string, suggestion: string }>>({})
  const [applyLoading, setApplyLoading] = useState(false)
  // fonts
  const [fontOptions, setFontOptions] = useState<string[]>([])
  const [defaultFont, setDefaultFont] = useState<string>('')
  // list virtualization state (must be declared before effects/calculations)
  const listWrapRef = useRef<HTMLDivElement | null>(null)
  const [listScrollTop, setListScrollTop] = useState(0)
  const [listViewportH, setListViewportH] = useState(0)
  const [rowH, setRowH] = useState<number>(56)
  const overscan = 6

  // render controls bridged from timeline
  const ctrlRef = useRef<null | {
    preview: (count: number) => void
    renderFull: () => void
    cancel: () => void
    openLastPreview: () => void
    retryLastFailed: () => void
    getState: () => { renderMode: 'preview'|'full'|null, canRender: boolean, hasErrors: boolean, queue: number, lastPreviewUrl: string | null, disabledExternally: boolean }
    getPreviewCount: () => number
    setPreviewCount: (n: number) => void
  }>(null)
  const [renderState, setRenderState] = useState<{ renderMode: 'preview'|'full'|null, canRender: boolean, hasErrors: boolean, queue: number, lastPreviewUrl: string | null, disabledExternally: boolean }>({ renderMode: null, canRender: false, hasErrors: false, queue: 0, lastPreviewUrl: null, disabledExternally: false })
  const [previewCount, setPreviewCount] = useState<number>(3)
  // view mode to reduce on-screen clutter
  const [viewMode, setViewMode] = useState<'timeline'|'list'|'mix'>('timeline')
  const [showGlobalPanel, setShowGlobalPanel] = useState<boolean>(false)
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false)

  useEffect(() => {
    setItems(segments || [])
  }, [segments])

  // moved: sync lastSavedSig after initialSig is computed

  useEffect(() => {
    let canceled = false
    async function loadFonts() {
      try {
        const res = await get('/v1/fonts')
        const json = await res.json()
        if (!canceled) setFontOptions((json?.data?.files as string[]) || [])
      } catch {}
    }
    async function loadDefaultFont() {
      try {
        const res = await get('/v1/config')
        const json = await res.json()
        const name = json?.data?.ui?.font_name
        if (!canceled && name) setDefaultFont(String(name))
      } catch {}
    }
    loadFonts(); loadDefaultFont();
    return () => { canceled = true }
  }, [])

  // Prewarm thumbnails on the server to speed up first render of list images
  useEffect(() => {
    fetch(`${API_BASE}/v1/tasks/${taskId}/segments/thumbs`).catch(() => {})
  }, [taskId])

  // simple viewport height measurement for virtualization
  useEffect(() => {
    const el = listWrapRef.current
    if (!el) return
    const update = () => setListViewportH(el.clientHeight || 0)
    update()
    const onResize = () => update()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const list = useMemo(() => items || [], [items])
  // track changes for autosave（字幕时移 + 样式覆盖）
  const makeSig = (arr: SegmentItem[]) => JSON.stringify(arr.map(s => ({
    id: s.segment_id,
    // timeline-critical fields (so Save/Autosave captures timeline edits too)
    d: s.duration,
    st: s.start,
    ed: s.end,
    sp: s.speed,
    tr: s.transition,
    td: (s as any).transition_duration,
    dir: (s as any).transition_direction,
    msk: (s as any).transition_mask,
    fit: s.fit,
    mat: s.material,
    // per-segment subtitle overrides
    off: s.subtitle_offset,
    en: s.subtitle_enabled,
    pos: s.subtitle_position,
    cus: s.custom_position,
    fn: s.font_name,
    fs: s.font_size,
    fore: s.text_fore_color,
    sc: s.stroke_color,
    sw: s.stroke_width,
    bg: s.text_background_color,
  })))
  const initialSig = useMemo(() => makeSig(segments || []), [segments])
  const sig = useMemo(() => makeSig(list), [list])
  const [lastSavedSig, setLastSavedSig] = useState<string>(initialSig)
  const dirty = lastSavedSig !== sig
  const [saving, setSaving] = useState(false)
  // when input segments change (e.g., after successful save/refresh), sync last-saved signature
  useEffect(() => {
    setLastSavedSig(initialSig)
  }, [initialSig])
  // virtualization calculations
  const estRowH = Math.max(24, (rowH || 56))
  const total = list.length
  const visibleCount = Math.max(1, Math.ceil((listViewportH || 1) / estRowH))
  const startIndex = Math.max(0, Math.floor((listScrollTop || 0) / estRowH) - overscan)
  const endIndex = Math.min(total, startIndex + visibleCount + overscan * 2)
  const topPad = startIndex * estRowH
  const bottomPad = Math.max(0, (total - endIndex) * estRowH)
  const windowed = list.slice(startIndex, endIndex)
  const measureFirstRow = (el: HTMLLIElement | null) => {
    if (!el) return
    const h = el.getBoundingClientRect().height
    if (h && Math.abs(h - rowH) > 1) setRowH(h)
  }

  // simple mode: clicking a segment in the timeline selects it; open the drawer for single selection
  useEffect(() => {
    if (!simple) return
    if (selected.size === 1) {
      const oneId = Array.from(selected)[0]
      const idx = list.findIndex(s => s.segment_id === oneId)
      if (idx >= 0) setEditIndex(idx)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simple, selected, list])

  function updateOffset(i: number, val: any) {
    const v = Number(val)
    const next = [...list]
    // @ts-expect-error index
    next[i].subtitle_offset = isFinite(v) ? v : 0
    setItems(next)
  }

  function toggleOne(id: string, value: boolean) {
    const next = new Set(selected)
    if (value) next.add(id); else next.delete(id)
    setSelected(next)
  }
  function toggleAll(value: boolean) {
    if (!value) return setSelected(new Set())
    setSelected(new Set(list.map(s => s.segment_id)))
  }

  async function save(silent = false) {
    try {
      setSaving(true)
      if (!silent) setBusy(true)
      const body = { task_id: taskId, segments: list }
      const res = await post('/v1/segments/save', body)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message || '保存失败')
      if (!silent) toast.success('已保存分镜（字幕/样式覆盖）')
      setLastSavedSig(sig)
      onSaved && onSaved(list)
    } catch (e: any) {
      if (!silent) toast.error(e?.message || '保存失败')
    } finally {
      setSaving(false)
      if (!silent) setBusy(false)
    }
  }

  // debounced autosave when fields change
  const autoTimer = useRef<any>(null)
  useEffect(() => {
    if (!dirty) return
    if (disabled) return
    if (autoTimer.current) clearTimeout(autoTimer.current)
    autoTimer.current = setTimeout(() => {
      // silent autosave
      save(true)
    }, 3000)
    return () => { if (autoTimer.current) clearTimeout(autoTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, dirty, disabled])

  // Drawer state for per-segment style overrides
  const current = editIndex != null ? list[editIndex] : null
  const [pos, setPos] = useState<string>('inherit')
  const [customPos, setCustomPos] = useState<string>('')
  const [fontName, setFontName] = useState<string>('inherit')
  const [fontSize, setFontSize] = useState<string>('')
  const [foreColor, setForeColor] = useState<string>('')
  const [strokeColor, setStrokeColor] = useState<string>('')
  const [strokeWidth, setStrokeWidth] = useState<string>('')
  const [bgMode, setBgMode] = useState<'inherit'|'none'|'color'>('inherit')
  const [bgColor, setBgColor] = useState<string>('#000000')
  const [disableSubtitle, setDisableSubtitle] = useState<boolean>(false)
  const [offsetVal, setOffsetVal] = useState<string>('')
  const [drawerAdv, setDrawerAdv] = useState<boolean>(false)
  
  // Global render params (moved from timeline's global panel)
  const [gSubtitleEnabled, setGSubtitleEnabled] = useState<boolean>(true)
  const [gSubtitlePosition, setGSubtitlePosition] = useState<'bottom'|'top'|'center'|'custom'>('bottom')
  const [gSubtitleCustomPos, setGSubtitleCustomPos] = useState<number>(70)
  const [gSubtitleOffset, setGSubtitleOffset] = useState<number>(0)
  const [gFontName, setGFontName] = useState<string>('')
  const [gFontSize, setGFontSize] = useState<number>(60)
  const [gStrokeWidth, setGStrokeWidth] = useState<number>(1.5 as any)
  const [gTextColor, setGTextColor] = useState<string>('#FFFFFF')
  const [gStrokeColor, setGStrokeColor] = useState<string>('#000000')
  const [gTextBgEnabled, setGTextBgEnabled] = useState<boolean>(true)
  const [gTextBgColor, setGTextBgColor] = useState<string>('#000000')
  const [gBgmVolume, setGBgmVolume] = useState<number>(0.2)
  const [gBgmFadeIn, setGBgmFadeIn] = useState<number>(0)
  const [gBgmFadeOut, setGBgmFadeOut] = useState<number>(3)
  const [gBgmDucking, setGBgmDucking] = useState<boolean>(false)

  // initialize global render params from task base params
  useEffect(() => {
    if (!baseParams) return
    try {
      if (typeof baseParams.subtitle_enabled === 'boolean') setGSubtitleEnabled(!!baseParams.subtitle_enabled)
      if (typeof baseParams.subtitle_position === 'string') setGSubtitlePosition(baseParams.subtitle_position as any)
      if (typeof baseParams.custom_position === 'number') setGSubtitleCustomPos(Number(baseParams.custom_position))
      if (typeof (baseParams as any).subtitle_offset === 'number') setGSubtitleOffset(Number((baseParams as any).subtitle_offset))
      if (typeof baseParams.font_name === 'string') setGFontName(baseParams.font_name as any)
      if (typeof baseParams.font_size === 'number') setGFontSize(Number(baseParams.font_size))
      if (typeof baseParams.stroke_width === 'number') setGStrokeWidth(Number(baseParams.stroke_width))
      if (typeof baseParams.text_fore_color === 'string') setGTextColor(String(baseParams.text_fore_color))
      if (typeof baseParams.stroke_color === 'string') setGStrokeColor(String(baseParams.stroke_color))
      if (typeof baseParams.text_background_color !== 'undefined') {
        const bg = baseParams.text_background_color as any
        if (bg === false) { setGTextBgEnabled(false); setGTextBgColor('#000000') }
        else if (bg === true) { setGTextBgEnabled(true); setGTextBgColor('#000000') }
        else if (typeof bg === 'string') { setGTextBgEnabled(true); setGTextBgColor(String(bg)) }
      }
      if (typeof baseParams.bgm_volume === 'number') setGBgmVolume(Number(baseParams.bgm_volume))
      if (typeof (baseParams as any).bgm_fade_in_sec === 'number') setGBgmFadeIn(Number((baseParams as any).bgm_fade_in_sec))
      if (typeof (baseParams as any).bgm_fade_out_sec === 'number') setGBgmFadeOut(Number((baseParams as any).bgm_fade_out_sec))
      if (typeof (baseParams as any).bgm_ducking === 'boolean') setGBgmDucking(!!(baseParams as any).bgm_ducking)
    } catch {}
  }, [baseParams])

  const externalParams = useMemo(() => {
    const bg: any = gTextBgEnabled ? (gTextBgColor || true) : false
    return {
      subtitle_enabled: gSubtitleEnabled,
      subtitle_position: gSubtitlePosition,
      custom_position: gSubtitleCustomPos,
      subtitle_offset: Number(gSubtitleOffset) || 0,
      font_name: gFontName || undefined,
      font_size: Number(gFontSize) || 60,
      stroke_width: Number(gStrokeWidth) || 1,
      text_fore_color: gTextColor,
      stroke_color: gStrokeColor,
      text_background_color: bg,
      bgm_volume: Number(gBgmVolume) || 0,
      bgm_fade_in_sec: Number(gBgmFadeIn) || 0,
      bgm_fade_out_sec: Number(gBgmFadeOut) || 0,
      bgm_ducking: !!gBgmDucking,
    } as any
  }, [gSubtitleEnabled, gSubtitlePosition, gSubtitleCustomPos, gSubtitleOffset, gFontName, gFontSize, gStrokeWidth, gTextColor, gStrokeColor, gTextBgEnabled, gTextBgColor, gBgmVolume, gBgmFadeIn, gBgmFadeOut, gBgmDucking])

  useEffect(() => {
    if (current == null) return
    // 位置默认落地：优先 baseParams.subtitle_position，否则 bottom；custom 位置默认 70 或 baseParams.custom_position
    const defaultPos = String((baseParams as any)?.subtitle_position ?? 'bottom')
    const defaultCustomPosNum = Number((baseParams as any)?.custom_position ?? 70)
    const hasPos = current.subtitle_position != null
    const hasCustom = current.custom_position != null
    const posValue = hasPos ? String(current.subtitle_position) : defaultPos
    setPos(posValue)
    setCustomPos(hasCustom ? String(current.custom_position) : (posValue === 'custom' ? String(defaultCustomPosNum) : ''))

    setFontName(current.font_name ? String(current.font_name) : 'inherit')
    // 默认值直接落地为实值（优先使用任务基础参数，其次使用通用默认）
    const defaultSize = Number((baseParams as any)?.font_size ?? 60)
    const defaultColor = String((baseParams as any)?.text_fore_color ?? '#FFFFFF')
    const defaultOffset = String((baseParams as any)?.subtitle_offset ?? 0)
    const hasSize = current.font_size != null
    const hasColor = !!current.text_fore_color
    const hasOffset = current.subtitle_offset != null
    setFontSize(hasSize ? String(current.font_size) : String(defaultSize))
    setForeColor(hasColor ? String(current.text_fore_color) : defaultColor)
    setStrokeColor(current.stroke_color || '')
    setStrokeWidth(current.stroke_width == null ? '' : String(current.stroke_width))
    if (current.text_background_color == null) setBgMode('inherit')
    else if (current.text_background_color === false) setBgMode('none')
    else { setBgMode('color'); setBgColor(String(current.text_background_color)) }
    setDisableSubtitle(current.subtitle_enabled === false)
    // 时移：如未设置则直接写入默认值为实值
    setOffsetVal(hasOffset ? String(current.subtitle_offset) : defaultOffset)
    // preload AI cache if exists
    const sid = current.segment_id as any
    const item = sid ? aiCache[String(sid)] : null
    if (item) {
      setAiMode((item.mode as any) || 'polish')
      setAiOriginal(item.original || '')
      setAiSuggestion(item.suggestion || '')
    } else {
      setAiOriginal('')
      setAiSuggestion('')
    }
    // 简化模式：若该段未显式设置过 位置/自定义位置/字号/文字色/时移，则将默认值落地为实值到分镜列表中（静默应用，随后自动保存）
    try {
      if (simple && (editIndex != null)) {
        const idx = editIndex
        const next = [...list]
        const base = next[idx]
        if (base) {
          const patch: any = {}
          if (!hasPos) patch.subtitle_position = defaultPos
          const effPos = hasPos ? String(current.subtitle_position) : defaultPos
          if (!hasCustom && effPos === 'custom') patch.custom_position = defaultCustomPosNum
          if (!hasSize) patch.font_size = defaultSize
          if (!hasColor) patch.text_fore_color = defaultColor
          if (!hasOffset) patch.subtitle_offset = Number(defaultOffset)
          if (Object.keys(patch).length > 0) {
            next[idx] = { ...base, ...patch }
            setItems(next)
          }
        }
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editIndex])

  function buildPatchFromDraft() {
    const patch: any = {}
    // do not override subtitle unless explicitly disabled
    patch.subtitle_enabled = disableSubtitle ? false : null
    // position + custom position
    if (pos && pos !== 'inherit') patch.subtitle_position = pos
    else patch.subtitle_position = null
    patch.custom_position = customPos === '' ? null : Number(customPos)
    // only include font_name / stroke / bg when not in simple mode or when advanced is open
    if (!simple || drawerAdv) {
      if (fontName && fontName !== 'inherit') patch.font_name = fontName
      else patch.font_name = null
      patch.stroke_color = strokeColor || null
      patch.stroke_width = strokeWidth === '' ? null : Number(strokeWidth)
      if (bgMode === 'inherit') patch.text_background_color = null
      else if (bgMode === 'none') patch.text_background_color = false
      else patch.text_background_color = bgColor || '#000000'
    }
    // always include core fields (字号/文字色/时移)
    patch.font_size = fontSize === '' ? null : Number(fontSize)
    patch.text_fore_color = foreColor || null
    patch.subtitle_offset = offsetVal === '' ? null : Number(offsetVal)
    return patch
  }

  function applyDraftTo(indexes: number[]) {
    const patch = buildPatchFromDraft()
    const next = [...list]
    for (const idx of indexes) {
      const base = next[idx]
      next[idx] = { ...base, ...patch }
    }
    setItems(next)
    toast.success(`已应用到 ${indexes.length} 段（未保存）`)
  }

  async function generateSuggestionFor(index: number) {
    try {
      setAiLoading(true)
      const seg = list[index]
      const body = { task_id: taskId, segment_id: seg.segment_id, order: seg.order, mode: aiMode }
      const res = await post('/v1/subtitles/suggest', body)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message || '生成失败')
      const data = json?.data || {}
      setAiOriginal(String(data.original_text || ''))
      setAiSuggestion(String(data.suggestion || ''))
      setAiCache(prev => ({ ...prev, [seg.segment_id]: { mode: aiMode, original: String(data.original_text || ''), suggestion: String(data.suggestion || '') } }))
      toast.success('已生成建议')
    } catch (e: any) {
      toast.error(e?.message || '生成失败')
    } finally {
      setAiLoading(false)
    }
  }

  async function generateSuggestionForSelected() {
    if (selected.size === 0) return
    const indices = list.map((s, i) => selected.has(s.segment_id) ? i : -1).filter(x => x >= 0)
    for (const idx of indices) {
      // eslint-disable-next-line no-await-in-loop
      await generateSuggestionFor(idx)
    }
    toast.success(`已为 ${indices.length} 段生成建议`)
  }

  async function applySuggestionAsOverride(index: number) {
    try {
      setApplyLoading(true)
      const seg = list[index]
      const cache = aiCache[seg.segment_id]
      const suggestion = (aiSuggestion || cache?.suggestion || '').trim()
      if (!suggestion) {
        toast.error('请先生成或填写建议文本')
        return
      }
      const body = { task_id: taskId, segment_id: seg.segment_id, order: seg.order, mode: aiMode, suggestion, apply: true }
      const res = await post('/v1/subtitles/rewrite', body)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message || '应用失败')
      toast.success('已应用为本段覆盖（v2）')
    } catch (e: any) {
      toast.error(e?.message || '应用失败')
    } finally {
      setApplyLoading(false)
    }
  }

  async function revertOverride(index: number) {
    try {
      setApplyLoading(true)
      const seg = list[index]
      const res = await post(`/v1/subtitles/revert?task_id=${encodeURIComponent(taskId)}&segment_id=${encodeURIComponent(seg.segment_id)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message || '回滚失败')
      toast.success('已回滚覆盖（取消应用）')
    } catch (e: any) {
      toast.error(e?.message || '回滚失败')
    } finally {
      setApplyLoading(false)
    }
  }

  function closeInspector() {
    setEditIndex(null)
    if (simple) setSelected(new Set())
  }

  return (
    <div className="space-y-4">
      {/* 简化模式：最小渲染控制，仅提供“全量渲染”与“取消”；右侧提供单段预览按钮在面板中 */}
      {simple && (
        <div className="flex items-center gap-2 rounded border bg-card p-2 text-sm">
          <Button
            size="sm"
            variant="outline"
            disabled={
              !ctrlRef.current || saving || isPending || !renderState.canRender || renderState.hasErrors || renderState.disabledExternally || renderState.renderMode !== null
            }
            onClick={() => ctrlRef.current?.renderFull()}
          >
            {renderState.renderMode === 'full' ? (
              <span className="inline-flex items-center gap-1"><LoadingSpinner size={14} /> 渲染中…</span>
            ) : '全量渲染'}
          </Button>
          {renderState.renderMode !== null && (
            <Button size="sm" variant="ghost" onClick={() => ctrlRef.current?.cancel()}>取消</Button>
          )}
          {renderState.queue > 0 && (
            <div className="text-xs text-muted-foreground">队列：{renderState.queue}</div>
          )}
        </div>
      )}
      {/* 顶部工具栏（在简单模式下隐藏） */}
      {!simple && (
      <div className="flex flex-wrap items-center gap-3 rounded border bg-card p-2 text-sm">
        <div className="font-medium">序列编辑器</div>
        {showAdvanced && (
          <div className="flex items-center gap-1 text-xs">
            <span className="text-muted-foreground">视图</span>
            <Button size="sm" variant={viewMode==='mix'?'secondary':'outline'} onClick={() => setViewMode('mix')}>混合</Button>
            <Button size="sm" variant={viewMode==='timeline'?'secondary':'outline'} onClick={() => setViewMode('timeline')}>时间线</Button>
            <Button size="sm" variant={viewMode==='list'?'secondary':'outline'} onClick={() => setViewMode('list')}>列表</Button>
          </div>
        )}
        <div className="ml-auto" />
        {/* 渲染控制 */}
        <Button
          size="sm"
          disabled={
            !ctrlRef.current || saving || isPending || !renderState.canRender || renderState.hasErrors || renderState.disabledExternally || renderState.renderMode !== null
          }
          onClick={() => ctrlRef.current?.preview(previewCount)}
        >
          {renderState.renderMode === 'preview' ? (
            <span className="inline-flex items-center gap-1"><LoadingSpinner size={14} /> 预览中…</span>
          ) : (
            <>预览前 {previewCount} 段</>
          )}
        </Button>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">数量</span>
          <Input
            type="number"
            className="h-8 w-20"
            min={1}
            max={list.length || 1}
            value={previewCount}
            disabled={!ctrlRef.current || renderState.renderMode !== null || renderState.disabledExternally}
            onChange={(e) => {
              const v = Math.max(1, Math.min(Number(e.target.value || '1'), list.length || 1))
              setPreviewCount(v)
              ctrlRef.current?.setPreviewCount(v)
            }}
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!ctrlRef.current || saving || isPending || !renderState.canRender || renderState.hasErrors || renderState.disabledExternally || renderState.renderMode !== null}
          onClick={() => ctrlRef.current?.renderFull()}
        >
          {renderState.renderMode === 'full' ? (
            <span className="inline-flex items-center gap-1"><LoadingSpinner size={14} /> 渲染中…</span>
          ) : '全量渲染'}
        </Button>
        {renderState.renderMode !== null && (
          <Button size="sm" variant="ghost" onClick={() => ctrlRef.current?.cancel()}>取消</Button>
        )}
        {renderState.queue > 0 && (
          <div className="text-xs text-muted-foreground">队列：{renderState.queue}</div>
        )}
        {renderState.lastPreviewUrl && (
          <Button size="sm" variant="ghost" onClick={() => ctrlRef.current?.openLastPreview()}>打开最近预览</Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setShowAdvanced(v => !v)}>
          {showAdvanced ? '收起高级' : '高级'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShowGlobalPanel(v => !v)}>
          {showGlobalPanel ? '收起全局参数' : '全局参数'}
        </Button>
        {/* 保存（手动兜底） */}
        <Button size="sm" variant="outline" disabled={disabled || !dirty || saving || isPending} onClick={() => startTransition(() => save(false))}>
          {saving ? '保存中…' : (dirty ? '保存分镜（字幕/样式覆盖）' : '已保存')}
        </Button>
      </div>
      )}

      {/* 全局：字幕与音频（简单模式下不显示） */}
      {(!simple && showGlobalPanel) && (
      <div className="rounded border bg-card p-3 text-sm transition-all hover:shadow-sm">
        <div className="mb-2 font-medium">字幕与音频（全局）</div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4" checked={gSubtitleEnabled} onChange={e => setGSubtitleEnabled(e.target.checked)} />
            启用字幕
          </label>
          <label className="flex items-center gap-2">
            <span className="w-24 text-muted-foreground">位置</span>
            <div className="flex-1">
              <Select value={gSubtitlePosition} onValueChange={(v) => setGSubtitlePosition(v as any)}>
                <SelectTrigger className="h-8"><SelectValue placeholder="bottom" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bottom">底部</SelectItem>
                  <SelectItem value="center">居中</SelectItem>
                  <SelectItem value="top">顶部</SelectItem>
                  <SelectItem value="custom">自定义</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </label>
          {gSubtitlePosition === 'custom' && (
            <label className="flex items-center gap-2">
              <span className="w-24 text-muted-foreground">纵向位置</span>
              <div className="flex-1 flex items-center gap-2">
                <Slider value={[gSubtitleCustomPos]} min={0} max={100} step={1} onValueChange={(v) => setGSubtitleCustomPos(v?.[0] ?? 70)} />
                <span className="w-10 text-right tabular-nums">{Math.round(gSubtitleCustomPos)}%</span>
              </div>
            </label>
          )}
          <label className="flex items-center gap-2">
            <span className="w-24 text-muted-foreground">时移(秒)</span>
            <Input type="number" className="h-8" min={-5} max={5} step={0.1} value={gSubtitleOffset} onChange={e => setGSubtitleOffset(Number(e.target.value || 0))} />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-24 text-muted-foreground">字体</span>
            <div className="flex-1">
              <Select value={gFontName || (defaultFont || 'STHeitiMedium.ttc')} onValueChange={setGFontName}>
                <SelectTrigger className="h-8"><SelectValue placeholder={defaultFont || 'STHeitiMedium.ttc'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={defaultFont || 'STHeitiMedium.ttc'}>{defaultFont || 'STHeitiMedium.ttc'}</SelectItem>
                  {fontOptions.map(f => (<SelectItem key={f} value={f}>{f}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </label>
          <label className="flex items-center gap-2">
            <span className="w-24 text-muted-foreground">字号</span>
            <Input type="number" className="h-8" min={12} max={120} value={gFontSize} onChange={e => setGFontSize(Math.max(12, Math.min(120, Number(e.target.value || 60))))} />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-24 text-muted-foreground">描边</span>
            <Input type="number" className="h-8" min={0} max={8} step={0.5} value={gStrokeWidth} onChange={e => setGStrokeWidth(Math.max(0, Math.min(8, Number(e.target.value || 0))))} />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-24 text-muted-foreground">文字颜色</span>
            <Input type="text" className="h-8" value={gTextColor} onChange={e => setGTextColor(e.target.value)} />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-24 text-muted-foreground">描边颜色</span>
            <Input type="text" className="h-8" value={gStrokeColor} onChange={e => setGStrokeColor(e.target.value)} />
          </label>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4" checked={gTextBgEnabled} onChange={e => setGTextBgEnabled(e.target.checked)} /> 背景框
            </label>
            {gTextBgEnabled && (
              <>
                <span className="w-24 text-muted-foreground">背景色</span>
                <Input type="text" className="h-8" value={gTextBgColor} onChange={e => setGTextBgColor(e.target.value)} />
              </>
            )}
          </div>
          <div className="col-span-full h-px bg-muted" />
          <label className="flex items-center gap-2">
            <span className="w-24 text-muted-foreground">BGM 音量</span>
            <div className="flex-1 flex items-center gap-2">
              <Slider value={[Math.round((gBgmVolume || 0) * 100)]} min={0} max={100} step={1} onValueChange={(v) => setGBgmVolume((v?.[0] ?? 0) / 100)} />
              <span className="w-10 text-right tabular-nums">{Math.round((gBgmVolume || 0) * 100)}%</span>
            </div>
          </label>
          <label className="flex items-center gap-2">
            <span className="w-24 text-muted-foreground">淡入</span>
            <Input type="number" className="h-8" min={0} max={10} step={0.5} value={gBgmFadeIn} onChange={e => setGBgmFadeIn(Number(e.target.value || 0))} />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-24 text-muted-foreground">淡出</span>
            <Input type="number" className="h-8" min={0} max={10} step={0.5} value={gBgmFadeOut} onChange={e => setGBgmFadeOut(Number(e.target.value || 0))} />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4" checked={gBgmDucking} onChange={e => setGBgmDucking(e.target.checked)} />
            语音下压（ducking）
          </label>
        </div>
      </div>
      )}

      {/* 时间线（复用现有组件） */}
      {(viewMode !== 'list') && (
      <MvpTimeline
        taskId={taskId}
        initialSegments={list}
        audioDuration={audioDuration}
        disabledExternally={disabled}
        baseParams={baseParams || undefined}
        selectedIds={Array.from(selected)}
        onSelectedIdsChange={(ids) => setSelected(new Set(ids))}
        hideTopActions
        hideGlobalPanel
        hidePreviewTip
        compact={simple}
        externalRenderParams={externalParams}
        onSegmentsChange={(next) => setItems(next)}
        onRegisterControls={useCallback((ctrl) => {
          ctrlRef.current = ctrl
          try {
            const st = ctrl.getState()
            setRenderState(prev => {
              const same = prev.renderMode === st.renderMode && prev.canRender === st.canRender && prev.hasErrors === st.hasErrors && prev.queue === st.queue && prev.lastPreviewUrl === st.lastPreviewUrl && prev.disabledExternally === st.disabledExternally
              return same ? prev : st
            })
            const pc = ctrl.getPreviewCount()
            setPreviewCount(prev => (prev === pc ? prev : pc))
          } catch {}
        }, [])}
      />)}

      {/* 简化模式：在时间线下方直接显示当前分镜编辑器（取代抽屉） */}
      {simple && (
        editIndex != null ? (
        <div className="rounded border bg-card p-3 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <div className="font-medium">字幕样式（本段覆盖） #{editIndex + 1}</div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={
                  !ctrlRef.current || renderState.renderMode !== null || renderState.disabledExternally
                }
                onClick={() => {
                  const sid = list[editIndex!]?.segment_id
                  if (sid) ctrlRef.current?.previewSegment(sid)
                }}
              >预览此段</Button>
              <Button size="sm" variant="ghost" onClick={() => setDrawerAdv(v => !v)}>{drawerAdv ? '收起高级' : '高级'}</Button>
              <Button size="sm" variant="ghost" onClick={closeInspector}>关闭</Button>
            </div>
          </div>

          {/* 常用参数：位置/时移/字号/文字色 */}
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2">
              <span className="w-24 text-muted-foreground">位置</span>
              <div className="flex-1">
                <Select value={pos} onValueChange={setPos}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="继承" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inherit">继承</SelectItem>
                    <SelectItem value="bottom">底部</SelectItem>
                    <SelectItem value="center">居中</SelectItem>
                    <SelectItem value="top">顶部</SelectItem>
                    <SelectItem value="custom">自定义</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </label>
            {pos === 'custom' && (
              <label className="flex items-center gap-2">
                <span className="w-24 text-muted-foreground">纵向位置%</span>
                <Input className="h-8" value={customPos} onChange={(e) => setCustomPos(e.target.value)} placeholder="0-100，空=继承" />
              </label>
            )}
            <label className="flex items-center gap-2">
              <span className="w-24 text-muted-foreground">字幕时移(秒)</span>
              <Input
                type="number"
                className="h-8"
                min={-5}
                max={5}
                step={0.1}
                value={offsetVal}
                onChange={(e) => setOffsetVal(e.target.value)}
                placeholder={`继承（${Number((baseParams as any)?.subtitle_offset ?? 0)}）`}
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="w-24 text-muted-foreground">字号</span>
              <Input
                type="number"
                className="h-8"
                min={12}
                max={120}
                value={fontSize}
                onChange={(e) => setFontSize(e.target.value)}
                placeholder={`继承（${Number((baseParams as any)?.font_size ?? 60)}）`}
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="w-24 text-muted-foreground">文字色</span>
              <Input
                className="h-8"
                value={foreColor}
                onChange={(e) => setForeColor(e.target.value)}
                placeholder={`继承（${String((baseParams as any)?.text_fore_color ?? '#FFFFFF')}）`}
              />
            </label>
          </div>

          {/* 高级参数（可选展开） */}
          {drawerAdv && (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4" checked={disableSubtitle} onChange={(e) => setDisableSubtitle(e.target.checked)} /> 禁用本段字幕
              </label>
              <label className="flex items-center gap-2">
                <span className="w-24 text-muted-foreground">字体</span>
                <div className="flex-1">
                  <Select value={fontName} onValueChange={setFontName}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="继承" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inherit">继承</SelectItem>
                      <SelectItem value={defaultFont || 'STHeitiMedium.ttc'}>{defaultFont || 'STHeitiMedium.ttc'}</SelectItem>
                      {fontOptions.map(f => (<SelectItem key={f} value={f}>{f}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </label>
              <label className="flex items-center gap-2">
                <span className="w-24 text-muted-foreground">描边宽</span>
                <Input type="number" className="h-8" value={strokeWidth} onChange={(e) => setStrokeWidth(e.target.value)} placeholder="空=继承" />
              </label>
              <label className="flex items-center gap-2">
                <span className="w-24 text-muted-foreground">描边色</span>
                <Input className="h-8" value={strokeColor} onChange={(e) => setStrokeColor(e.target.value)} placeholder="空=继承" />
              </label>
              <label className="flex items-center gap-2">
                <span className="w-24 text-muted-foreground">背景框</span>
                <div className="flex-1">
                  <Select value={bgMode} onValueChange={(v: any) => setBgMode(v)}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="继承" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inherit">继承</SelectItem>
                      <SelectItem value="none">无</SelectItem>
                      <SelectItem value="color">自定义颜色</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </label>
              {bgMode === 'color' && (
                <label className="flex items-center gap-2">
                  <span className="w-24 text-muted-foreground">背景色</span>
                  <Input className="h-8" value={bgColor} onChange={(e) => setBgColor(e.target.value)} />
                </label>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" onClick={() => { if (editIndex != null) applyDraftTo([editIndex]) }}>应用到本段</Button>
            <Button size="sm" variant="outline" disabled={selected.size === 0} onClick={() => applyDraftTo(list.map((_, idx) => selected.has(list[idx].segment_id) ? idx : -1).filter(k => k >= 0))}>批量应用到已选</Button>
            <div className="ml-auto" />
            <Button size="sm" variant="ghost" onClick={closeInspector}>关闭</Button>
          </div>

          {/* AI 文本 */}
          <div className="mt-3 rounded border bg-muted/30 p-3">
            <div className="mb-2 font-medium">AI 字幕建议（不改音频）</div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="flex items-center gap-2">
                <span className="w-24 text-muted-foreground">模式</span>
                <div className="flex-1">
                  <Select value={aiMode} onValueChange={(v: any) => setAiMode(v)}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="选择模式" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="polish">润色</SelectItem>
                      <SelectItem value="simplify">简化</SelectItem>
                      <SelectItem value="translate-zh">翻译为中文</SelectItem>
                      <SelectItem value="translate-en">翻译为英文</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </label>
              <div className="col-span-2 flex items-center gap-2">
                <Button size="sm" disabled={editIndex == null || aiLoading} onClick={() => editIndex != null && generateSuggestionFor(editIndex)}>{aiLoading ? '生成中…' : '生成建议'}</Button>
                <Button size="sm" variant="outline" disabled={selected.size === 0 || aiLoading} onClick={generateSuggestionForSelected}>为已选生成建议</Button>
                <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard?.writeText(aiSuggestion || ''); toast.success('已复制建议') }} disabled={!aiSuggestion}>复制建议</Button>
                <div className="ml-auto" />
                <Button size="sm" onClick={() => { if (editIndex != null) applySuggestionAsOverride(editIndex) }} disabled={editIndex == null || applyLoading}>{applyLoading ? '应用中…' : '应用为覆盖(v2)'}</Button>
                <Button size="sm" variant="outline" onClick={() => { if (editIndex != null) revertOverride(editIndex) }} disabled={editIndex == null || applyLoading}>回滚覆盖</Button>
              </div>
              <div className="md:col-span-3 grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">原文（该段字幕合并）</div>
                  <textarea className="h-24 w-full resize-none rounded border bg-background p-2 text-sm" value={aiOriginal} readOnly />
                </div>
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">建议（AI 生成）</div>
                  <textarea className="h-24 w-full resize-none rounded border bg-background p-2 text-sm" value={aiSuggestion} onChange={(e) => setAiSuggestion(e.target.value)} />
                </div>
              </div>
              <div className="md:col-span-3 text-xs text-muted-foreground">注：当前仅生成文本建议；后续可选择将建议覆盖到字幕文件。</div>
            </div>
          </div>
        </div>
        ) : (
          <div className="rounded border bg-card p-3 text-sm text-muted-foreground">选择一个分镜以编辑样式或生成字幕建议。</div>
        )
      )}

      {/* 列表（简单模式下不显示） */}
      {(!simple && viewMode !== 'timeline') && (
      <div className="rounded border bg-card">
        <div className="grid grid-cols-[2.4rem,3rem,6rem,1.2fr,1.6fr,6rem,7rem,6rem,8rem,7rem] items-center gap-1.5 border-b p-1.5 text-xs text-muted-foreground">
          <div>
            <input type="checkbox" className="h-4 w-4" onChange={(e) => toggleAll(e.target.checked)} checked={selected.size > 0 && selected.size === list.length} aria-label="全选" />
          </div>
          <div>#</div>
          <div>缩略图</div>
          <div>标题</div>
          {/* 精简列：隐藏描述/转场/速度 */}
          {/* <div>描述</div> */}
          <div>时长</div>
          {/* <div>转场</div>
          <div>速度</div> */}
          <div>字幕时移(秒)</div>
          <div>操作</div>
        </div>
        <div ref={listWrapRef} className="max-h-[60vh] overflow-auto" onScroll={(e) => setListScrollTop((e.currentTarget as HTMLDivElement).scrollTop)}>
          <ul>
            {topPad > 0 && (<li style={{ height: topPad }} aria-hidden />)}
            {windowed.map((s, i) => {
              const realIndex = startIndex + i
              const id = s.segment_id
              const thumb = `${API_BASE}/v1/tasks/${taskId}/segments/${id}/thumb`
              return (
                <li key={id} ref={i === 0 ? measureFirstRow : undefined} className="grid grid-cols-[2.4rem,3rem,6rem,1.2fr,1.6fr,6rem,7rem,6rem,8rem,7rem] items-center gap-1.5 border-b p-1.5 text-sm">
                  <div>
                    <input type="checkbox" className="h-4 w-4" checked={selected.has(id)} onChange={(e) => toggleOne(id, e.target.checked)} aria-label={`选择第 ${realIndex + 1} 段`} />
                  </div>
                  <div className="text-muted-foreground">#{realIndex + 1}</div>
                  <div className="h-10 w-16 overflow-hidden rounded border bg-muted">
                    <LazyThumb src={thumb} alt="thumb" className="h-full w-full object-cover" />
                  </div>
                  <div className="truncate" title={s.scene_title || ''}>{s.scene_title || '—'}</div>
                  {/* <div className="truncate" title={s.shot_desc || ''}>{s.shot_desc || '—'}</div> */}
                  <div className="tabular-nums">{Number(s.duration || 0).toFixed(2)}s</div>
                  {/* <div className="truncate">{s.transition || '—'}</div>
                  <div className="tabular-nums">{s.speed == null ? '1.0' : String(s.speed)}</div> */}
                  <div>
                    <Input
                      type="number"
                      className="h-8"
                      min={-5}
                      max={5}
                      step={0.1}
                      value={s.subtitle_offset == null ? 0 : Number(s.subtitle_offset)}
                      disabled={disabled}
                      onChange={(e) => updateOffset(realIndex, e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditIndex(realIndex)} disabled={disabled}>编辑</Button>
                    {/* 简化：批量应用入口保留在抽屉底部 */}
                  </div>
                </li>
              )
            })}
            {bottomPad > 0 && (<li style={{ height: bottomPad }} aria-hidden />)}
          </ul>
        </div>
        {list.length === 0 && (
          <div className="p-3 text-sm text-muted-foreground">暂无分镜</div>
        )}
      </div>
      )}

      {/* 抽屉：本段字幕样式覆盖（非简化模式） */}
      {!simple && (
      <Dialog open={editIndex != null} onOpenChange={(v) => setEditIndex(v ? (editIndex ?? 0) : null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>字幕样式（本段覆盖） #{editIndex != null ? editIndex + 1 : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid gap-3 md:grid-cols-3">
              {drawerAdv && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="h-4 w-4" checked={disableSubtitle} onChange={(e) => setDisableSubtitle(e.target.checked)} /> 禁用本段字幕
                </label>
              )}
              <label className="flex items-center gap-2">
                <span className="w-24 text-muted-foreground">位置</span>
                <div className="flex-1">
                  <Select value={pos} onValueChange={setPos}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="继承" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inherit">继承</SelectItem>
                      <SelectItem value="bottom">底部</SelectItem>
                      <SelectItem value="center">居中</SelectItem>
                      <SelectItem value="top">顶部</SelectItem>
                      <SelectItem value="custom">自定义</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </label>
              {pos === 'custom' && (
                <label className="flex items-center gap-2">
                  <span className="w-24 text-muted-foreground">纵向位置%</span>
                  <Input className="h-8" value={customPos} onChange={(e) => setCustomPos(e.target.value)} placeholder="0-100，空=继承" />
                </label>
              )}
              {drawerAdv && (
                <label className="flex items-center gap-2">
                  <span className="w-24 text-muted-foreground">字体</span>
                  <div className="flex-1">
                    <Select value={fontName} onValueChange={setFontName}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="继承" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inherit">继承</SelectItem>
                        <SelectItem value={defaultFont || 'STHeitiMedium.ttc'}>{defaultFont || 'STHeitiMedium.ttc'}</SelectItem>
                        {fontOptions.map(f => (<SelectItem key={f} value={f}>{f}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                </label>
              )}
              <label className="flex items-center gap-2">
                <span className="w-24 text-muted-foreground">字幕时移(秒)</span>
                <Input type="number" className="h-8" min={-5} max={5} step={0.1} value={offsetVal} onChange={(e) => setOffsetVal(e.target.value)} placeholder="空=继承" />
              </label>
              <label className="flex items-center gap-2">
                <span className="w-24 text-muted-foreground">字号</span>
                <Input type="number" className="h-8" value={fontSize} onChange={(e) => setFontSize(e.target.value)} placeholder="空=继承" />
              </label>
              <label className="flex items-center gap-2">
                <span className="w-24 text-muted-foreground">文字色</span>
                <Input className="h-8" value={foreColor} onChange={(e) => setForeColor(e.target.value)} placeholder="空=继承" />
              </label>
              <label className="flex items-center gap-2">
                <span className="w-24 text-muted-foreground">描边色</span>
                <Input className="h-8" value={strokeColor} onChange={(e) => setStrokeColor(e.target.value)} placeholder="空=继承" />
              </label>
              <label className="flex items-center gap-2">
                <span className="w-24 text-muted-foreground">描边宽</span>
                <Input type="number" className="h-8" value={strokeWidth} onChange={(e) => setStrokeWidth(e.target.value)} placeholder="空=继承" />
              </label>
              <label className="flex items-center gap-2">
                <span className="w-24 text-muted-foreground">背景框</span>
                <div className="flex-1">
                  <Select value={bgMode} onValueChange={(v: any) => setBgMode(v)}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="继承" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inherit">继承</SelectItem>
                      <SelectItem value="none">无</SelectItem>
                      <SelectItem value="color">自定义颜色</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </label>
              {bgMode === 'color' && (
                <label className="flex items-center gap-2">
                  <span className="w-24 text-muted-foreground">背景色</span>
                  <Input className="h-8" value={bgColor} onChange={(e) => setBgColor(e.target.value)} />
                </label>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => { if (editIndex != null) applyDraftTo([editIndex]) }}>应用到本段</Button>
              <Button size="sm" variant="outline" disabled={selected.size === 0} onClick={() => applyDraftTo(list.map((_, idx) => selected.has(list[idx].segment_id) ? idx : -1).filter(k => k >= 0))}>批量应用到已选</Button>
              <div className="ml-auto" />
              <Button size="sm" variant="ghost" onClick={() => setDrawerAdv(v => !v)}>{drawerAdv ? '收起高级' : '高级'}</Button>
              <Button size="sm" variant="ghost" onClick={closeInspector}>关闭</Button>
            </div>
            <div className="mt-2 rounded border bg-muted/30 p-3">
              <div className="mb-2 font-medium">AI 字幕建议（不改音频）</div>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="flex items-center gap-2">
                  <span className="w-24 text-muted-foreground">模式</span>
                  <div className="flex-1">
                    <Select value={aiMode} onValueChange={(v: any) => setAiMode(v)}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="选择模式" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="polish">润色</SelectItem>
                        <SelectItem value="simplify">简化</SelectItem>
                        <SelectItem value="translate-zh">翻译为中文</SelectItem>
                        <SelectItem value="translate-en">翻译为英文</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </label>
                <div className="col-span-2 flex items-center gap-2">
                  <Button size="sm" disabled={editIndex == null || aiLoading} onClick={() => editIndex != null && generateSuggestionFor(editIndex)}>{aiLoading ? '生成中…' : '生成建议'}</Button>
                  <Button size="sm" variant="outline" disabled={selected.size === 0 || aiLoading} onClick={generateSuggestionForSelected}>为已选生成建议</Button>
                  <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard?.writeText(aiSuggestion || ''); toast.success('已复制建议') }} disabled={!aiSuggestion}>复制建议</Button>
                  <div className="ml-auto" />
                  <Button size="sm" onClick={() => { if (editIndex != null) applySuggestionAsOverride(editIndex) }} disabled={editIndex == null || applyLoading}>{applyLoading ? '应用中…' : '应用为覆盖(v2)'}</Button>
                  <Button size="sm" variant="outline" onClick={() => { if (editIndex != null) revertOverride(editIndex) }} disabled={editIndex == null || applyLoading}>回滚覆盖</Button>
                </div>
                <div className="md:col-span-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">原文（该段字幕合并）</div>
                    <textarea className="w-full h-24 resize-none rounded border bg-background p-2 text-sm" value={aiOriginal} readOnly />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">建议（AI 生成）</div>
                    <textarea className="w-full h-24 resize-none rounded border bg-background p-2 text-sm" value={aiSuggestion} onChange={(e) => setAiSuggestion(e.target.value)} />
                  </div>
                </div>
                <div className="md:col-span-3 text-xs text-muted-foreground">注：v1 仅生成文本建议；应用到渲染将在 v2（覆盖 SRT/ASS）阶段提供。</div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      )}
    </div>
  )
}

// Minimal IntersectionObserver-based lazy image to avoid loading off-screen thumbs
function LazyThumb({ src, alt, className }: { src: string; alt?: string; className?: string }) {
  const ref = useRef<HTMLImageElement | null>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Prefer native lazy if available
    if ('loading' in HTMLImageElement.prototype) {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setVisible(true)
          io.disconnect()
          break
        }
      }
    }, { root: null, rootMargin: '200px', threshold: 0.01 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={visible ? src : ''}
      alt={alt || ''}
      loading="lazy"
      className={className}
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
    />
  )
}
