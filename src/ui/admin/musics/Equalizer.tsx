import { motion } from '@/client/lib/motion'

const BAR_HEIGHTS = [3, 14, 3] as const
const BAR_BASES = [3, 2, 4] as const

export function Equalizer({ color = 'var(--brand)' }: { color?: string }) {
  return (
    <div className="flex items-end gap-0.5" style={{ color }}>
      {BAR_HEIGHTS.map((maxHeight, i) => (
        <motion.div
          key={`eq-bar-${maxHeight}-${i}`}
          className="w-0.5 rounded-sm"
          animate={{ height: [BAR_BASES[i], maxHeight, BAR_BASES[i]] }}
          transition={{
            repeat: Infinity,
            duration: 0.8,
            ease: 'easeInOut',
            delay: i * 0.1,
          }}
        />
      ))}
    </div>
  )
}
