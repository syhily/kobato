/**
 * The `m:ss` duration format shared by the BaseVideoNode.formattedDuration
 * getter (editor surface) and the video renderer (export surface) — the
 * renderer only receives the node's dataset, so the formatting lives here
 * instead of on the node class.
 */
export function formatVideoDuration(duration: number): string {
  const minutes = Math.floor(duration / 60)
  const seconds = Math.floor(duration - minutes * 60)
  const paddedSeconds = String(seconds).padStart(2, '0')
  return `${minutes}:${paddedSeconds}`
}
