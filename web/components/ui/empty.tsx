import { cn } from '@/lib/utils'

type EmptyProps = {
  title?: string
  description?: string
  className?: string
}

export function Empty({ title = '暂无数据', description = '这里还空空如也～', className }: EmptyProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded border bg-white p-8 text-center text-sm text-neutral-600', className)}>
      <div className="text-base font-medium text-neutral-900">{title}</div>
      <div className="mt-1 text-neutral-600">{description}</div>
    </div>
  )}

