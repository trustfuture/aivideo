import { get } from '@/lib/api'
import { SegmentsPlanWrappedSchema, TaskDetailWrappedSchema, SegmentItem } from '@/lib/schemas'
import dynamic from 'next/dynamic'

const TaskDetailClient = dynamic(() => import('@/components/tasks/task-detail-client'), { ssr: false })

interface Props { params: { id: string } }

async function fetchTask(id: string) {
  try {
    const res = await get(`/v1/tasks/${id}`)
    const json = await res.json()
    const data = TaskDetailWrappedSchema.safeParse(json)
    return data.success ? data.data.data : null
  } catch {
    return null
  }
}

async function fetchSegments(id: string) {
  try {
    const res = await get(`/v1/tasks/${id}/segments`)
    const json = await res.json()
    const data = SegmentsPlanWrappedSchema.safeParse(json)
    return data.success ? (data.data.data.segments as SegmentItem[]) : []
  } catch {
    return []
  }
}

export default async function TaskDetailPage({ params }: Props) {
  const task = await fetchTask(params.id)
  const segments = await fetchSegments(params.id)
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">任务详情 #{params.id}</h1>
      <TaskDetailClient taskId={params.id} initialTask={task} initialSegments={segments} />
    </div>
  )
}
