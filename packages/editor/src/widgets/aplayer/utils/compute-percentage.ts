import type { RefObject } from 'react'

export function computePercentage(
  eventTarget: Pick<MouseEvent, 'clientX'>,
  progressBarRef: RefObject<HTMLDivElement | null>,
): number {
  if (!progressBarRef.current) {
    return 0
  }
  let percentage =
    (eventTarget.clientX - progressBarRef.current.getBoundingClientRect().left) / progressBarRef.current.clientWidth
  percentage = Math.max(percentage, 0)
  percentage = Math.min(percentage, 1)
  percentage = Math.floor(percentage * 100) / 100
  return percentage
}

export function computePercentageOfY(
  eventTarget: Pick<MouseEvent, 'clientY'>,
  volumeBarRef: RefObject<HTMLDivElement | null>,
): number {
  if (!volumeBarRef.current) {
    return 0
  }
  let percentage =
    1 - (eventTarget.clientY - volumeBarRef.current.getBoundingClientRect().top) / volumeBarRef.current.clientHeight
  percentage = Math.max(percentage, 0)
  percentage = Math.min(percentage, 1)
  percentage = Math.floor(percentage * 100) / 100
  return percentage
}
