export function LoadingSpinner({ size = 20 }: { size?: number }) {
  const px = `${size}px`
  return (
    <div
      role="status"
      aria-label="loading"
      className="inline-block animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-800"
      style={{ width: px, height: px }}
    />
  )
}

