import type { RefObject } from 'react'

export interface AudioPreviewPlayerProps {
  audioRef: RefObject<HTMLAudioElement | null>
  onLoadedMetadata: (duration: number) => void
  onTimeUpdate: (currentTime: number) => void
  onEnded: () => void
  onPause: (currentTime: number) => void
}

/**
 * Hidden inline preview audio. Rendered once and re-targeted as the
 * admin clicks "试听"; pause + clear on dialog close. Lives outside
 * the scroll region so a long result list does not push it off-screen.
 * `loadedmetadata` / `timeupdate` populate the inline progress bar
 * shown under the currently-playing row.
 */
export function AudioPreviewPlayer({ audioRef, onLoadedMetadata, onTimeUpdate, onEnded, onPause }: AudioPreviewPlayerProps) {
  return (
    <audio
      ref={audioRef}
      aria-label="音乐预览"
      onLoadedMetadata={(event) => {
        // Capture into a local before scheduling the state update.
        // React reuses the synthetic event after the handler returns,
        // so reading `event.currentTarget` from inside the
        // functional `setState` updater can hit a nulled reference.
        const duration = event.currentTarget.duration
        onLoadedMetadata(Number.isFinite(duration) && duration > 0 ? duration : 0)
      }}
      onTimeUpdate={(event) => {
        onTimeUpdate(event.currentTarget.currentTime)
      }}
      onEnded={onEnded}
      onPause={(event) => {
        onPause(event.currentTarget.currentTime)
      }}
    >
      <track kind="captions" />
    </audio>
  )
}
