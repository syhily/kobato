import { LazyMotionDiv } from '@/ui/components/lazy-motion'
import { useMediaQuery } from '@/ui/lib/use-media-query'

const BAR_HEIGHTS = [3, 14, 3] as const
const BAR_BASES = [3, 2, 4] as const

export function Equalizer({ color = 'var(--brand)' }: { color?: string }) {
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  return (
    <div className="flex items-end gap-0.5" style={{ color }}>
      {[0, 1, 2].map((i) =>
        prefersReducedMotion ? (
          <div key={i} className="w-0.5 rounded-sm" style={{ height: BAR_HEIGHTS[i] }} />
        ) : (
          <LazyMotionDiv
            key={i}
            className="w-0.5 rounded-sm"
            // Static fallback matches the reduced-motion bar heights.
            fallbackStyle={{ height: BAR_HEIGHTS[i] }}
            animate={{ height: [BAR_BASES[i], BAR_HEIGHTS[i], BAR_BASES[i]] }}
            transition={{ repeat: Infinity, duration: 0.8, ease: 'easeInOut', delay: i * 0.1 }}
          />
        ),
      )}
    </div>
  )
}
