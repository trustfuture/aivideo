"use client"
import { useEffect, useState, useTransition } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { get } from '@/lib/api'
import { request } from '@/lib/api'
import { ConfigWrappedSchema } from '@/lib/schemas'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [isPending, startTransition] = useTransition()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const res = await get('/v1/config')
      const json = await res.json()
      const parsed = ConfigWrappedSchema.safeParse(json)
      if (!parsed.success) throw new Error('解析配置失败')
      return parsed.data.data
    },
    refetchOnWindowFocus: false
  })

  const app = data?.app || {}
  const azure = data?.azure || {}
  const siliconflow = data?.siliconflow || {}
  const ui = data?.ui || {}

  // Form state (editable)
  const [llmProvider, setLlmProvider] = useState('')
  const [pexelsKeysInput, setPexelsKeysInput] = useState('')
  const [pixabayKeysInput, setPixabayKeysInput] = useState('')
  const [subtitleProvider, setSubtitleProvider] = useState('edge')
  const [uiLanguage, setUiLanguage] = useState('zh-CN')
  const [defaultFont, setDefaultFont] = useState('')
  const [fontOptions, setFontOptions] = useState<string[]>([])
  const [loadingFonts, setLoadingFonts] = useState(false)

  // DeepSeek vendor fields
  const [deepseekBaseUrl, setDeepseekBaseUrl] = useState('')
  const [deepseekModel, setDeepseekModel] = useState('')
  const [deepseekApiKey, setDeepseekApiKey] = useState('')
  // Azure Speech (TTS)
  const [azureSpeechRegion, setAzureSpeechRegion] = useState('')
  const [azureSpeechKey, setAzureSpeechKey] = useState('')

  // OpenAI
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState('')
  const [openaiModel, setOpenaiModel] = useState('')
  const [openaiApiKey, setOpenaiApiKey] = useState('')
  // Moonshot
  const [moonshotBaseUrl, setMoonshotBaseUrl] = useState('')
  const [moonshotModel, setMoonshotModel] = useState('')
  const [moonshotApiKey, setMoonshotApiKey] = useState('')
  // OneAPI
  const [oneapiBaseUrl, setOneapiBaseUrl] = useState('')
  const [oneapiModel, setOneapiModel] = useState('')
  const [oneapiApiKey, setOneapiApiKey] = useState('')
  // Pollinations
  const [pollinationsBaseUrl, setPollinationsBaseUrl] = useState('')
  const [pollinationsModel, setPollinationsModel] = useState('')
  const [pollinationsApiKey, setPollinationsApiKey] = useState('')
  // Ollama
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('')
  const [ollamaModel, setOllamaModel] = useState('')
  // Azure OpenAI (LLM)
  const [azureOpenaiBaseUrl, setAzureOpenaiBaseUrl] = useState('')
  const [azureOpenaiModel, setAzureOpenaiModel] = useState('')
  const [azureOpenaiVersion, setAzureOpenaiVersion] = useState('')
  const [azureOpenaiApiKey, setAzureOpenaiApiKey] = useState('')
  // Gemini
  const [geminiModel, setGeminiModel] = useState('')
  const [geminiApiKey, setGeminiApiKey] = useState('')
  // Qwen
  const [qwenModel, setQwenModel] = useState('')
  const [qwenApiKey, setQwenApiKey] = useState('')
  // G4F
  const [g4fModel, setG4fModel] = useState('')

  useEffect(() => {
    if (!data) return
    setLlmProvider(String(app.llm_provider || ''))
    setSubtitleProvider(String(app.subtitle_provider || 'edge'))
    setUiLanguage(String(ui.language || 'zh-CN'))
    setDefaultFont(String(ui.font_name || ''))
    // DeepSeek
    setDeepseekBaseUrl(String(app.deepseek_base_url || ''))
    setDeepseekModel(String(app.deepseek_model_name || ''))
    // Azure Speech
    setAzureSpeechRegion(String(azure.speech_region || ''))
    // OpenAI
    setOpenaiBaseUrl(String(app.openai_base_url || ''))
    setOpenaiModel(String(app.openai_model_name || ''))
    // Moonshot
    setMoonshotBaseUrl(String(app.moonshot_base_url || ''))
    setMoonshotModel(String(app.moonshot_model_name || ''))
    // OneAPI
    setOneapiBaseUrl(String(app.oneapi_base_url || ''))
    setOneapiModel(String(app.oneapi_model_name || ''))
    // Pollinations
    setPollinationsBaseUrl(String(app.pollinations_base_url || ''))
    setPollinationsModel(String(app.pollinations_model_name || ''))
    // Ollama
    setOllamaBaseUrl(String(app.ollama_base_url || ''))
    setOllamaModel(String(app.ollama_model_name || ''))
    // Azure OpenAI
    setAzureOpenaiBaseUrl(String(app.azure_base_url || ''))
    setAzureOpenaiModel(String(app.azure_model_name || ''))
    setAzureOpenaiVersion(String(app.azure_api_version || ''))
    // Gemini
    setGeminiModel(String(app.gemini_model_name || ''))
    // Qwen
    setQwenModel(String(app.qwen_model_name || ''))
    // G4F
    setG4fModel(String(app.g4f_model_name || ''))
    // Keys are masked on GET; leave input blank unless user overrides
  }, [data])

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

  function buildBody() {
    const body: any = { app: {} as any, azure: {} as any, ui: {} as any }
    // llm provider
    if (llmProvider && llmProvider !== app.llm_provider) body.app.llm_provider = llmProvider
    if (subtitleProvider && subtitleProvider !== app.subtitle_provider) body.app.subtitle_provider = subtitleProvider
    // keys: only send if user provided overrides
    if (pexelsKeysInput.trim()) body.app.pexels_api_keys = pexelsKeysInput.trim()
    if (pixabayKeysInput.trim()) body.app.pixabay_api_keys = pixabayKeysInput.trim()
    // deepseek vendor
    if (deepseekBaseUrl !== (app.deepseek_base_url || '')) body.app.deepseek_base_url = deepseekBaseUrl
    if (deepseekModel !== (app.deepseek_model_name || '')) body.app.deepseek_model_name = deepseekModel
    if (deepseekApiKey.trim()) body.app.deepseek_api_key = deepseekApiKey.trim()
    // azure speech
    if (azureSpeechRegion !== (azure.speech_region || '')) body.azure.speech_region = azureSpeechRegion
    if (azureSpeechKey.trim()) body.azure.speech_key = azureSpeechKey.trim()
    // openai
    if (openaiBaseUrl !== (app.openai_base_url || '')) body.app.openai_base_url = openaiBaseUrl
    if (openaiModel !== (app.openai_model_name || '')) body.app.openai_model_name = openaiModel
    if (openaiApiKey.trim()) body.app.openai_api_key = openaiApiKey.trim()
    // moonshot
    if (moonshotBaseUrl !== (app.moonshot_base_url || '')) body.app.moonshot_base_url = moonshotBaseUrl
    if (moonshotModel !== (app.moonshot_model_name || '')) body.app.moonshot_model_name = moonshotModel
    if (moonshotApiKey.trim()) body.app.moonshot_api_key = moonshotApiKey.trim()
    // oneapi
    if (oneapiBaseUrl !== (app.oneapi_base_url || '')) body.app.oneapi_base_url = oneapiBaseUrl
    if (oneapiModel !== (app.oneapi_model_name || '')) body.app.oneapi_model_name = oneapiModel
    if (oneapiApiKey.trim()) body.app.oneapi_api_key = oneapiApiKey.trim()
    // pollinations
    if (pollinationsBaseUrl !== (app.pollinations_base_url || '')) body.app.pollinations_base_url = pollinationsBaseUrl
    if (pollinationsModel !== (app.pollinations_model_name || '')) body.app.pollinations_model_name = pollinationsModel
    if (pollinationsApiKey.trim()) body.app.pollinations_api_key = pollinationsApiKey.trim()
    // ollama
    if (ollamaBaseUrl !== (app.ollama_base_url || '')) body.app.ollama_base_url = ollamaBaseUrl
    if (ollamaModel !== (app.ollama_model_name || '')) body.app.ollama_model_name = ollamaModel
    // azure openai
    if (azureOpenaiBaseUrl !== (app.azure_base_url || '')) body.app.azure_base_url = azureOpenaiBaseUrl
    if (azureOpenaiModel !== (app.azure_model_name || '')) body.app.azure_model_name = azureOpenaiModel
    if (azureOpenaiVersion !== (app.azure_api_version || '')) body.app.azure_api_version = azureOpenaiVersion
    if (azureOpenaiApiKey.trim()) body.app.azure_api_key = azureOpenaiApiKey.trim()
    // gemini
    if (geminiModel !== (app.gemini_model_name || '')) body.app.gemini_model_name = geminiModel
    if (geminiApiKey.trim()) body.app.gemini_api_key = geminiApiKey.trim()
    // qwen
    if (qwenModel !== (app.qwen_model_name || '')) body.app.qwen_model_name = qwenModel
    if (qwenApiKey.trim()) body.app.qwen_api_key = qwenApiKey.trim()
    // g4f
    if (g4fModel !== (app.g4f_model_name || '')) body.app.g4f_model_name = g4fModel
    // ui
    if (uiLanguage !== (ui.language || '')) body.ui.language = uiLanguage
    if (defaultFont !== (ui.font_name || '')) body.ui.font_name = defaultFont
    return body
  }

  async function onSave() {
    try {
      const body = buildBody()
      if (!Object.keys(body.app).length && !Object.keys(body.azure).length) {
        toast.info('没有需要保存的更改')
        return
      }
      const res = await request('/v1/config', { method: 'PUT', body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message || '保存失败')
      toast.success('设置已保存')
      await queryClient.invalidateQueries({ queryKey: ['config'] })
    } catch (e: any) {
      toast.error(e?.message || '保存失败')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">设置</h1>
        <Button disabled={isPending || isLoading} onClick={() => startTransition(onSave)}>保存</Button>
      </div>

      {isError && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">加载配置失败，请检查后端接口。</div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="space-y-3 rounded border bg-card p-4">
          <h2 className="font-medium">基础</h2>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>LLM Provider</Label>
              <Select value={llmProvider} onValueChange={setLlmProvider}>
                <SelectTrigger>
                  <SelectValue placeholder="选择 LLM 供应商" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deepseek">DeepSeek</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="moonshot">Moonshot</SelectItem>
                  <SelectItem value="oneapi">OneAPI</SelectItem>
                  <SelectItem value="azure">Azure OpenAI</SelectItem>
                  <SelectItem value="qwen">通义千问</SelectItem>
                  <SelectItem value="gemini">Gemini</SelectItem>
                  <SelectItem value="ollama">Ollama</SelectItem>
                  <SelectItem value="pollinations">Pollinations</SelectItem>
                  <SelectItem value="g4f">G4F</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>字幕 Provider</Label>
              <Select value={subtitleProvider} onValueChange={setSubtitleProvider}>
                <SelectTrigger>
                  <SelectValue placeholder="选择字幕提供商" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="edge">Edge</SelectItem>
                  <SelectItem value="whisper">Whisper</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>UI 语言</Label>
              <Select value={uiLanguage} onValueChange={setUiLanguage}>
                <SelectTrigger>
                  <SelectValue placeholder="选择语言" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh-CN">简体中文</SelectItem>
                  <SelectItem value="en-US">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded border bg-card p-4">
          <h2 className="font-medium">字幕默认值</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>默认字体</Label>
              <div>
                <Select value={defaultFont || 'default'} onValueChange={(v) => setDefaultFont(v === 'default' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingFonts ? '加载中…' : '默认'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">默认</SelectItem>
                    {defaultFont && !fontOptions.includes(defaultFont) && (
                      <SelectItem value={defaultFont}>{defaultFont}（当前配置）</SelectItem>
                    )}
                    {fontOptions.map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">来自 resource/fonts；选择“默认”使用后端默认字体。</div>
        </section>

        <section className="space-y-3 rounded border bg-card p-4">
          <h2 className="font-medium">密钥</h2>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>Pexels API Keys</Label>
          <div className="text-xs text-muted-foreground mb-1">已配置 {(app.pexels_api_keys || []).length} 个 Key</div>
              <Input type="password" value={pexelsKeysInput} onChange={(e) => setPexelsKeysInput(e.target.value)} placeholder="覆盖为：以逗号分隔多个 Key" />
            </div>
            <div className="space-y-1">
              <Label>Pixabay API Keys</Label>
              <div className="text-xs text-muted-foreground mb-1">已配置 {(app.pixabay_api_keys || []).length} 个 Key</div>
              <Input type="password" value={pixabayKeysInput} onChange={(e) => setPixabayKeysInput(e.target.value)} placeholder="覆盖为：以逗号分隔多个 Key" />
            </div>
            <div className="space-y-1">
              <Label>Azure 语音 Key（覆盖）</Label>
              <Input type="password" value={azureSpeechKey} onChange={(e) => setAzureSpeechKey(e.target.value)} placeholder="留空则不修改" />
            </div>
            <div className="space-y-1">
              <Label>Azure 区域</Label>
              <Input value={azureSpeechRegion} onChange={(e) => setAzureSpeechRegion(e.target.value)} placeholder="eastasia 等" />
            </div>
            <div className="space-y-1">
              <Label>SiliconFlow API Key</Label>
              <Input readOnly value={siliconflow.api_key || ''} placeholder="***" />
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded border bg-card p-4">
          <h2 className="font-medium">TTS（Azure）</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>区域</Label>
              <Select value={azureSpeechRegion} onValueChange={setAzureSpeechRegion}>
                <SelectTrigger>
                  <SelectValue placeholder="选择区域" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="eastasia">eastasia</SelectItem>
                  <SelectItem value="southeastasia">southeastasia</SelectItem>
                  <SelectItem value="eastus">eastus</SelectItem>
                  <SelectItem value="westus2">westus2</SelectItem>
                  <SelectItem value="westeurope">westeurope</SelectItem>
                  <SelectItem value="northeurope">northeurope</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>API Key（覆盖）</Label>
              <Input value={azureSpeechKey} onChange={(e) => setAzureSpeechKey(e.target.value)} placeholder="留空则不修改" />
            </div>
          </div>
          <div className="text-xs text-muted-foreground">如果你的区域不在列表中，可先保存后在 config.toml 中手工调整。</div>
        </section>

        <section className="space-y-3 rounded border bg-card p-4 md:col-span-2">
          <h2 className="font-medium">LLM 配置</h2>
          <ProviderForm
            provider={llmProvider}
            state={{
              // deepseek
              deepseekBaseUrl, setDeepseekBaseUrl,
              deepseekModel, setDeepseekModel,
              deepseekApiKey, setDeepseekApiKey,
              // openai
              openaiBaseUrl, setOpenaiBaseUrl,
              openaiModel, setOpenaiModel,
              openaiApiKey, setOpenaiApiKey,
              // moonshot
              moonshotBaseUrl, setMoonshotBaseUrl,
              moonshotModel, setMoonshotModel,
              moonshotApiKey, setMoonshotApiKey,
              // oneapi
              oneapiBaseUrl, setOneapiBaseUrl,
              oneapiModel, setOneapiModel,
              oneapiApiKey, setOneapiApiKey,
              // pollinations
              pollinationsBaseUrl, setPollinationsBaseUrl,
              pollinationsModel, setPollinationsModel,
              pollinationsApiKey, setPollinationsApiKey,
              // ollama
              ollamaBaseUrl, setOllamaBaseUrl,
              ollamaModel, setOllamaModel,
              // azure openai
              azureOpenaiBaseUrl, setAzureOpenaiBaseUrl,
              azureOpenaiModel, setAzureOpenaiModel,
              azureOpenaiVersion, setAzureOpenaiVersion,
              azureOpenaiApiKey, setAzureOpenaiApiKey,
              // gemini
              geminiModel, setGeminiModel,
              geminiApiKey, setGeminiApiKey,
              // qwen
              qwenModel, setQwenModel,
              qwenApiKey, setQwenApiKey,
              // g4f
              g4fModel, setG4fModel,
            }}
          />
          <div className="text-xs text-muted-foreground">出于安全考虑，已配置的密钥不会在此显示。填写后将覆盖保存。</div>
        </section>
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground">加载配置中…</div>
      )}
    </div>
  )
}

function ProviderForm({ provider, state }: {
  provider: string
  state: any
}) {
  if (provider === 'deepseek') {
    return (
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label>Base URL</Label>
          <Input value={state.deepseekBaseUrl} onChange={(e) => state.setDeepseekBaseUrl(e.target.value)} placeholder="https://api.deepseek.com" />
        </div>
        <div className="space-y-1">
          <Label>Model</Label>
          <Input value={state.deepseekModel} onChange={(e) => state.setDeepseekModel(e.target.value)} placeholder="deepseek-chat 等" />
        </div>
        <div className="space-y-1">
          <Label>API Key（覆盖）</Label>
          <Input type="password" value={state.deepseekApiKey} onChange={(e) => state.setDeepseekApiKey(e.target.value)} placeholder="留空则不修改" />
        </div>
      </div>
    )
  }

  if (provider === 'openai') {
    return (
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label>Base URL</Label>
          <Input value={state.openaiBaseUrl} onChange={(e) => state.setOpenaiBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1（可选代理）" />
        </div>
        <div className="space-y-1">
          <Label>Model</Label>
          <Input value={state.openaiModel} onChange={(e) => state.setOpenaiModel(e.target.value)} placeholder="gpt-4o-mini 等" />
        </div>
        <div className="space-y-1">
          <Label>API Key（覆盖）</Label>
          <Input type="password" value={state.openaiApiKey} onChange={(e) => state.setOpenaiApiKey(e.target.value)} placeholder="留空则不修改" />
        </div>
      </div>
    )
  }

  if (provider === 'moonshot') {
    return (
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label>Base URL</Label>
          <Input value={state.moonshotBaseUrl} onChange={(e) => state.setMoonshotBaseUrl(e.target.value)} placeholder="https://api.moonshot.cn/v1" />
        </div>
        <div className="space-y-1">
          <Label>Model</Label>
          <Input value={state.moonshotModel} onChange={(e) => state.setMoonshotModel(e.target.value)} placeholder="moonshot-v1-8k 等" />
        </div>
        <div className="space-y-1">
          <Label>API Key（覆盖）</Label>
          <Input type="password" value={state.moonshotApiKey} onChange={(e) => state.setMoonshotApiKey(e.target.value)} placeholder="留空则不修改" />
        </div>
      </div>
    )
  }

  if (provider === 'oneapi') {
    return (
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label>Base URL</Label>
          <Input value={state.oneapiBaseUrl} onChange={(e) => state.setOneapiBaseUrl(e.target.value)} placeholder="例如 https://oneapi.example.com" />
        </div>
        <div className="space-y-1">
          <Label>Model</Label>
          <Input value={state.oneapiModel} onChange={(e) => state.setOneapiModel(e.target.value)} placeholder="按 OneAPI 后端映射" />
        </div>
        <div className="space-y-1">
          <Label>API Key（覆盖）</Label>
          <Input type="password" value={state.oneapiApiKey} onChange={(e) => state.setOneapiApiKey(e.target.value)} placeholder="留空则不修改" />
        </div>
      </div>
    )
  }

  if (provider === 'pollinations') {
    return (
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label>Base URL</Label>
          <Input value={state.pollinationsBaseUrl} onChange={(e) => state.setPollinationsBaseUrl(e.target.value)} placeholder="https://pollinations.ai/api/v1" />
        </div>
        <div className="space-y-1">
          <Label>Model</Label>
          <Input value={state.pollinationsModel} onChange={(e) => state.setPollinationsModel(e.target.value)} placeholder="openai-fast 等" />
        </div>
        <div className="space-y-1">
          <Label>API Key（覆盖，可选）</Label>
          <Input type="password" value={state.pollinationsApiKey} onChange={(e) => state.setPollinationsApiKey(e.target.value)} placeholder="留空则不修改" />
        </div>
      </div>
    )
  }

  if (provider === 'ollama') {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label>Base URL</Label>
          <Input value={state.ollamaBaseUrl} onChange={(e) => state.setOllamaBaseUrl(e.target.value)} placeholder="例如 http://localhost:11434" />
        </div>
        <div className="space-y-1">
          <Label>Model</Label>
          <Input value={state.ollamaModel} onChange={(e) => state.setOllamaModel(e.target.value)} placeholder="llama3 等" />
        </div>
      </div>
    )
  }

  if (provider === 'azure') {
    return (
      <div className="grid gap-3 md:grid-cols-4">
        <div className="space-y-1">
          <Label>Base URL</Label>
          <Input value={state.azureOpenaiBaseUrl} onChange={(e) => state.setAzureOpenaiBaseUrl(e.target.value)} placeholder="形如 https://xxx.openai.azure.com/" />
        </div>
        <div className="space-y-1">
          <Label>Model/部署名</Label>
          <Input value={state.azureOpenaiModel} onChange={(e) => state.setAzureOpenaiModel(e.target.value)} placeholder="部署名，如 gpt-35-turbo" />
        </div>
        <div className="space-y-1">
          <Label>API Version</Label>
          <Input value={state.azureOpenaiVersion} onChange={(e) => state.setAzureOpenaiVersion(e.target.value)} placeholder="如 2024-02-15-preview" />
        </div>
        <div className="space-y-1">
          <Label>API Key（覆盖）</Label>
          <Input type="password" value={state.azureOpenaiApiKey} onChange={(e) => state.setAzureOpenaiApiKey(e.target.value)} placeholder="留空则不修改" />
        </div>
      </div>
    )
  }

  if (provider === 'gemini') {
    return (
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label>Model</Label>
          <Input value={state.geminiModel} onChange={(e) => state.setGeminiModel(e.target.value)} placeholder="gemini-1.0-pro 等" />
        </div>
        <div className="space-y-1">
          <Label>API Key（覆盖）</Label>
          <Input type="password" value={state.geminiApiKey} onChange={(e) => state.setGeminiApiKey(e.target.value)} placeholder="留空则不修改" />
        </div>
      </div>
    )
  }

  if (provider === 'qwen') {
    return (
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label>Model</Label>
          <Input value={state.qwenModel} onChange={(e) => state.setQwenModel(e.target.value)} placeholder="qwen-max 等" />
        </div>
        <div className="space-y-1">
          <Label>API Key（覆盖）</Label>
          <Input type="password" value={state.qwenApiKey} onChange={(e) => state.setQwenApiKey(e.target.value)} placeholder="留空则不修改" />
        </div>
      </div>
    )
  }

  if (provider === 'g4f') {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label>Model</Label>
          <Input value={state.g4fModel} onChange={(e) => state.setG4fModel(e.target.value)} placeholder="gpt-3.5-turbo 等" />
        </div>
      </div>
    )
  }

  return <div className="text-sm text-muted-foreground">选择上方的 LLM 供应商以配置连接参数。</div>
}
