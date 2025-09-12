import { z } from 'zod'

// Enums aligned with backend schema.py
export const VideoAspectEnum = z.enum(['16:9', '9:16', '1:1'])
export const VideoConcatModeEnum = z.enum(['random', 'sequential'])
export const VideoTransitionModeEnum = z.enum(['Shuffle', 'FadeIn', 'FadeOut', 'SlideIn', 'SlideOut', 'Mask'])

// Material info used when source is local or preselected
export const MaterialInfoSchema = z.object({
  provider: z.string(),
  url: z.string(),
  duration: z.number().optional().nullable(),
  thumb: z.string().optional().nullable()
})

// Full VideoParams shape (kept permissive for optional fields)
export const VideoParamsSchema = z.object({
  video_subject: z.string(),
  video_script: z.string().optional().nullable(),
  video_terms: z.union([z.string(), z.array(z.string())]).optional().nullable(),
  video_aspect: VideoAspectEnum.optional().nullable(),
  video_concat_mode: VideoConcatModeEnum.optional().nullable(),
  video_transition_mode: VideoTransitionModeEnum.optional().nullable(),
  video_clip_duration: z.number().optional().nullable(),
  video_count: z.number().optional().nullable(),

  video_source: z.string().optional().nullable(),
  video_materials: z.array(MaterialInfoSchema).optional().nullable(),

  video_language: z.string().optional().nullable(),

  voice_name: z.string().optional().nullable(),
  voice_volume: z.number().optional().nullable(),
  voice_rate: z.number().optional().nullable(),
  bgm_type: z.string().optional().nullable(),
  bgm_file: z.string().optional().nullable(),
  bgm_volume: z.number().optional().nullable(),
  bgm_fade_in_sec: z.number().optional().nullable(),
  bgm_fade_out_sec: z.number().optional().nullable(),
  bgm_ducking: z.boolean().optional().nullable(),

  subtitle_enabled: z.boolean().optional().nullable(),
  subtitle_position: z.string().optional().nullable(),
  custom_position: z.number().optional().nullable(),
  subtitle_offset: z.number().optional().nullable(),
  font_name: z.string().optional().nullable(),
  text_fore_color: z.string().optional().nullable(),
  text_background_color: z.union([z.boolean(), z.string()]).optional().nullable(),
  font_size: z.number().optional().nullable(),
  stroke_color: z.string().optional().nullable(),
  stroke_width: z.number().optional().nullable(),
  n_threads: z.number().optional().nullable(),
  paragraph_number: z.number().optional().nullable()
}).strict().passthrough()

export type VideoParams = z.infer<typeof VideoParamsSchema>

export const SegmentItemSchema = z.object({
  segment_id: z.string(),
  order: z.number().int(),
  scene_title: z.string().optional().nullable(),
  shot_no: z.string().optional().nullable(),
  shot_desc: z.string().optional().nullable(),
  style: z.string().optional().nullable(),
  duration: z.number().optional().nullable(),
  // per-segment subtitle overrides (v1)
  subtitle_enabled: z.boolean().optional().nullable(),
  subtitle_position: z.string().optional().nullable(),
  custom_position: z.number().optional().nullable(),
  subtitle_offset: z.number().optional().nullable(),
  font_name: z.string().optional().nullable(),
  text_fore_color: z.string().optional().nullable(),
  text_background_color: z.union([z.boolean(), z.string()]).optional().nullable(),
  font_size: z.number().optional().nullable(),
  stroke_color: z.string().optional().nullable(),
  stroke_width: z.number().optional().nullable(),
  transition: z.string().optional().nullable(),
  transition_duration: z.number().optional().nullable(),
  transition_direction: z.enum(['left', 'right', 'top', 'bottom']).optional().nullable(),
  transition_mask: z.string().optional().nullable(),
  speed: z.number().optional().nullable(),
  fit: z.enum(['contain', 'cover', 'center']).optional().nullable(),
  material: z.any().optional().nullable(),
  start: z.number().optional().nullable(),
  end: z.number().optional().nullable(),
  subtitle_anchor: z.any().optional().nullable()
})

