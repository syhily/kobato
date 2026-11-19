import { cn } from '@kobato/ui/lib/cn.ts'
import { parseLrc } from '@kobato/web-public/ui/shared/music/lrc.ts'
import { useEffect, useMemo, useRef } from 'react'

export type LyricsPanelProps = {
  lrc: string
  currentTime: number
  onSeek: (second: number) => void
}

export function LyricsPanel({ lrc, currentTime, onSeek }: LyricsPanelProps) {
  const lines = useMemo(() => parseLrc(lrc), [lrc])
  const containerRef = useRef<HTMLDivElement>(null)

  const currentIndex = useMemo(() => {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (currentTime >= lines[i][0]) {
        return i
      }
    }
    return -1
  }, [currentTime, lines])

  useEffect(() => {
    const container = containerRef.current
    if (currentIndex < 0 || !container) {
      return
    }
    const active = container.children[currentIndex]
    if (!active) {
      return
    }
    const top =
      active.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop -
      container.clientHeight / 2 +
      active.clientHeight / 2
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ top, behavior: 'smooth' })
    } else {
      container.scrollTop = top
    }
  }, [currentIndex])

  if (lines.length === 0) {
    return null
  }

  return (
    <div
      ref={containerRef}
      className="max-h-44 overflow-y-auto scroll-smooth border-t border-line-muted [mask-image:linear-gradient(to_bottom,transparent,black_15%,black_85%,transparent)] px-4 py-3"
    >
      {lines.map(([time, text], index) => (
        <button
          key={`${time}-${text.slice(0, 20)}`}
          type="button"
          className={cn(
            'block w-full cursor-pointer py-0.5 text-center text-sm leading-6 transition-colors duration-300',
            index === currentIndex ? 'font-medium text-brand' : 'text-ink-4 hover:text-ink-2',
          )}
          onClick={(event) => {
            event.stopPropagation()
            onSeek(time + 0.01)
          }}
        >
          {text === '' ? ' ' : text}
        </button>
      ))}
    </div>
  )
}
