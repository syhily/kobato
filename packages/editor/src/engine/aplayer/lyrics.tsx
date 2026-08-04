import { cn } from '@kobato/editor/engine/lib/cn'
import { useMemo } from 'react'

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
    <div
      className={cn(
        'aplayer-lrc relative -mt-2.5 mb-aplayer-lrc-gap hidden h-aplayer-lrc overflow-hidden text-center',
        show && 'block',
        "before:absolute before:z-1 before:block before:w-full before:overflow-hidden before:content-[''] after:absolute after:z-1 after:block after:w-full after:overflow-hidden after:content-['']",
        'before:top-0 before:h-[10%]',
        'before:[background-image:var(--aplayer-lrc-top,linear-gradient(180deg,_#fff_0,_hsla(0,_0%,_100%,_0)))]',
        'after:bottom-0 after:h-[33%]',
        'after:[background-image:var(--aplayer-lrc-bottom,linear-gradient(180deg,_hsla(0,_0%,_100%,_0)_0,_hsla(0,_0%,_100%,_0.8)))]',
        'dark:[--aplayer-lrc-top:linear-gradient(to_bottom,var(--surface)_0%,color-mix(in_oklab,var(--surface)_0%,transparent)_100%)]',
        'dark:[--aplayer-lrc-bottom:linear-gradient(to_bottom,color-mix(in_oklab,var(--surface)_0%,transparent)_0%,color-mix(in_oklab,var(--surface)_80%,transparent)_100%)]',
      )}
    >
      {lrcText ? (
        <div
          className="aplayer-lrc-contents w-full cursor-default transition-all duration-500 ease-out select-text"
          style={transformStyle}
        >
          {lines.map(([time, text], index) => (
            <p
              key={`${time}-${text.slice(0, 20)}`}
              className={cn(
                'm-0 h-4 overflow-hidden p-0 text-xs leading-4 text-ink-4 opacity-40 transition-all duration-500 ease-out dark:text-ink-4',
                index === currentLineIndex &&
                  'aplayer-lrc-current h-auto min-h-4 overflow-visible opacity-100 dark:text-ink-2',
              )}
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
