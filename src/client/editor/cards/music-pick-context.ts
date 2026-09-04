// The music card's pick channel (plan M3): the slash menu inserts an empty
// `music-player` card; clicking its placeholder asks the host to open
// MusicPickerDialog, and the pick writes `playerId` back through this target.
// A React context (not a prop drill) because the card's decorate component is
// rendered by inkling's card wrapper, which knows nothing about kobato
// dialogs. Null outside PageBodyEditor — the placeholder then renders as a
// static hint (unit tests, the server projection never decorates).
//
// The target is the card NODE INSTANCE (not its key): the pick handler runs
// `editor.update(() => { target.playerId = ... })`, and the generated setter's
// getWritable() resolves the latest instance by key — no $-function imports
// needed host-side (kobato deliberately has no lexical dependency).

import { createContext, useContext } from 'react'

export interface MusicPickTarget {
  playerId: string
}

export type OpenMusicPicker = (target: MusicPickTarget) => void

export const MusicPickContext = createContext<OpenMusicPicker | null>(null)

export function useOpenMusicPicker(): OpenMusicPicker | null {
  return useContext(MusicPickContext)
}
