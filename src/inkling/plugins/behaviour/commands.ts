import { createCommand } from 'lexical'

import type {
  DeleteCardPayload,
  InsertCardPayload,
  LinkMatchPayload,
  SelectCardPayload,
} from '@/inkling/plugins/behaviour/types'

export const INSERT_CARD_COMMAND = createCommand<InsertCardPayload>('INSERT_CARD_COMMAND')
export const SELECT_CARD_COMMAND = createCommand<SelectCardPayload>('SELECT_CARD_COMMAND')
export const DESELECT_CARD_COMMAND = createCommand<SelectCardPayload>('DESELECT_CARD_COMMAND')
export const EDIT_CARD_COMMAND = createCommand<SelectCardPayload>('EDIT_CARD_COMMAND')
export const DELETE_CARD_COMMAND = createCommand<DeleteCardPayload>('DELETE_CARD_COMMAND')
export const PASTE_LINK_COMMAND = createCommand<LinkMatchPayload>('PASTE_LINK_COMMAND')
