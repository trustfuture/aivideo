import Link from 'next/link'

export default function Page() {
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">生视频</h1>
      <p className="text-sm text-muted-foreground">视频生成能力占位页（参数区 + 预览即将接入）。</p>
      <p className="text-sm text-muted-foreground">当前“素材剪视频”MVP 请访问 <Link href="/edit/video/create" className="underline">/edit/video/create</Link>。</p>
    </div>
  )
}
