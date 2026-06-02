import { useRef } from 'react'

import { cn } from '@/ui/lib/cn'

function usePrevious<T>(value: T): T {
  const ref = useRef<T>(value)
  const prev = ref.current
  ref.current = value
  return prev
}

interface NumberFlowProps {
  value: number
  className?: string
}

/**
 * Minimal zero-dependency number flow. Renders each digit in a vertical
 * strip and animates translateY when the value changes.
 */
export function NumberFlow({ value, className }: NumberFlowProps) {
  const previousValue = usePrevious(value)

  const digits = String(value).split('')
  const prevDigits = String(previousValue).split('')
  const maxLen = Math.max(digits.length, prevDigits.length)

  return (
    <span className={cn('inline-block align-middle', className)} aria-label={String(value)}>
      {Array.from({ length: maxLen }, (_, i) => {
        // Align digits to the right (least significant digit stays in place).
        // newDigitIndex = digits.length - maxLen + i  (0 = leftmost position)
        const newDigitIndex = digits.length - maxLen + i
        const newDigit = digits[newDigitIndex]
        const key = `pos-${maxLen - 1 - i}`

        return <DigitColumn key={key} digit={newDigit !== undefined ? Number(newDigit) : 0} />
      })}
    </span>
  )
}

function DigitColumn({ digit }: { digit: number }) {
  return (
    <span className="relative inline-block h-[1em] w-[1ch] overflow-hidden align-middle">
      <span
        className="absolute inset-x-0 top-0 flex flex-col transition-transform duration-500 ease-out"
        style={{ transform: `translateY(-${digit}em)` }}
      >
        {DIGITS.map((d) => (
          <span key={d} className="flex h-[1em] items-center justify-center leading-none tabular-nums">
            {d}
          </span>
        ))}
      </span>
    </span>
  )
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const
