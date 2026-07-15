import { useReducer } from 'react'

interface FriendsState {
  q: string
  includeHidden: boolean
}

type FriendsAction = { type: 'setQ'; value: string } | { type: 'setIncludeHidden'; value: boolean }

function friendsReducer(state: FriendsState, action: FriendsAction): FriendsState {
  switch (action.type) {
    case 'setQ':
      return { ...state, q: action.value }
    case 'setIncludeHidden':
      return { ...state, includeHidden: action.value }
  }
}

export function useFriendsReducer() {
  const [state, dispatch] = useReducer(friendsReducer, {
    q: '',
    includeHidden: false,
  })
  return { state, dispatch }
}

export type FriendsReducerDispatch = ReturnType<typeof useFriendsReducer>['dispatch']
