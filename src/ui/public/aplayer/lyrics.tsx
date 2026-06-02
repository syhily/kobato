import { useMemo } from 'react'

import { cn } from '@/ui/lib/cn'

export type LyricsProps = {
  show: boolean
  lrcText?: string
  currentTime: number
}

export function Lyrics({ show, lrcText, currentTime }: LyricsProps) {
  const lines = useMemo(() => parseLrc(lrcText), [lrcText])

  const currentLineIndex = useMemo(() => {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const nextLine = lines[i + 1]
      if (currentTime >= line[0] && (!nextLine || currentTime < nextLine[0])) {
        return i
      }
    }
    return 0
  }, [currentTime, lines])

  const transformStyle = useMemo<React.CSSProperties>(
    () => ({
      transform: `translateY(${-currentLineIndex * 16}px)`,
      WebkitTransform: `translateY(${-currentLineIndex * 16}px)`,
    }),
    [currentLineIndex],
  )

  return (
    <div className={cn('aplayer-lrc', { 'aplayer-lrc-hide': !show })}>
      {lrcText ? (
        <div className="aplayer-lrc-contents" style={transformStyle}>
          {lines.map(([time, text], index) => (
            <p
              key={`${time}-${text.slice(0, 20)}`}
              className={cn({ 'aplayer-lrc-current': index === currentLineIndex })}
            >
              {text}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function parseLrc(lrcInput?: string): [time: number, text: string][] {
  if (!lrcInput) {
    return []
  }

  const lrc_s = lrcInput.replace(/([^\]^\n])\[/g, (match, p1) => p1 + '\n[')
  const lyric = lrc_s.split('\n')
  const lrc: [time: number, text: string][] = []

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
        const sec2sec = parseInt(oneTime[2])
        const msec2sec = oneTime[4] ? parseInt(oneTime[4]) / ((oneTime[4] + '').length === 2 ? 100 : 1000) : 0
        const lrcTime = min2sec + sec2sec + msec2sec
        lrc.push([lrcTime, lrcText])
      }
    }
  }

  lrc.sort((a, b) => a[0] - b[0])
  return lrc
}
