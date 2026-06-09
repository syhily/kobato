import { useReducer } from 'react'

export type MusicSortBy = 'createdAt' | 'updatedAt' | 'name' | 'artist' | 'album'
export type MusicSortOrder = 'asc' | 'desc'

interface MusicsState {
  q: string
  sortBy: MusicSortBy
  sortOrder: MusicSortOrder
  pageSize: number
}

type MusicsAction =
  | { type: 'setQ'; value: string }
  | { type: 'setSortBy'; value: MusicSortBy }
  | { type: 'setSortOrder'; value: MusicSortOrder }
  | { type: 'toggleSortOrder' }

function musicsReducer(state: MusicsState, action: MusicsAction): MusicsState {
  switch (action.type) {
    case 'setQ':
      return { ...state, q: action.value }
    case 'setSortBy':
      return { ...state, sortBy: action.value }
    case 'setSortOrder':
      return { ...state, sortOrder: action.value }
    case 'toggleSortOrder':
      return { ...state, sortOrder: state.sortOrder === 'asc' ? 'desc' : 'asc' }
    default:
      return state
  }
}

export function useMusicsController() {
  const [state, dispatch] = useReducer(musicsReducer, {
    q: '',
    sortBy: 'createdAt',
    sortOrder: 'desc',
    pageSize: 24,
  })
  return { state, dispatch }
}
