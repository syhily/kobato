import { useEffect, useMemo, useRef } from 'react'

import { cn } from '@/ui/lib/cn'

export type LrcLine = [time: number, text: string]

/** Parses LRC text into sorted `[seconds, text]` lines (multi-timestamp lines
 *  fan out; `<mm:ss.xx>` word-timing tags are stripped). */
export function parseLrc(lrcInput?: string): LrcLine[] {
  if (!lrcInput) {
    return []
  }

  const lrc_s = lrcInput.replace(/([^\]^\n])\[/g, (match, p1) => p1 + '\n[')
  const lyric = lrc_s.split('\n')
  const lrc: LrcLine[] = []

  for (let i = 0; i < lyric.length; i++) {
    const lrcTimes = lyric[i].match(/\[(\d{2}):(\d{2})(\.(\d{2,3}))?]/g)
    const lrcText = lyric[i]
      .replace(/.*\[(\d{2}):(\d{2})(\.(\d{2,3}))?]/g, '')
      .replace(/<(\d{2}):(\d{2})(\.(\d{2,3}))?>/g, '')
      .replace(/^\s+|\s+$/g, '')

    if (lrcTimes) {
      for (let j = 0; j < lrcTimes.length; j++) {
        const oneTime = /\[(\d{2}):(\d{2})(\.(\d{2,3}))?]/.exec(lrcTimes[j])
        if (!oneTime) {
          continue
        }
        const min2sec = Number(oneTime[1]) * 60
        const sec2sec = parseInt(oneTime[2], 10)
        const msec2sec = oneTime[4] ? parseInt(oneTime[4], 10) / (oneTime[4].length === 2 ? 100 : 1000) : 0
        lrc.push([min2sec + sec2sec + msec2sec, lrcText])
      }
    }
  }

  lrc.sort((a, b) => a[0] - b[0])
  return lrc
}

export type LyricsPanelProps = {
  lrc: string
  currentTime: number
  onSeek: (second: number) => void
}

/** Synced scrolling lyrics: the active line is highlighted and kept centered;
 *  clicking a line seeks to its timestamp. */
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
    active?.scrollIntoView({ behavior: 'smooth', block: 'center' })
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