export const SegmentsResponseSchema = z.object({
  task_id: z.string().optional().nullable(),
  segments: z.array(SegmentItemSchema)
})

export type SegmentItem = z.infer<typeof SegmentItemSchema>

export const TaskItemSchema = z.object({
  task_id: z.string(),
  state: z.number().optional().nullable(),
  progress: z.number().optional().nullable(),
  audio_duration: z.number().optional().nullable(),
  videos: z.array(z.string()).optional().nullable(),
  combined_videos: z.array(z.string()).optional().nullable(),
  error: z.string().optional().nullable()
})

export type TaskItem = z.infer<typeof TaskItemSchema>

export const TaskStateSchema = z.object({
  state: z.number().optional(),
  progress: z.number().optional(),
  audio_duration: z.number().optional(),
  videos: z.array(z.string()).optional(),
  combined_videos: z.array(z.string()).optional(),
  error: z.string().optional(),
  // original creation params (VideoParams)
  params: VideoParamsSchema.optional().nullable()
})

// Wrapped responses from backend: { status, message, data: {...} }
export const BaseWrappedSchema = z.object({
  status: z.number(),
  message: z.string().optional(),
  data: z.any()
})

export const TaskCreateWrappedSchema = z.object({
  status: z.number(),
  data: z.object({ task_id: z.string() })
})

export const TasksWrappedSchema = z.object({
  status: z.number(),
  data: z.object({
    tasks: z.array(TaskItemSchema),
    total: z.number(),
    page: z.number(),
    page_size: z.number()
  })
})

export const TaskDetailWrappedSchema = z.object({
  status: z.number(),
  data: TaskStateSchema
})

export const SegmentsPlanWrappedSchema = z.object({
  status: z.number(),
  data: z.object({
    task_id: z.string(),
    segments: z.array(SegmentItemSchema)
  })
})

export const SegmentsRenderWrappedSchema = z.object({
  status: z.number(),
  data: z.object({
    task_id: z.string(),
    combined_video: z.string().optional().nullable(),
    final_video: z.string().optional().nullable()
  })
})

// Materials
export const MaterialItemSchema = z.object({
  name: z.string(),
  size: z.number(),
  file: z.string(),
  duration: z.number().optional().nullable()
})

export type MaterialItem = z.infer<typeof MaterialItemSchema>

export const MaterialListWrappedSchema = z.object({
  status: z.number(),
  data: z.object({
    files: z.array(MaterialItemSchema),
    total: z.number(),
    page: z.number(),
    page_size: z.number()
  })
})

export const MaterialUploadWrappedSchema = z.object({
  status: z.number(),
  data: MaterialItemSchema
})

export const MaterialSearchWrappedSchema = z.object({
  status: z.number(),
  data: z.object({
    items: z.array(z.object({ provider: z.string(), url: z.string(), duration: z.number().optional().nullable(), thumb: z.string().optional().nullable() }))
  })
})

// Config
export const ConfigWrappedSchema = z.object({
  status: z.number(),
  data: z.object({
    app: z.object({
      llm_provider: z.string().optional().nullable(),
      pexels_api_keys: z.array(z.string()).optional().nullable(),
      pixabay_api_keys: z.array(z.string()).optional().nullable(),
      subtitle_provider: z.string().optional().nullable(),
      endpoint: z.string().optional().nullable(),
      max_concurrent_tasks: z.number().optional().nullable()
    }).partial().passthrough(),
    azure: z.object({
      speech_region: z.string().optional().nullable(),
      speech_key: z.string().optional().nullable() // masked
    }).partial().passthrough(),
    siliconflow: z.object({
      api_key: z.string().optional().nullable() // masked
    }).partial().passthrough(),
    ui: z.object({
      language: z.string().optional().nullable(),
      font_name: z.string().optional().nullable(),
      text_fore_color: z.string().optional().nullable(),
      font_size: z.number().optional().nullable()
    }).partial().passthrough()
  })
})

// LLM helpers
export const VideoScriptWrappedSchema = z.object({
  status: z.number(),
  data: z.object({ video_script: z.string() })
})

export const VideoTermsWrappedSchema = z.object({
  status: z.number(),
  data: z.object({ video_terms: z.array(z.string()) })
})
