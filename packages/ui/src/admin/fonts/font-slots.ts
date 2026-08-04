import type { FontsSettings } from '@kobato/shared/config/types'
import type { FontSlot } from '@kobato/shared/contracts/fonts'

import { arrayMove } from '@dnd-kit/sortable'
import { orpc } from '@kobato/client/api/client'
import { orpcQuery } from '@kobato/client/api/orpc-query'
import { toastApiError } from '@kobato/client/lib/toast-api-error'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useReducer, useRef } from 'react'
import { useRevalidator, useRouteLoaderData } from 'react-router'
import { toast } from 'sonner'

// Optimistic slot controller for the fonts view: a local reducer mirrors
// `blogSettings.fonts` so dragged items don't snap back while `setSlot`
// round-trips; the `seeded` action rewrites from the server only when no
// mutation is in flight, so a mid-sequence revalidate can't clobber the
// optimistic state (same trade-off as the settings reseed guard).

export const MAX_SLOT_FONTS = 8

export type SlotState = Record<FontSlot, string[]>

export type SlotsAction =
  | { type: 'seeded'; slots: SlotState }
  | { type: 'setSlot'; slot: FontSlot; ids: string[] }
  | { type: 'reorder'; slot: FontSlot; from: number; to: number }
  | { type: 'move'; fontId: string; target: FontSlot; index: number | undefined; from?: FontSlot }
  | { type: 'remove'; slot: FontSlot; fontId: string }

export function slotsReducer(state: SlotState, action: SlotsAction): SlotState {
  switch (action.type) {
    case 'seeded':
      return action.slots
    case 'setSlot':
      return { ...state, [action.slot]: action.ids }
    case 'reorder': {
      const next = arrayMove(state[action.slot], action.from, action.to)
      return { ...state, [action.slot]: next }
    }
    case 'move': {
      const next = { ...state }
      if (action.from && action.from !== action.target) {
        next[action.from] = state[action.from].filter((id) => id !== action.fontId)
      }
      const target = next[action.target].filter((id) => id !== action.fontId)
      const insertAt = action.index === undefined || action.index >= target.length ? target.length : action.index
      target.splice(insertAt, 0, action.fontId)
      next[action.target] = target
      return next
    }
    case 'remove':
      return { ...state, [action.slot]: state[action.slot].filter((id) => id !== action.fontId) }
  }
}

function emptySlots(): SlotState {
  return { global: [], post: [], code: [] }
}

export function useFontSlotsController() {
  const rootData = useRouteLoaderData<{ blogSettings?: { fonts?: FontsSettings } | null }>('root')
  const serverSlots = rootData?.blogSettings?.fonts
  const revalidator = useRevalidator()
  const queryClient = useQueryClient()
  const [slots, dispatch] = useReducer(slotsReducer, undefined, emptySlots)
  const inFlightRef = useRef(0)

  // Seed from server, but skip while a mutation is in flight so the
  // optimistic state survives the revalidate that fires on success.
  useEffect(() => {
    if (inFlightRef.current > 0) {
      return
    }
    if (!serverSlots) {
      return
    }
    dispatch({
      type: 'seeded',
      slots: {
        global: serverSlots.global ?? [],
        post: serverSlots.post ?? [],
        code: serverSlots.code ?? [],
      },
    })
  }, [serverSlots])

  const setSlotMutation = useMutation({
    mutationFn: (args: { slot: FontSlot; fontIds: string[] }) =>
      orpc.admin.fonts.setSlot({ slot: args.slot, fontIds: args.fontIds }),
    onMutate: () => {
      inFlightRef.current += 1
    },
    onSuccess: () => {
      inFlightRef.current = Math.max(0, inFlightRef.current - 1)
      void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.fonts.list.key() })
      void revalidator.revalidate()
    },
    onError: (error) => {
      inFlightRef.current = Math.max(0, inFlightRef.current - 1)
      void revalidator.revalidate()
      toastApiError(error, '槽位更新失败')
    },
  })

  // Serialize persists through a one-at-a-time queue: two rapid drags
  // would otherwise fire concurrent unversioned POSTs, and an earlier
  // payload landing last leaves the server holding a stale slot order
  // (audit P1-19). Sequential writes make the last drag the authoritative
  // end state; a failure surfaces via onError without stranding the queue.
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve())

  const persist = (slot: FontSlot, ids: string[]) => {
    persistQueueRef.current = persistQueueRef.current.then(() =>
      setSlotMutation.mutateAsync({ slot, fontIds: ids }).then(
        () => undefined,
        () => undefined,
      ),
    )
  }

  const commit = (slot: FontSlot, next: string[]) => {
    dispatch({ type: 'setSlot', slot, ids: next })
    persist(slot, next)
  }

  const reorder = (slot: FontSlot, from: number, to: number) => {
    if (from < 0 || from === to) {
      return
    }
    const next = arrayMove(slots[slot], from, to)
    commit(slot, next)
  }

  const moveToSlot = (fontId: string, targetSlot: FontSlot, targetIndex: number | undefined, fromSlot?: FontSlot) => {
    if (slots[targetSlot].includes(fontId) && fromSlot !== targetSlot) {
      toast.error('该字体已在目标槽位中')
      return
    }
    if (slots[targetSlot].length >= MAX_SLOT_FONTS && !slots[targetSlot].includes(fontId)) {
      toast.error(`每个槽位最多 ${MAX_SLOT_FONTS} 个字体`)
      return
    }

    // Compute the post-move state once, then dispatch + persist from it
    // (avoids reading a stale `slots` for the mutation payload).
    const next: SlotState = { ...slots }
    if (fromSlot && fromSlot !== targetSlot) {
      next[fromSlot] = slots[fromSlot].filter((id) => id !== fontId)
    }
    const target = next[targetSlot].filter((id) => id !== fontId)
    const insertAt = targetIndex === undefined || targetIndex >= target.length ? target.length : targetIndex
    target.splice(insertAt, 0, fontId)
    next[targetSlot] = target

    dispatch({ type: 'move', fontId, target: targetSlot, index: targetIndex, from: fromSlot })
    if (fromSlot && fromSlot !== targetSlot) {
      persist(fromSlot, next[fromSlot])
    }
    persist(targetSlot, next[targetSlot])
  }

  const remove = (slot: FontSlot, fontId: string) => {
    commit(
      slot,
      slots[slot].filter((id) => id !== fontId),
    )
  }

  return { slots, commit, reorder, moveToSlot, remove, isPending: setSlotMutation.isPending }
}
