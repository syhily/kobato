export function formatVideoDuration(duration: number): string {
  const minutes = Math.floor(duration / 60)
  const seconds = Math.floor(duration - minutes * 60)
  const paddedSeconds = String(seconds).padStart(2, '0')
  return `${minutes}:${paddedSeconds}`
}
