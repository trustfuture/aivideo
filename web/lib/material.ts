import { API_BASE, get, post } from '@/lib/api'
import { MaterialListWrappedSchema, MaterialUploadWrappedSchema, MaterialSearchWrappedSchema } from '@/lib/schemas'

export async function listMaterials(params?: { page?: number; page_size?: number; taskId?: string; signal?: AbortSignal }) {
  const res = await get('/v1/materials', { searchParams: { page: params?.page ?? 1, page_size: params?.page_size ?? 50, task_id: params?.taskId }, signal: params?.signal })
  const json = await res.json()
  const parsed = MaterialListWrappedSchema.safeParse(json)
  if (!parsed.success) throw new Error('素材列表解析失败')
  return parsed.data.data
}

export async function uploadMaterial(file: File, opts?: { taskId?: string; signal?: AbortSignal }) {
  const fd = new FormData()
  fd.append('file', file)
  const url = new URL(`${API_BASE}/v1/materials`)
  if (opts?.taskId) url.searchParams.set('task_id', opts.taskId)
  const res = await fetch(url.toString(), { method: 'POST', body: fd, signal: opts?.signal })
  const json = await res.json()
  const parsed = MaterialUploadWrappedSchema.safeParse(json)
  if (!parsed.success) throw new Error(json?.message || '素材上传失败')
  return parsed.data.data
}

export async function searchMaterials(params: { q: string; source?: 'pexels' | 'pixabay'; min_dur?: number; aspect?: '9:16' | '16:9' | '1:1'; signal?: AbortSignal }) {
  const res = await get('/v1/materials/search', {
    searchParams: { q: params.q, source: params.source ?? 'pexels', min_dur: params.min_dur ?? 3, aspect: params.aspect ?? '9:16' },
    signal: params.signal
  })
  const json = await res.json()
  const parsed = MaterialSearchWrappedSchema.safeParse(json)
  if (!parsed.success) throw new Error(json?.message || '素材检索失败')
  return parsed.data.data
}

export async function downloadMaterial(params: { url: string; taskId?: string; signal?: AbortSignal }) {
  const res = await post('/v1/materials/download', { url: params.url, task_id: params.taskId }, { signal: params.signal })
  const json = await res.json()
  const parsed = MaterialUploadWrappedSchema.safeParse(json)
  if (!parsed.success) throw new Error(json?.message || '素材下载失败')
  return parsed.data.data
}

