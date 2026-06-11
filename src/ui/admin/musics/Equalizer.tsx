import { motion } from '@/client/lib/motion'

const BAR_HEIGHTS = [3, 14, 3] as const
const BAR_BASES = [3, 2, 4] as const

export function Equalizer({ color = 'var(--brand)' }: { color?: string }) {
  return (
    <div className="flex items-end gap-0.5" style={{ color }}>
      <motion.div
        className="w-0.5 rounded-sm"
        animate={{ height: [BAR_BASES[0], BAR_HEIGHTS[0], BAR_BASES[0]] }}
        transition={{
          repeat: Infinity,
          duration: 0.8,
          ease: 'easeInOut',
          delay: 0,
        }}
      />
      <motion.div
        className="w-0.5 rounded-sm"
        animate={{ height: [BAR_BASES[1], BAR_HEIGHTS[1], BAR_BASES[1]] }}
        transition={{
          repeat: Infinity,
          duration: 0.8,
          ease: 'easeInOut',
          delay: 0.1,
        }}
      />
      <motion.div
        className="w-0.5 rounded-sm"
        animate={{ height: [BAR_BASES[2], BAR_HEIGHTS[2], BAR_BASES[2]] }}
        transition={{
          repeat: Infinity,
          duration: 0.8,
          ease: 'easeInOut',
          delay: 0.2,
        }}
      />
    </div>
  )
}
