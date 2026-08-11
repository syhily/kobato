import { useMemo, useRef, useEffect } from 'react'

import { cn } from '@/ui/lib/cn'

function parseLrc(lrcInput?: string | null): [time: number, text: string][] {
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
        const sec2sec = parseInt(oneTime[2], 10)
        const msec2sec = oneTime[4] ? parseInt(oneTime[4], 10) / ((oneTime[4] + '').length === 2 ? 100 : 1000) : 0
        const lrcTime = min2sec + sec2sec + msec2sec
        lrc.push([lrcTime, lrcText])
      }
    }
  }

  lrc.sort((a, b) => a[0] - b[0])
  return lrc
}

export interface LyricsDisplayProps {
  lrcText?: string | null
  currentTime: number
}

export function LyricsDisplay({ lrcText, currentTime }: LyricsDisplayProps) {
  const lines = useMemo(() => parseLrc(lrcText), [lrcText])
  const containerRef = useRef<HTMLDivElement>(null)
  const currentLineRef = useRef<HTMLParagraphElement>(null)
  const isUserScrollingRef = useRef(false)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Scroll position the in-flight programmatic smooth scroll is heading to;
  // `null` when no auto-scroll is active. A boolean flag fails here because a
  // smooth scroll fires a whole stream of scroll events — only the first one
  // would be ignored and the rest would read as user scrolls, suppressing
  // auto-scroll for 3s after every programmatic jump.
  const autoScrollTargetRef = useRef<number | null>(null)

  // Detect user manual scroll and pause auto-scroll briefly
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const handleScroll = () => {
      if (autoScrollTargetRef.current !== null) {
        // Programmatic smooth scroll in flight: keep ignoring events until
        // the container lands on the target.
        if (Math.abs(container.scrollTop - autoScrollTargetRef.current) > 1) {
          return
        }
        autoScrollTargetRef.current = null
        return
      }
      isUserScrollingRef.current = true
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
      scrollTimeoutRef.current = setTimeout(() => {
        isUserScrollingRef.current = false
      }, 3000)
    }

    // Direct user input during a smooth scroll cancels the programmatic
    // suppression, so the user's own scroll events start the 3s pause.
    const cancelAutoScroll = () => {
      autoScrollTargetRef.current = null
    }

    container.addEventListener('scroll', handleScroll)
    container.addEventListener('wheel', cancelAutoScroll, { passive: true })
    container.addEventListener('touchstart', cancelAutoScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', handleScroll)
      container.removeEventListener('wheel', cancelAutoScroll)
      container.removeEventListener('touchstart', cancelAutoScroll)
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [])

  // Auto-scroll to keep current line centered
  useEffect(() => {
    if (isUserScrollingRef.current) {
      return
    }

    const container = containerRef.current
    const lineEl = currentLineRef.current
    if (!container || !lineEl) {
      return
    }

    const containerRect = container.getBoundingClientRect()
    const lineRect = lineEl.getBoundingClientRect()
    const relativeTop = lineRect.top - containerRect.top + container.scrollTop
    // Clamp to the reachable range so the suppression target matches the
    // position the browser actually scrolls to.
    const maxScroll = container.scrollHeight - container.clientHeight
    const targetScroll = Math.max(0, Math.min(relativeTop - containerRect.height / 2 + lineRect.height / 2, maxScroll))

    autoScrollTargetRef.current = targetScroll
    container.scrollTo({
      top: targetScroll,
      behavior: 'smooth',
    })
  }, [currentLineIndex])

  if (!lrcText || lines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-ink-4">
        <p className="text-sm">暂无歌词</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative max-h-[60vh] scrollbar-thin overflow-y-auto py-8">
      <div className="flex flex-col items-center gap-4 px-4">
        {lines.map(([time, text], index) => (
          <p
            key={`${time}-${text.slice(0, 20)}`}
            ref={index === currentLineIndex ? currentLineRef : undefined}
            className={cn(
              'text-center text-base transition-all duration-300',
              index === currentLineIndex
                ? 'text-lg font-medium text-ink-1'
                : index < currentLineIndex
                  ? 'text-ink-4'
                  : 'text-ink-3',
            )}
          >
            {text}
          </p>
        ))}
      </div>
    </div>
  )
}
