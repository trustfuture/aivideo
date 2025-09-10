"use client"
import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { downloadMaterial, listMaterials, searchMaterials, uploadMaterial } from '@/lib/material'
import { useUiStore } from '@/lib/store/ui'
import { LoadingSpinner } from '@/components/ui/loading'

type Picked = { file: string; duration?: number | null }

export default function MaterialPicker({ open, onOpenChange, taskId, onPicked, initialTab, initialQuery }: { open: boolean; onOpenChange: (v: boolean) => void; taskId?: string; onPicked: (v: Picked) => void; initialTab?: 'library' | 'upload' | 'online'; initialQuery?: string }) {
  const setBusy = useUiStore(s => s.setBusy)
  const [tab, setTab] = useState<'library' | 'upload' | 'online'>(initialTab || 'library')
  const [loading, setLoading] = useState(false)
  const [busyOp, setBusyOp] = useState<null | 'list' | 'search' | 'upload' | 'download'>(null)
  const [downloading, setDownloading] = useState<string | null>(null)
  // library
  const [materials, setMaterials] = useState<{ name: string; size: number; file: string; duration?: number | null }[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 50
  const pages = Math.max(1, Math.ceil(total / pageSize))
  // upload
  const inputRef = useRef<HTMLInputElement | null>(null)
  // online
  const [q, setQ] = useState(initialQuery || '')
  const [source, setSource] = useState<'pexels' | 'pixabay'>('pexels')
  const [results, setResults] = useState<{ provider: string; url: string; duration?: number | null; thumb?: string | null }[] | null>(null)
  const [libFilter, setLibFilter] = useState('')

  useEffect(() => {
    if (!open) return
    if (initialTab) setTab(initialTab)
    if (initialQuery != null) setQ(initialQuery)
  }, [open, initialTab, initialQuery])

  useEffect(() => {
    if (!open) return
    if (tab !== 'library') return
    const ac = new AbortController()
    setLoading(true)
    setBusyOp('list')
    setBusy(true)
    listMaterials({ page, page_size: pageSize, taskId, signal: ac.signal })
      .then((res) => { setMaterials(res.files); setTotal(res.total) })
      .catch((e) => toast.error(e?.message || '加载素材库失败'))
      .finally(() => { setLoading(false); setBusy(false); setBusyOp(null) })
    return () => ac.abort()
  }, [open, tab, page, taskId])

  // auto search for online if initial query provided
  useEffect(() => {
    if (!open) return
    if (tab !== 'online') return
    if (!q.trim()) return
    doSearch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab])

  function pickAndClose(p: Picked) {
    onPicked(p)
    onOpenChange(false)
  }

  async function doUpload(file: File) {
    setLoading(true)
    setBusyOp('upload')
    setBusy(true)
    try {
      const saved = await uploadMaterial(file, { taskId })
      toast.success('上传成功')
      pickAndClose({ file: saved.file, duration: saved.duration })
    } catch (e: any) {
      toast.error(e?.message || '上传失败')
    } finally {
      setLoading(false)
      setBusy(false)
      setBusyOp(null)
    }
  }

  async function doSearch() {
    if (!q.trim()) return toast.info('请输入检索关键词')
    setLoading(true)
    setBusyOp('search')
    setBusy(true)
    const ac = new AbortController()
    try {
      const { items } = await searchMaterials({ q: q.trim(), source, signal: ac.signal })
      setResults(items)
    } catch (e: any) {
      toast.error(e?.message || '检索失败')
    } finally {
      setLoading(false)
      setBusy(false)
      setBusyOp(null)
    }
  }

  async function useOnline(item: { url: string }) {
    setLoading(true)
    setBusyOp('download')
    setDownloading(item.url)
    setBusy(true)
    try {
      const saved = await downloadMaterial({ url: item.url, taskId })
      toast.success('已下载并选用')
      pickAndClose({ file: saved.file, duration: saved.duration })
    } catch (e: any) {
      toast.error(e?.message || '下载失败')
    } finally {
      setLoading(false)
      setBusy(false)
      setBusyOp(null)
      setDownloading(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>选择素材来源</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="library">素材库</TabsTrigger>
            <TabsTrigger value="upload">本地上传</TabsTrigger>
            <TabsTrigger value="online">在线检索</TabsTrigger>
          </TabsList>
          <TabsContent value="library" className="mt-4 space-y-3">
            <div className="flex items-center gap-2">
              <Input className="h-8" placeholder="筛选文件名" value={libFilter} onChange={(e) => setLibFilter(e.target.value)} />
            </div>
            {materials.length === 0 ? (
              <div className="text-sm text-neutral-600">暂无素材。</div>
            ) : (
              <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {materials.filter(m => !libFilter || m.name.toLowerCase().includes(libFilter.toLowerCase())).map((m) => (
                  <li key={m.file} className="flex items-center justify-between rounded border p-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{m.name}</div>
                      <div className="text-xs text-neutral-500">{(m.size / 1024 / 1024).toFixed(1)} MB{m.duration != null ? ` · ${m.duration.toFixed(1)}s` : ''}</div>
                    </div>
                    <Button size="sm" onClick={() => pickAndClose({ file: m.file, duration: m.duration })} disabled={loading}>使用</Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center justify-between text-sm text-neutral-600">
              <div>共 {total} 项</div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading}>上一页</Button>
                <div>第 {page} / {pages} 页</div>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages || loading}>下一页</Button>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="upload" className="mt-4 space-y-3">
            <div className="rounded border p-4 text-sm">
              <div>选择一个视频或图片文件上传至素材库：</div>
              <div className="mt-3 flex items-center gap-2">
                <Input ref={inputRef} type="file" accept="video/*,image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) doUpload(f) }} disabled={loading} />
                <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={loading}>
                  {busyOp === 'upload' ? (
                    <span className="inline-flex items-center gap-2"><LoadingSpinner size={14} /> 上传中…</span>
                  ) : '选择文件'}
                </Button>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="online" className="mt-4 space-y-3">
            <div className="flex items-center gap-2">
              <Input className="flex-1" placeholder="输入关键词，如: cat, city night" value={q} onChange={(e) => setQ(e.target.value)} disabled={loading} />
              <Select value={source} onValueChange={(v) => setSource(v as any)}>
                <SelectTrigger className="w-40"><SelectValue placeholder="选择来源" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pexels">Pexels</SelectItem>
                  <SelectItem value="pixabay">Pixabay</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={doSearch} disabled={loading}>
                {busyOp === 'search' ? (
                  <span className="inline-flex items-center gap-2"><LoadingSpinner size={14} /> 检索中…</span>
                ) : '检索'}
              </Button>
            </div>
            {results && results.length === 0 && <div className="text-sm text-neutral-600">未找到素材。</div>}
            {results && results.length > 0 && (
              <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {results.map((r) => (
                  <li key={r.url} className="flex items-center gap-3 rounded border p-2">
                    <div className="h-14 w-24 shrink-0 overflow-hidden rounded bg-neutral-100">
                      {r.thumb ? (
                        <img src={r.thumb} alt="thumb" className="h-14 w-24 object-cover" />
                      ) : (
                        <div className="flex h-14 w-24 items-center justify-center text-xs text-neutral-400">无缩略图</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{new URL(r.url).hostname}</div>
                      <div className="text-xs text-neutral-500">{r.provider} {r.duration != null ? `· ${r.duration.toFixed(1)}s` : ''}</div>
                      <div className="truncate text-xs text-neutral-500">{r.url}</div>
                    </div>
                    <Button size="sm" onClick={() => useOnline(r)} disabled={loading || downloading === r.url}>
                      {downloading === r.url ? (
                        <span className="inline-flex items-center gap-2"><LoadingSpinner size={14} /> 下载中…</span>
                      ) : '下载并使用'}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
