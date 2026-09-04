import type { LexicalEditorState } from '@/shared/lexical/schema'

import { extractZodIssues } from '@/server/domains/pt/services/zod-issues'
import { DomainError } from '@/server/infra/http/errors'
import { prerenderLexicalEditorState } from '@/server/infra/pt/lexical-prerender'
import { SERVER_FILLED_NODE_FIELDS } from '@/shared/lexical/artifacts'
import { lexicalEditorStateSchema } from '@/shared/lexical/schema'
import { visitLexicalNodes } from '@/shared/lexical/walk'

// Lexical counterpart of `canonicalizePortableTextBody` (plan
// docs/plans/inkling-editor-replacement.md, round R9a): validate the
// incoming editor state, strip every server-owned artifact slot the client
// may have forged (stored-XSS / stale-snapshot guard — the editor never
// writes these back), then recompute the KaTeX/Shiki slots.

export async function canonicalizeLexicalEditorState(input: unknown): Promise<LexicalEditorState> {
  try {
    const state = lexicalEditorStateSchema.parse(input)
    stripServerFilledFields(state)
    await prerenderLexicalEditorState(state)
    return state
  } catch (error) {
    throw new DomainError('BAD_REQUEST', '正文格式不合法。', extractZodIssues(error))
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
