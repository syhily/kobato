import { motion, useReducedMotion } from 'motion/react'

const BAR_HEIGHTS = [3, 14, 3] as const
const BAR_BASES = [3, 2, 4] as const

export function Equalizer({ color = 'var(--brand)' }: { color?: string }) {
  const prefersReducedMotion = useReducedMotion()
  return (
    <div className="flex items-end gap-0.5" style={{ color }}>
      {[0, 1, 2].map((i) =>
        prefersReducedMotion ? (
          <div key={i} className="w-0.5 rounded-sm" style={{ height: BAR_HEIGHTS[i] }} />
        ) : (
          <motion.div
            key={i}
            className="w-0.5 rounded-sm"
            animate={{ height: [BAR_BASES[i], BAR_HEIGHTS[i], BAR_BASES[i]] }}
            transition={{ repeat: Infinity, duration: 0.8, ease: 'easeInOut', delay: i * 0.1 }}
          />
        ),
      )}
    </div>
  )
}
