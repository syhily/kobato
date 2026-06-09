import type { ReactNode } from 'react'

import { useEffect, useMemo, useRef, useState } from 'react'

import type { AdminMusicDto } from '@/shared/types/music'

import { useMusicPlayer } from '@/ui/admin/musics/MusicPlayerContext'
import { cn } from '@/ui/lib/cn'

interface MusicLibraryHeroProps {
  musics: AdminMusicDto[]
  total: number
  title?: string
  children?: ReactNode
}

const TARGET_CELL_SIZE = 100 // px — target size for each collage cell
const MIN_COLS = 3
const MIN_ROWS = 2

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i]!
    a[i] = a[j]!
    a[j] = tmp
  }
  return a
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

function urlsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false
    }
  }
  return true
}

interface GridCell {
  id: number
  url: string
  visible: boolean
}

interface GridSize {
  cols: number
  rows: number
  count: number
}

function CollageBackground({ allCoverUrls }: { allCoverUrls: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [grid, setGrid] = useState<GridSize>({ cols: 6, rows: 2, count: 12 })
  const [cells, setCells] = useState<GridCell[]>([])

  const cellsRef = useRef(cells)
  cellsRef.current = cells

  const urlsRef = useRef(allCoverUrls)
  urlsRef.current = allCoverUrls

  const gridRef = useRef(grid)
  gridRef.current = grid

  // Track previous urls to avoid re-initialising when only the array reference changes
  const prevUrlsRef = useRef<string[]>([])

  // Measure container and compute grid size dynamically
  useEffect(() => {
    const el = containerRef.current
    if (!el) {
      return
    }

    let raf: number
    const update = () => {
      const rect = el.getBoundingClientRect()
      const cols = Math.max(MIN_COLS, Math.floor(rect.width / TARGET_CELL_SIZE))
      const cellSize = rect.width / cols
      const rows = Math.max(MIN_ROWS, Math.ceil(rect.height / cellSize))
      const count = cols * rows
      setGrid((prev) => (prev.cols === cols && prev.rows === rows ? prev : { cols, rows, count }))
    }

    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(update)
    })

    ro.observe(el)
    update()

    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [])

  // Initialise / resize: fill grid with shuffled covers
  useEffect(() => {
    if (allCoverUrls.length === 0 || grid.count === 0) {
      return
    }

    // Skip if urls haven't actually changed and cells already fill the grid
    if (urlsEqual(prevUrlsRef.current, allCoverUrls) && cells.length === grid.count) {
      return
    }

    prevUrlsRef.current = [...allCoverUrls]
    const pool = shuffle([...allCoverUrls])
    setCells(
      Array.from({ length: grid.count }, (_, i) => ({
        id: i,
        url: pool[i % pool.length]!,
        visible: true,
      })),
    )
  }, [allCoverUrls, grid.count, cells.length])

  // Random refresh loop: randomly swap 1–N cells at a time
  useEffect(() => {
    if (grid.count === 0) {
      return
    }

    const timeouts: ReturnType<typeof setTimeout>[] = []
    let running = true

    const scheduleNext = () => {
      const nextDelay = 2000 + Math.random() * 1000 // 2–3 s between refreshes
      const t = setTimeout(() => {
        if (!running) {
          return
        }

        const currentGrid = gridRef.current
        if (currentGrid.count === 0) {
          scheduleNext()
          return
        }

        const pool = urlsRef.current
        if (pool.length === 0) {
          return
        }

        // Decide how many cells to swap this round (1–4)
        const batchSize = 1 + Math.floor(Math.random() * 4)
        const indices = shuffle(Array.from({ length: currentGrid.count }, (_, i) => i)).slice(0, batchSize)

        // Fade out all selected cells simultaneously
        setCells((prev) => {
          const next = [...prev]
          for (const idx of indices) {
            if (next[idx]) {
              next[idx] = { ...next[idx], visible: false }
            }
          }
          return next
        })

        // 300–1200 ms later: swap covers and fade in
        const refreshDelay = 300 + Math.random() * 900
        const t2 = setTimeout(() => {
          if (!running) {
            return
          }

          const currentPool = urlsRef.current
          setCells((prev) => {
            const next = [...prev]
            for (const idx of indices) {
              if (!next[idx]) {
                continue
              }
              const currentSet = new Set(next.map((c) => c.url))
              const available = currentPool.filter((u) => !currentSet.has(u))
              const source = available.length > 0 ? available : currentPool
              next[idx] = { ...next[idx], url: pickRandom(source), visible: true }
            }
            return next
          })
        }, refreshDelay)

        timeouts.push(t2)
        scheduleNext()
      }, nextDelay)

      timeouts.push(t)
    }

    scheduleNext()

    return () => {
      running = false
      timeouts.forEach(clearTimeout)
    }
  }, [grid.count])

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      {cells.length > 0 && grid.count > 0 && (
        <div className="grid w-full" style={{ gridTemplateColumns: `repeat(${grid.cols}, 1fr)` }}>
          {cells.map((cell) => (
            <div
              key={cell.id}
              className={cn(
                'aspect-square overflow-hidden',
                'transition-all duration-500 ease-in-out',
                cell.visible ? 'scale-100 opacity-100' : 'scale-90 opacity-0',
              )}
            >
              <img src={cell.url} alt="" className="h-full w-full object-cover" loading="lazy" />
            </div>
          ))}
        </div>
      )}

      {/* Dim overlay */}
      <div className="absolute inset-0 bg-black/40" />
    </div>
  )
}

