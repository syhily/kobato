/**
 * Geist's signature easing curve (design.md "Motion"): short and physical.
 * Used as the global default via <MotionConfig transition={defaultTransition}>
 * so any motion component without an explicit transition inherits it.
 */
export const geistEase = [0.175, 0.885, 0.32, 1.1] as [number, number, number, number]

/** Global default transition applied by the root MotionConfig. */
export const defaultTransition = { duration: 0.15, ease: geistEase }

export const transitions = {
  /** General spring — tight feel. */
  spring: { type: 'spring' as const, stiffness: 300, damping: 30 },
  /** Gentle spring — suited for large panels. */
  gentle: { type: 'spring' as const, stiffness: 200, damping: 25 },
  /** Drawer slide-in. */
  drawer: { type: 'spring' as const, stiffness: 400, damping: 35 },
  /** Fade in/out. */
  fade: { duration: 0.3, ease: 'easeOut' as const },
  /** Detail-page fade-up (matches original CSS cubic-bezier). */
  detailFade: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  /** Children stagger. */
  stagger: { staggerChildren: 0.05 },
  /** Slow loop. */
  slowLoop: { repeat: Infinity, duration: 20, ease: 'easeInOut' as const },
  /** Pulse loop. */
  pulseLoop: { repeat: Infinity, duration: 6, ease: 'easeInOut' as const, repeatType: 'reverse' as const },
  /** Popup content spring — synced with backdrop fade (0.35s). */
  popup: { type: 'spring' as const, duration: 0.35, bounce: 0.15 },
  /** Popup backdrop fade — synced with content spring. */
  popupFade: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  /** Dialog content spring — synced with CSS transition (0.3s). */
  dialog: { type: 'spring' as const, duration: 0.3, bounce: 0.15 },
  /** Menu / dropdown spring — synced with CSS transition (0.25s). */
  menu: { type: 'spring' as const, duration: 0.25, bounce: 0.15 },
}
