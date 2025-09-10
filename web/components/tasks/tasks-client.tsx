"use client"
import Link from 'next/link'
import { useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useQuery, keepPreviousData, useQueryClient, useMutation } from '@tanstack/react-query'
import { get } from '@/lib/api'
import { TasksWrappedSchema, TaskItem } from '@/lib/schemas'
import { Empty } from '@/components/ui/empty'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { request, post } from '@/lib/api'

type TasksResult = { tasks: TaskItem[]; total: number; page: number; page_size: number }

async function fetchTasks(page: number, pageSize: number, signal?: AbortSignal): Promise<TasksResult> {
  const res = await get('/v1/tasks', { searchParams: { page, page_size: pageSize }, signal })
  const json = await res.json()
  const parsed = TasksWrappedSchema.safeParse(json)
  if (!parsed.success) throw new Error('解析任务列表失败')
  return parsed.data.data
}

export default function TasksClient() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const queryClient = useQueryClient()

  const page = Math.max(1, Number(searchParams.get('page') || '1'))
  const pageSize = Math.max(1, Math.min(50, Number(searchParams.get('page_size') || '10')))

  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ['tasks', { page, pageSize }],
    queryFn: ({ signal }) => fetchTasks(page, pageSize, signal),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    refetchInterval: () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') return 10000
      return false
    }
  })

  const tasks = data?.tasks ?? []
  const total = data?.total ?? 0
  const p = data?.page ?? page
  const page_size = data?.page_size ?? pageSize
  const totalPages = Math.max(1, Math.ceil((total || 0) / page_size))

  function pushPage(next: number) {
    const params = new URLSearchParams(searchParams)
    params.set('page', String(next))
    params.set('page_size', String(page_size))
    router.push(`/tasks?${params.toString()}`)
  }

  const nextPage = useMemo(() => Math.min(totalPages, p + 1), [p, totalPages])
  const prevPage = useMemo(() => Math.max(1, p - 1), [p])

  const prefetch = (targetPage: number) => {
    queryClient.prefetchQuery({
      queryKey: ['tasks', { page: targetPage, pageSize: page_size }],
      queryFn: () => fetchTasks(targetPage, page_size)
    })
  }

  // 删除任务：乐观更新，失败回滚
  const deleteMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const res = await request(`/v1/tasks/${taskId}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.message || '删除失败')
      return taskId
    },
    onMutate: async (taskId: string) => {
      const prevSnapshots: Array<{ key: any; data: TasksResult | undefined }> = []
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      queryClient.getQueryCache().findAll({ queryKey: ['tasks'] }).forEach((q) => {
        const key = q.queryKey
        const data = queryClient.getQueryData<TasksResult>(key)
        prevSnapshots.push({ key, data })
        if (!data) return
        const next: TasksResult = {
          ...data,
          tasks: data.tasks.filter((t) => t.task_id !== taskId),
          total: Math.max(0, (data.total || 0) - 1)
        }
        queryClient.setQueryData(key, next)
      })
      return { prevSnapshots }
    },
    onError: (err: any, _taskId, ctx) => {
      ctx?.prevSnapshots?.forEach((snap: any) => {
        queryClient.setQueryData(snap.key, snap.data)
      })
      toast.error(err?.message || '删除失败')
    },
    onSuccess: () => {
      toast.success('任务已删除')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    }
  })

  // 重试任务：读取原参数并重新创建，成功后跳详情
  const retryMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const detailRes = await get(`/v1/tasks/${taskId}`)
      const detailJson = await detailRes.json()
      const params = detailJson?.data?.params
      if (!params) throw new Error('找不到原始参数，无法重试')
      const createRes = await post('/v1/videos', params)
      const createJson = await createRes.json()
      if (!createRes.ok) throw new Error(createJson?.message || '重试创建失败')
      const newId = createJson?.data?.task_id
      if (!newId) throw new Error('解析新任务 ID 失败')
      return newId as string
    },
    onSuccess: async (newId) => {
      toast.success('已重新创建任务')
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      // 预取新任务详情
      await queryClient.prefetchQuery({
        queryKey: ['task', newId],
        queryFn: async () => {
          const res = await get(`/v1/tasks/${newId}`)
          const json = await res.json()
          return json?.data
        }
      })
      router.push(`/tasks/${newId}`)
    },
    onError: (err: any) => {
      toast.error(err?.message || '重试失败')
    }
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">任务列表</h1>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>刷新</Button>
      </div>

      {isError && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">加载失败，请重试。</div>
      )}

      {!data || tasks.length === 0 ? (
        <Empty title="暂无任务" description="创建一个任务以开始生成视频。" />
      ) : (
        <div className="space-y-3">
          <ul className="divide-y rounded border bg-white">
            {tasks.map((t) => (
              <li key={t.task_id} className="flex items-center gap-4 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{t.task_id}</div>
                  <div className="truncate text-neutral-600">进度 {t.progress ?? 0}%</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {(t.videos || []).map((u, i) => (
                      <a key={i} className="text-blue-600 underline" href={u} target="_blank">成片{i + 1}</a>
                    ))}
                    {(t.combined_videos || []).map((u, i) => (
                      <a key={i} className="text-blue-600 underline" href={u} target="_blank">合成{i + 1}</a>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link className="rounded border px-3 py-1" href={`/tasks/${t.task_id}`}>详情</Link>
                  <Button
                    variant="outline"
                    onClick={() => retryMutation.mutate(t.task_id)}
                    disabled={retryMutation.isPending}
                  >重试</Button>
                  <Button
                    variant="outline"
                    onClick={() => deleteMutation.mutate(t.task_id)}
                    disabled={deleteMutation.isPending}
                  >删除</Button>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between text-sm text-neutral-600">
            <div>
              第 {p} / {totalPages} 页 · 共 {total} 项 {isFetching && <span className="ml-2 text-xs">加载中…</span>}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                disabled={p <= 1}
                onMouseEnter={() => prefetch(prevPage)}
                onClick={() => pushPage(prevPage)}
              >上一页</Button>
              <Button
                variant="outline"
                disabled={p >= totalPages}
                onMouseEnter={() => prefetch(nextPage)}
                onClick={() => pushPage(nextPage)}
              >下一页</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