function PlayingBackground({ coverUrl, extractedColor }: { coverUrl: string; extractedColor: string | null }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Blurred cover backdrop — scale compensates blur edge fade */}
      <div className="absolute inset-0 animate-slow-zoom">
        <img src={coverUrl} alt="" className="h-full w-full scale-125 object-cover" style={{ filter: 'blur(48px)' }} />
      </div>

      {/* Dark base overlay */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Extracted-color radial glow */}
      {extractedColor && (
        <div
          className="absolute inset-0 animate-pulse-glow"
          style={{
            background: `radial-gradient(ellipse at 50% 30%, ${extractedColor}40 0%, transparent 60%)`,
          }}
        />
      )}
    </div>
  )
}

function EmptyBackground() {
  return (
    <div
      className="absolute inset-0"
      style={{
        background: `linear-gradient(135deg, var(--surface-secondary) 0%, var(--surface-body) 100%)`,
      }}
    />
  )
}

export function MusicLibraryHero({ musics, total, title = '音乐库', children }: MusicLibraryHeroProps) {
  const { currentTrack, isPlaying, extractedColor } = useMusicPlayer()
  const hasPlayingTrack = currentTrack && isPlaying

  const computedUrls = useMemo(
    () => [...new Set(musics.map((m) => m.coverUrl).filter((url): url is string => Boolean(url)))].sort(),
    [musics],
  )

  const allCoverUrls = computedUrls

  const displayTotal = total

  const hasBackground = allCoverUrls.length > 0

  return (
    <div className={cn('relative -mx-4 -mt-4 mb-8', 'lg:-mx-6 lg:-mt-6')}>
      {/* ── Background layers ── */}
      {hasPlayingTrack && currentTrack.coverUrl ? (
        <PlayingBackground coverUrl={currentTrack.coverUrl} extractedColor={extractedColor} />
      ) : hasBackground ? (
        <CollageBackground allCoverUrls={allCoverUrls} />
      ) : (
        <EmptyBackground />
      )}

      {/* ── Global readability scrim ── */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 40%, transparent 100%)`,
        }}
      />

      {/* ── Hero Content ── */}
      <div className="relative z-10 px-4 pt-12 pb-8 lg:px-6 lg:pt-16 lg:pb-12">
        <h1
          className="text-5xl font-black tracking-tight text-white"
          style={{ textShadow: '0 2px 20px rgba(0,0,0,0.4)' }}
        >
          {title}
        </h1>
        <p className="mt-2 text-sm text-white/80" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.35)' }}>
          {displayTotal > 0 && <>共 {displayTotal} 首歌曲</>}
          {hasPlayingTrack && (
            <span className="ml-2 inline-flex items-center gap-1.5 text-white">
              <span className="inline-block size-2 animate-pulse rounded-full bg-current" />
              正在播放
            </span>
          )}
        </p>
      </div>

      {/* ── Action Bar ── */}
      {children && <div className="relative z-10 px-4 pb-8 lg:px-6 lg:pb-12">{children}</div>}
    </div>
  )
}
