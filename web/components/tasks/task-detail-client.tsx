"use client"
import { useMemo, useState, useCallback } from 'react'
import { get, post, request } from '@/lib/api'
import { TaskStateSchema, TaskDetailWrappedSchema, SegmentItem, VideoParams } from '@/lib/schemas'
import SequenceEditor from '@/components/sequence/sequence-editor'
import { useQuery } from '@tanstack/react-query'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useRouter, usePathname } from 'next/navigation'
import { useUiStore } from '@/lib/store/ui'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { useI18n } from '@/components/providers/i18n-provider'
import Link from 'next/link'

type Props = {
  taskId: string
  initialTask: typeof TaskStateSchema['_type'] | null
  initialSegments: SegmentItem[]
}

export default function TaskDetailClient({ taskId, initialTask, initialSegments }: Props) {
  const { t } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const basePath = pathname?.startsWith('/edit/video/tasks') ? '/edit/video/tasks' : '/tasks'
  const queryClient = useQueryClient()
  const setBusy = useUiStore(s => s.setBusy)
  const [segmentsState, setSegmentsState] = useState<SegmentItem[]>(initialSegments)
  const query = useQuery({
    queryKey: ['task', taskId],
    queryFn: async ({ signal }) => {
      const res = await get(`/v1/tasks/${taskId}`, { signal })
      const json = await res.json()
      const parsed = TaskDetailWrappedSchema.safeParse(json)
      if (!parsed.success) throw new Error('解析任务状态失败')
      return parsed.data.data
    },
    initialData: initialTask ?? undefined,
    refetchInterval: (data) => {
      const p = (data as any)?.progress ?? 0
      const s = (data as any)?.state ?? 0
      if (s === -1) return false
      return p < 100 ? 3000 : false
    }
  })

  const task = query.data ?? null
  const progress = task?.progress ?? 0
  const state = task?.state ?? 0
  const isFailed = state === -1
  const isProcessing = state === 4 && progress < 100

  const videos = useMemo(() => task?.videos ?? [], [task])
  const combined = useMemo(() => task?.combined_videos ?? [], [task])
  const audioDuration = useMemo(() => (task as any)?.audio_duration ?? 0, [task])
  const baseParams = useMemo<VideoParams | null>(() => (task as any)?.params ?? null, [task])

  const refreshSegments = useCallback(async () => {
    try {
      const res = await get(`/v1/tasks/${taskId}/segments`)
      const json = await res.json()
      const segs = (json?.data?.segments || []) as SegmentItem[]
      setSegmentsState(segs)
    } catch {
      // ignore
    }
  }, [taskId])

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await request(`/v1/tasks/${taskId}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.message || '删除失败')
      return true
    },
    onMutate: () => setBusy(true),
    onError: (err: any) => {
      toast.error(err?.message || '删除失败')
    },
    onSuccess: async () => {
      toast.success('任务已删除')
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.removeQueries({ queryKey: ['task', taskId] })
      router.push(basePath)
    },
    onSettled: () => setBusy(false)
  })

  const retryMutation = useMutation({
    mutationFn: async () => {
      const res = await get(`/v1/tasks/${taskId}`)
      const json = await res.json()
      const params = json?.data?.params
      if (!params) throw new Error('找不到原始参数，无法重试')
      const createRes = await post('/v1/videos', params)
      const createJson = await createRes.json()
      if (!createRes.ok) throw new Error(createJson?.message || '重试创建失败')
      const newId = createJson?.data?.task_id
      if (!newId) throw new Error('解析新任务 ID 失败')
      return newId as string
    },
    onMutate: () => setBusy(true),
    onError: (err: any) => {
      toast.error(err?.message || '重试失败')
    },
    onSuccess: async (newId) => {
      toast.success('已重新创建任务')
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      await queryClient.prefetchQuery({
        queryKey: ['task', newId],
        queryFn: async () => {
          const res = await get(`/v1/tasks/${newId}`)
          const j = await res.json()
          return j?.data
        }
      })
      router.push(`${basePath}/${newId}`)
    },
    onSettled: () => setBusy(false)
  })

  // simplified view: no sticky logs/tabs
  const [saveTplOpen, setSaveTplOpen] = useState(false)
  const [duplicateOpen, setDuplicateOpen] = useState(false)

  return (
    <div className="space-y-4">
      {/* 头部状态条 */}
      <div className="rounded border bg-card p-3 md:p-4 text-sm transition-all">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="font-medium">任务 {taskId.slice(0, 8)}</div>
            <div>
              进度：{progress}%{' '}
              {isProcessing && <span className="ml-2 text-xs text-muted-foreground">（自动刷新中）</span>}
              {isFailed && <span className="ml-2 text-xs text-red-600">（失败）</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Progress value={progress} />
            <Button size="sm" variant="outline" onClick={() => setSaveTplOpen(true)}>{t('actions.saveTemplate') || '保存为模板'}</Button>
            <Button size="sm" variant="outline" onClick={() => setDuplicateOpen(true)}>{t('actions.duplicateTask') || '复刻为新任务'}</Button>
            <Button size="sm" variant="outline" disabled={retryMutation.isPending} onClick={() => retryMutation.mutate()}>重试</Button>
            <Button size="sm" variant="outline" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>删除</Button>
          </div>
        </div>
        {isFailed && (
          <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-red-700">
            生成失败：{(task as any)?.error || '后台处理失败，请查看日志或重试'}
          </div>
        )}
        {(videos.length > 0 || combined.length > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            {videos.map((u, i) => (
              <a key={i} className="text-primary underline" href={u} target="_blank">成片{i + 1}</a>
            ))}
            {combined.map((u, i) => (
              <a key={i} className="text-primary underline" href={u} target="_blank">合成{i + 1}</a>
            ))}
          </div>
        )}
      </div>

      {/* 主区：仅时间线 + 分镜配置（简化） */}
      <SequenceEditor
        taskId={taskId}
        segments={segmentsState}
        audioDuration={audioDuration}
        disabled={isProcessing}
        baseParams={baseParams}
        simple
        onSaved={() => {
          refreshSegments()
          queryClient.invalidateQueries({ queryKey: ['task', taskId] })
        }}
      />

      {/* 保存为模板占位对话框 */}
      <Dialog open={saveTplOpen} onOpenChange={setSaveTplOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dialog.comingSoon.title') || '即将上线'}</DialogTitle>
            <DialogDescription>
              {t('dialog.comingSoon.desc.saveTemplate') || '模板功能即将上线：可将当前任务参数保存为可复用模板，后续在创建页一键应用。'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button asChild variant="outline">
              <Link href="/templates" onClick={() => setSaveTplOpen(false)}>{t('actions.goToTemplates') || '前往模板中心'}</Link>
            </Button>
            <Button onClick={() => setSaveTplOpen(false)}>{t('dialog.common.ok') || '我知道了'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 复刻为新任务占位对话框 */}
      <Dialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dialog.comingSoon.title') || '即将上线'}</DialogTitle>
            <DialogDescription>
              {t('dialog.comingSoon.desc.duplicate') || '复刻功能即将上线：将以当前任务参数新建任务，后续可在创建页微调后提交。'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button asChild variant="outline">
              <Link href="/templates" onClick={() => setDuplicateOpen(false)}>{t('actions.goToTemplates') || '前往模板中心'}</Link>
            </Button>
            <Button onClick={() => setDuplicateOpen(false)}>{t('dialog.common.ok') || '我知道了'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
