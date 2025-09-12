interface Props { params: { id: string } }

export default function Page({ params }: Props) {
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">项目详情</h1>
      <p className="text-sm text-muted-foreground">项目 ID：{params.id}</p>
      <p className="text-sm text-muted-foreground">任务、素材与版本（占位）。</p>
    </div>
  )
}

