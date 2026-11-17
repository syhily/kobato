import type { LexicalEditorState } from '@kobato/shared/lexical/schema.ts'

import { SERVER_FILLED_NODE_FIELDS } from '@kobato/shared/lexical/artifacts.ts'
import { lexicalEditorStateSchema } from '@kobato/shared/lexical/schema.ts'
import { visitLexicalNodes } from '@kobato/shared/lexical/walk.ts'

import { descriptorFor } from '../../../infra/http/error-descriptor'
import { DomainError } from '../../../infra/http/errors'
import { prerenderLexicalEditorState } from '../../../infra/pt/lexical-prerender'
import { extractZodIssues } from './zod-issues'

// Validate the incoming editor state, strip every server-owned artifact slot
// the client may have forged (stored-XSS / stale-snapshot guard — the editor
// never writes these back), then recompute the KaTeX/Shiki slots.

export async function canonicalizeLexicalEditorState(input: unknown): Promise<LexicalEditorState> {
  try {
    const state = lexicalEditorStateSchema.parse(input)
    stripServerFilledFields(state)
    await prerenderLexicalEditorState(state)
    return state
  } catch (error) {
    throw new DomainError('BAD_REQUEST', descriptorFor('content.error.invalidBody'), extractZodIssues(error))
  }
}

function stripServerFilledFields(state: LexicalEditorState): void {
  visitLexicalNodes(state, (node) => {
    const keys = SERVER_FILLED_NODE_FIELDS[node.type]
    if (keys === undefined) {
      return
    }
    const record = node as Record<string, unknown>
    for (const key of keys) {
      if (node.type === 'music-player') {
        // The meta snapshot is resolved and embedded later in the save
        // pipeline; absent means "not snapshotted".
        delete record[key]
      } else {
        // codeblock / math / math-inline: the schema declares the artifact
        // slots as required strings, so they reset to empty rather than
        // being deleted.
        record[key] = ''
      }
    }
  })
}
