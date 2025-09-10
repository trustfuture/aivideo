import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { BRAND_NAME } from '@/lib/brand'

export default function Page() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">欢迎使用 {BRAND_NAME} Studio</h1>
      <p className="text-muted-foreground">
        这是基于 Next.js + Tailwind 的新前端。您可以在这里创建任务、管理分镜并触发预览/成片渲染。
      </p>
      <div className="flex gap-3">
        <Button asChild><Link href="/create">新建任务</Link></Button>
        <Button asChild variant="outline"><Link href="/tasks">查看任务</Link></Button>
        <Button asChild variant="outline"><Link href="/settings">设置</Link></Button>
      </div>
    </div>
  )
}
