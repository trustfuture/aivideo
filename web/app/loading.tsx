import { LoadingSpinner } from '@/components/ui/loading'

export default function Loading() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-neutral-600">
        <LoadingSpinner />
        <span>页面加载中…</span>
      </div>
    </div>
  )
}

