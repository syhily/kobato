/**
 * Geist's signature easing curve (design.md "Motion"); the global default
 * via <MotionConfig transition={defaultTransition}>.
 */
export const geistEase = [0.175, 0.885, 0.32, 1.1] as [number, number, number, number]

export const defaultTransition = { duration: 0.15, ease: geistEase }

export const transitions = {
  spring: { type: 'spring' as const, stiffness: 300, damping: 30 },
  /** Gentle spring — suited for large panels. */
  gentle: { type: 'spring' as const, stiffness: 200, damping: 25 },
  drawer: { type: 'spring' as const, stiffness: 400, damping: 35 },
  fade: { duration: 0.3, ease: 'easeOut' as const },
  detailFade: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  stagger: { staggerChildren: 0.05 },
  slowLoop: { repeat: Infinity, duration: 20, ease: 'easeInOut' as const },
  pulseLoop: { repeat: Infinity, duration: 6, ease: 'easeInOut' as const, repeatType: 'reverse' as const },
  /** Popup content spring — synced with backdrop fade. */
  popup: { type: 'spring' as const, duration: 0.35, bounce: 0.15 },
  /** Popup backdrop fade — synced with content spring. */
  popupFade: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  dialog: { type: 'spring' as const, duration: 0.3, bounce: 0.15 },
  menu: { type: 'spring' as const, duration: 0.25, bounce: 0.15 },
}
