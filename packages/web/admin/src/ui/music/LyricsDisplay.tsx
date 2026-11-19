import { parseLrc } from '@kobato/ui/components/music-player/lrc.ts'
import { cn } from '@kobato/ui/lib/cn.ts'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { useMemo, useRef, useEffect } from 'react'

export interface LyricsDisplayProps {
  lrcText?: string | null
  currentTime: number
}

export function LyricsDisplay({ lrcText, currentTime }: LyricsDisplayProps) {
  const { t } = useI18n()
  const lines = useMemo(() => parseLrc(lrcText), [lrcText])
  const containerRef = useRef<HTMLDivElement>(null)
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

  const autoScrollTargetRef = useRef<number | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const handleScroll = () => {
      if (autoScrollTargetRef.current !== null) {
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

  useEffect(() => {
    if (isUserScrollingRef.current) {
      return
    }

    const container = containerRef.current
    if (!container) {
      return
    }
    const lineEl = container.querySelectorAll<HTMLParagraphElement>('p')[currentLineIndex]
    if (!lineEl) {
      return
    }

    const containerRect = container.getBoundingClientRect()
    const lineRect = lineEl.getBoundingClientRect()
    const relativeTop = lineRect.top - containerRect.top + container.scrollTop
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
        <p className="text-sm">{t('admin.musics.lyrics.empty')}</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative max-h-[60vh] scrollbar-thin overflow-y-auto py-8">
      <div className="flex flex-col items-center gap-4 px-4">
        {lines.map(([time, text], index) => (
          <p
            key={`${time}-${text.slice(0, 20)}`}
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
