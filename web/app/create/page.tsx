"use client"
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { post, get, API_BASE } from '@/lib/api'
import { TaskCreateWrappedSchema, SegmentsPlanWrappedSchema, TaskDetailWrappedSchema, VideoScriptWrappedSchema, VideoTermsWrappedSchema } from '@/lib/schemas'
import { toast } from 'sonner'
import { z } from 'zod'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
// no material list import: local upload is a simple picker now
import { useUiStore } from '@/lib/store/ui'
import { Progress } from '@/components/ui/progress'
import { LoadingSpinner } from '@/components/ui/loading'

export default function CreatePage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const busy = useUiStore(s => s.busy)
  const setBusy = useUiStore(s => s.setBusy)
  const [videoSubject, setVideoSubject] = useState('春天的花海')
  const [videoAspect, setVideoAspect] = useState('9:16')
  const [concatMode, setConcatMode] = useState<'random' | 'sequential'>('random')
  const [transitionMode, setTransitionMode] = useState<string | null>(null)
  const [clipDuration, setClipDuration] = useState(5)
  const [videoCount, setVideoCount] = useState(1)
  const [videoSource, setVideoSource] = useState('pexels')
  const [script, setScript] = useState('')
  const [videoLanguage, setVideoLanguage] = useState('')
  const [terms, setTerms] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const queryClient = useQueryClient()

  // Audio/TTS settings
  const [ttsServer, setTtsServer] = useState<'azure-tts-v1' | 'azure-tts-v2' | 'siliconflow'>('azure-tts-v1')
  const [voiceName, setVoiceName] = useState('')
  const [voiceRate, setVoiceRate] = useState(1.0)
  const [voiceVolume, setVoiceVolume] = useState(1.0)
  const [voices, setVoices] = useState<string[]>([])
  const [isLoadingVoices, setIsLoadingVoices] = useState(false)

  // BGM
  const [bgmType, setBgmType] = useState<'none' | 'random' | 'custom'>('random')
  const [bgmVolume, setBgmVolume] = useState(0.2)
  const [bgmFile, setBgmFile] = useState('')
  const [bgmList, setBgmList] = useState<{ name: string; file: string }[]>([])
  const [isLoadingBgms, setIsLoadingBgms] = useState(false)
  const [uploadingBgm, setUploadingBgm] = useState(false)
  const [bgmUploadProgress, setBgmUploadProgress] = useState(0)
  // Local materials (when video_source = 'local') — only track current-session uploads
  type Mat = { name: string; file: string; duration?: number }
  const [materials, setMaterials] = useState<Mat[]>([])
  const [selectedMaterialFiles, setSelectedMaterialFiles] = useState<Set<string>>(new Set())
  const [uploadingMaterials, setUploadingMaterials] = useState(false)
  const [materialsUploadProgress, setMaterialsUploadProgress] = useState(0)
  const [materialsUploadingName, setMaterialsUploadingName] = useState<string>('')

  const createAbortRef = useRef<AbortController | null>(null)

  const Schema = z.object({
    video_subject: z.string().min(1, '主题不能为空'),
    video_script: z.string().optional().nullable(),
    video_language: z.string().optional().nullable(),
    video_aspect: z.enum(['9:16', '16:9', '1:1']),
    video_concat_mode: z.enum(['random', 'sequential']),
    video_transition_mode: z.string().optional().nullable(),
    video_clip_duration: z.number().min(1, '单段时长必须 ≥ 1'),
    video_count: z.number().min(1).max(5),
    video_source: z.enum(['pexels', 'pixabay', 'local']),
    subtitle_enabled: z.boolean().optional(),
    voice_name: z.string().optional(),
    voice_rate: z.number().min(0.5).max(2).optional(),
    voice_volume: z.number().min(0.6).max(5.0).optional(),
    video_terms: z.string().optional().nullable(),
    video_materials: z.array(z.object({ url: z.string(), provider: z.string().optional(), duration: z.number().optional().nullable() })).optional(),
    bgm_type: z.enum(['none', 'random', 'custom']),
    bgm_file: z.string().optional().nullable(),
    bgm_volume: z.number().min(0).max(1)
  })

  async function loadVoices(server: string) {
    try {
      setIsLoadingVoices(true)
      setBusy(true)
      const res = await get('/v1/voices', { searchParams: { server } })
      const json = await res.json()
      const list = (json?.data?.voices as string[]) || []
      setVoices(list)
      // default select first acceptable voice
      if (list.length > 0) setVoiceName((prev) => prev || list[0])
    } catch (e) {
      setVoices([])
    } finally {
      setIsLoadingVoices(false)
      setBusy(false)
    }
  }

  useEffect(() => {
    loadVoices(ttsServer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsServer])

  async function loadBgms() {
    try {
      setIsLoadingBgms(true)
      setBusy(true)
      const res = await get('/v1/musics')
      const json = await res.json()
      const items = (json?.data?.files as any[]) || []
      setBgmList(items.map((i: any) => ({ name: i.name, file: i.file })))
    } catch {
      setBgmList([])
    } finally {
      setIsLoadingBgms(false)
      setBusy(false)
    }
  }

  useEffect(() => {
    loadBgms()
  }, [])

  // No auto-load of library materials; only upload via file picker

  // Helper: upload with progress via XHR
  async function xhrUpload(path: string, form: FormData, onProgress?: (loaded: number, total: number) => void): Promise<any> {
    const url = `${API_BASE}${path}`
    return await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', url)
      xhr.onload = () => {
        try {
          const json = JSON.parse(xhr.responseText || '{}')
          if (xhr.status >= 200 && xhr.status < 300) resolve(json)
          else reject(new Error(json?.message || `上传失败（${xhr.status}）`))
        } catch (e: any) {
          if (xhr.status >= 200 && xhr.status < 300) resolve({})
          else reject(new Error(e?.message || '上传失败'))
        }
      }
      xhr.onerror = () => reject(new Error('网络错误'))
      if (onProgress) {
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) onProgress(evt.loaded, evt.total)
        }
      }
      xhr.send(form)
    })
  }

  async function create(endpoint: 'plan' | 'video') {
    // Build base payload
    const basePayload = {
      video_subject: videoSubject,
      video_script: script || undefined,
      video_language: videoLanguage || undefined,
      video_aspect: videoAspect,
      video_concat_mode: concatMode,
      video_transition_mode: transitionMode || undefined,
      video_clip_duration: Number(clipDuration) || 5,
      video_count: Number(videoCount) || 1,
      video_source: videoSource,
      subtitle_enabled: true,
      // Provide sane defaults for TTS to avoid backend errors
      voice_name: voiceName || 'zh-CN-XiaoyiNeural-Female',
      voice_rate: Number(voiceRate) || 1.0,
      voice_volume: Number(voiceVolume) || 1.0,
      video_terms: terms || undefined,
      bgm_type: bgmType,
      bgm_file: bgmType === 'custom' ? (bgmFile || undefined) : undefined,
      bgm_volume: Number(bgmVolume)
    }
    // add local materials if needed
    if (videoSource === 'local') {
      const selected = materials.filter(m => selectedMaterialFiles.has(m.file))
      if (selected.length === 0) {
        toast.error('请选择本地素材')
        return
      }
      ;(basePayload as any).video_materials = selected.map(m => ({ provider: 'local', url: m.file, duration: m.duration }))
    }

    const parsed = Schema.safeParse(basePayload)
    if (!parsed.success) {
      const msgs = parsed.error.issues.map(i => i.message)
      setErrors(msgs)
      toast.error('请检查表单填写')
      return
    } else {
      setErrors([])
    }
    try {
      setBusy(true)
      const controller = new AbortController()
      createAbortRef.current = controller
      const path = endpoint === 'plan' ? '/v1/segments/plan' : '/v1/videos'
      const body = { ...basePayload, bgm_type: bgmType === 'none' ? '' : bgmType }
      const res = await post(path, body, { signal: controller.signal })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message || '请求失败')
      let taskId: string | undefined
      if (endpoint === 'plan') {
        const parsed = SegmentsPlanWrappedSchema.safeParse(json)
        if (parsed.success) taskId = parsed.data.data.task_id
      } else {
        const parsed = TaskCreateWrappedSchema.safeParse(json)
        if (parsed.success) taskId = parsed.data.data.task_id
      }
      if (!taskId) throw new Error('无法解析任务 ID')
      toast.success(endpoint === 'plan' ? '分镜已创建' : '任务已创建')
      // 列表缓存失效并预取详情
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      await queryClient.prefetchQuery({
        queryKey: ['task', taskId],
        queryFn: async () => {
          const res = await fetch((process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8080/api') + `/v1/tasks/${taskId}`)
          const j = await res.json()
          const p = TaskDetailWrappedSchema.safeParse(j)
          if (!p.success) throw new Error('解析任务失败')
          return p.data.data
        }
      })
      router.push(`/tasks/${taskId}`)
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        toast.info('已取消创建请求')
      } else {
        toast.error(e?.message || '创建失败')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">新建任务</h1>
      {errors.length > 0 && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {errors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="subject">主题</Label>
            <Input id="subject" value={videoSubject} onChange={(e) => setVideoSubject(e.target.value)} placeholder="请输入视频主题" />
          </div>
          <div className="space-y-1">
            <Label>脚本语言</Label>
            <Select value={videoLanguage || 'auto'} onValueChange={(v) => setVideoLanguage(v === 'auto' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="自动检测" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="zh-CN">简体中文 zh-CN</SelectItem>
                <SelectItem value="zh-HK">繁體中文 zh-HK</SelectItem>
                <SelectItem value="zh-TW">繁體中文 zh-TW</SelectItem>
                <SelectItem value="de-DE">Deutsch de-DE</SelectItem>
                <SelectItem value="en-US">English en-US</SelectItem>
                <SelectItem value="fr-FR">Français fr-FR</SelectItem>
                <SelectItem value="vi-VN">Tiếng Việt vi-VN</SelectItem>
                <SelectItem value="th-TH">ภาษาไทย th-TH</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="aspect">画幅</Label>
            <Select value={videoAspect} onValueChange={setVideoAspect}>
              <SelectTrigger id="aspect">
                <SelectValue placeholder="选择画幅" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="9:16">竖屏 9:16</SelectItem>
                <SelectItem value="16:9">横屏 16:9</SelectItem>
                <SelectItem value="1:1">方形 1:1</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="concat">拼接</Label>
              <Select value={concatMode} onValueChange={(v) => setConcatMode(v as any)}>
                <SelectTrigger id="concat">
                  <SelectValue placeholder="选择拼接模式" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="random">随机</SelectItem>
                  <SelectItem value="sequential">顺序</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="clip">单段时长（秒）</Label>
              <Select value={String(clipDuration)} onValueChange={(v) => setClipDuration(parseInt(v))}>
                <SelectTrigger id="clip">
                  <SelectValue placeholder="选择时长" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 9 }).map((_, i) => (
                    <SelectItem key={i} value={String(i + 2)}>{i + 2}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>转场模式</Label>
              <Select value={transitionMode ?? 'none'} onValueChange={(v) => setTransitionMode(v === 'none' ? null : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="全局转场" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">无</SelectItem>
                  <SelectItem value="Shuffle">Shuffle</SelectItem>
                  <SelectItem value="FadeIn">FadeIn</SelectItem>
                  <SelectItem value="FadeOut">FadeOut</SelectItem>
                  <SelectItem value="SlideIn">SlideIn</SelectItem>
                  <SelectItem value="SlideOut">SlideOut</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>同时生成数量</Label>
              <Select value={String(videoCount)} onValueChange={(v) => setVideoCount(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue placeholder="数量" />
                </SelectTrigger>
                <SelectContent>
                  {[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="source">素材来源</Label>
            <Select value={videoSource} onValueChange={setVideoSource}>
              <SelectTrigger id="source">
                <SelectValue placeholder="选择素材来源" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pexels">Pexels</SelectItem>
                <SelectItem value="pixabay">Pixabay</SelectItem>
                <SelectItem value="local">本地</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {videoSource === 'local' && (
            <div className="space-y-2 rounded border bg-white p-3">
              <div className="text-sm font-medium">本地素材上传</div>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="video/*,image/*"
                  multiple
                  disabled={uploadingMaterials || busy}
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || [])
                    if (files.length === 0) return
                    setUploadingMaterials(true)
                    setMaterialsUploadProgress(0)
                    setBusy(true)
                    try {
                      let done = 0
                      const newlySelected = new Set<string>(selectedMaterialFiles)
                      const newMaterials: Mat[] = []
                      for (const f of files) {
                        setMaterialsUploadingName(f.name)
                        const fd = new FormData()
                        fd.append('file', f)
                        const json = await xhrUpload('/v1/materials', fd, (loaded, total) => {
                          const current = total ? (loaded / total) : 0
                          const overall = ((done + current) / files.length) * 100
                          setMaterialsUploadProgress(overall)
                        })
                        const data = json?.data || {}
                        const item: Mat = { name: data.name || f.name, file: data.file, duration: data.duration || undefined }
                        if (item.file) {
                          newMaterials.push(item)
                          newlySelected.add(item.file)
                        }
                        done += 1
                        setMaterialsUploadProgress((done / files.length) * 100)
                      }
                      if (newMaterials.length > 0) {
                        setMaterials(prev => [...prev, ...newMaterials])
                        setSelectedMaterialFiles(newlySelected)
                        toast.success('素材上传完成')
                      }
                    } catch (err: any) {
                      toast.error(err?.message || '上传失败')
                    } finally {
                      setUploadingMaterials(false)
                      setMaterialsUploadingName('')
                      setMaterialsUploadProgress(0)
                      setBusy(false)
                      if (e.target) (e.target as HTMLInputElement).value = ''
                    }
                  }}
                />
                {uploadingMaterials && (
                  <span className="inline-flex items-center gap-2 text-sm text-neutral-600">
                    <LoadingSpinner size={14} /> 正在上传：{materialsUploadingName} <Progress value={materialsUploadProgress} />
                  </span>
                )}
              </div>
              {materials.length > 0 && (
                <div className="text-xs text-neutral-600">已上传并选中 {selectedMaterialFiles.size} 个素材</div>
              )}
            </div>
          )}

          <div className="space-y-1">
            <Label>音频/TTS 服务器</Label>
            <Select value={ttsServer} onValueChange={(v) => setTtsServer(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="选择 TTS 服务器" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="azure-tts-v1">Azure TTS V1</SelectItem>
                <SelectItem value="azure-tts-v2">Azure TTS V2</SelectItem>
                <SelectItem value="siliconflow">SiliconFlow TTS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="flex items-center gap-2">声库 {isLoadingVoices && <span className="inline-flex items-center gap-1 text-xs text-neutral-600"><LoadingSpinner size={12} /> 加载中</span>}</Label>
            <div className="flex items-center gap-2">
              <Select value={voices.includes(voiceName) ? voiceName : undefined} onValueChange={setVoiceName}>
                <SelectTrigger>
                  <SelectValue placeholder={isLoadingVoices ? '加载中…' : (voices.length ? '选择声库' : '暂无可用声库')} />
                </SelectTrigger>
                <SelectContent>
                  {voices.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" type="button" onClick={() => loadVoices(ttsServer)} disabled={isLoadingVoices || busy}>
                {isLoadingVoices ? (<span className="inline-flex items-center gap-2"><LoadingSpinner size={14} /> 刷新中…</span>) : '刷新声库'}
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>语速</Label>
              <Input type="number" step="0.1" min={0.5} max={2.0} value={voiceRate} onChange={(e) => setVoiceRate(parseFloat(e.target.value || '1.0'))} />
            </div>
            <div className="space-y-1">
              <Label>音量</Label>
              <Input type="number" step="0.1" min={0.6} max={5.0} value={voiceVolume} onChange={(e) => setVoiceVolume(parseFloat(e.target.value || '1.0'))} />
            </div>
          </div>
          <div className="space-y-1">
            <Button variant="outline" type="button" disabled={busy} onClick={async () => {
              setBusy(true)
              try {
                if (!voiceName) throw new Error('请选择声库')
                const res = await post('/v1/tts/test', {
                  text: (script || videoSubject || 'Hello'),
                  server: ttsServer,
                  voice_name: voiceName,
                  voice_rate: Number(voiceRate) || 1.0,
                  voice_volume: Number(voiceVolume) || 1.0
                })
                const json = await res.json()
                if (!res.ok) throw new Error(json?.message || '试听失败')
                const url = json?.data?.url
                if (url) {
                  const audio = new Audio(url)
                  await audio.play()
                }
                toast.success('试听已播放')
              } catch (e: any) {
                toast.error(e?.message || '试听失败')
              } finally {
                setBusy(false)
              }
            }}>{busy ? (<span className="inline-flex items-center gap-2"><LoadingSpinner size={14} /> 处理中…</span>) : '试听'}</Button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="script">可选：自定义脚本</Label>
            <Textarea id="script" value={script} onChange={(e) => setScript(e.target.value)} placeholder="留空将自动生成脚本与音频" />
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" type="button" disabled={busy} onClick={async () => {
              setBusy(true)
              try {
                if (!videoSubject) throw new Error('请先填写主题')
                const sres = await post('/v1/scripts', { video_subject: videoSubject, video_language: videoLanguage || '', paragraph_number: 1 })
                const sjson = await sres.json()
                if (!sres.ok) throw new Error(sjson?.message || '生成脚本失败')
                const sParsed = VideoScriptWrappedSchema.safeParse(sjson)
                if (!sParsed.success) throw new Error('解析脚本失败')
                const newScript = sParsed.data.data.video_script
                setScript(newScript)
                const tres = await post('/v1/terms', { video_subject: videoSubject, video_script: newScript, amount: 5 })
                const tjson = await tres.json()
                if (!tres.ok) throw new Error(tjson?.message || '生成关键词失败')
                const tParsed = VideoTermsWrappedSchema.safeParse(tjson)
                if (!tParsed.success) throw new Error('解析关键词失败')
                setTerms((tParsed.data.data.video_terms || []).join(', '))
                toast.success('脚本与关键词已生成')
              } catch (e: any) {
                toast.error(e?.message || '生成失败')
              } finally {
                setBusy(false)
              }
            }}>{busy ? (<span className="inline-flex items-center gap-2"><LoadingSpinner size={14} /> 生成中…</span>) : '生成视频脚本与关键词'}</Button>
            <Button variant="outline" type="button" disabled={busy} onClick={async () => {
              setBusy(true)
              try {
                if (!videoSubject && !script) throw new Error('请先填写主题或脚本')
                const tres = await post('/v1/terms', { video_subject: videoSubject, video_script: script || '', amount: 5 })
                const tjson = await tres.json()
                if (!tres.ok) throw new Error(tjson?.message || '生成关键词失败')
                const tParsed = VideoTermsWrappedSchema.safeParse(tjson)
                if (!tParsed.success) throw new Error('解析关键词失败')
                setTerms((tParsed.data.data.video_terms || []).join(', '))
                toast.success('关键词已生成')
              } catch (e: any) {
                toast.error(e?.message || '生成失败')
              } finally {
                setBusy(false)
              }
            }}>{busy ? (<span className="inline-flex items-center gap-2"><LoadingSpinner size={14} /> 生成中…</span>) : '仅关键词'}</Button>
          </div>
          <div className="space-y-1">
            <Label htmlFor="terms">关键词（逗号分隔，可选）</Label>
            <Textarea id="terms" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="如 forest, sunrise, city" />
          </div>

          <div className="space-y-1">
            <Label>背景音乐</Label>
            <Select value={bgmType} onValueChange={(v) => setBgmType(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="选择 BGM 类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">无</SelectItem>
                <SelectItem value="random">随机</SelectItem>
                <SelectItem value="custom">自定义</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {bgmType === 'custom' && (
            <div className="space-y-2">
              <Label>选择本地音乐（resource/songs）</Label>
              <Select value={bgmFile} onValueChange={setBgmFile}>
                <SelectTrigger>
                  <SelectValue placeholder={isLoadingBgms ? '加载中…' : '选择一首音乐'} />
                </SelectTrigger>
                <SelectContent>
                  {bgmList.map((i) => (
                    <SelectItem key={i.file} value={i.file}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={loadBgms} disabled={isLoadingBgms || busy}>
                  {isLoadingBgms ? (
                    <span className="inline-flex items-center gap-2"><LoadingSpinner size={14} /> 刷新中…</span>
                  ) : '刷新列表'}
                </Button>
                <label className="text-sm text-neutral-600">或上传 MP3 文件：</label>
                <input
                  type="file"
                  accept="audio/mpeg"
                  disabled={uploadingBgm || busy}
                  onChange={async (e) => {
                    try {
                      const f = e.target.files?.[0]
                      if (!f) return
                      setUploadingBgm(true)
                      setBgmUploadProgress(0)
                      setBusy(true)
                      const fd = new FormData()
                      fd.append('file', f)
                      await xhrUpload('/v1/musics', fd, (loaded, total) => {
                        const p = total ? (loaded / total) * 100 : 0
                        setBgmUploadProgress(p)
                      })
                      toast.success('已上传 BGM')
                      await loadBgms()
                    } catch (err: any) {
                      toast.error(err?.message || '上传失败')
                    } finally {
                      setUploadingBgm(false)
                      setBgmUploadProgress(0)
                      setBusy(false)
                      if (e.target) e.target.value = ''
                    }
                  }}
                />
                {uploadingBgm && (
                  <span className="ml-2 inline-flex items-center gap-2 text-sm text-neutral-600">
                    <LoadingSpinner size={14} /> 上传中… <Progress value={bgmUploadProgress} />
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label>BGM 音量</Label>
            <Select value={String(bgmVolume)} onValueChange={(v) => setBgmVolume(parseFloat(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[0.0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0].map(n => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <Button disabled={isPending || busy} onClick={() => startTransition(() => create('plan'))}>{(isPending || busy) ? (<span className="inline-flex items-center gap-2"><LoadingSpinner size={14} /> 处理中…</span>) : '仅生成分镜'}</Button>
        <Button disabled={isPending || busy} variant="outline" onClick={() => startTransition(() => create('video'))}>{(isPending || busy) ? (<span className="inline-flex items-center gap-2"><LoadingSpinner size={14} /> 处理中…</span>) : '一键生成视频'}</Button>
        {isPending && (
          <Button variant="ghost" onClick={() => createAbortRef.current?.abort()}>取消</Button>
        )}
      </div>
    </div>
  )
}
