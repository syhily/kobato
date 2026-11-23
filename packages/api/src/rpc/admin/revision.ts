import { saveBodyInput, saveResultOutput } from '@kobato/api/contracts/admin/revision'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

/**
 * The revision procedures for one entity family. `basePath` is typed as `` `/${TBase}` `` so the leading slash stays a
 * literal in every derived path type (TypeScript cannot prove `` `${TBase}/x` `` is rooted through a generic's
 * constraint) while the call site keeps passing the rooted path: `revisionContract('/admin/posts')` infers
 * `TBase = 'admin/posts'`, so `saveDraft` is branded `POST /admin/posts/save-draft` exactly.
 */
export function revisionContract<const TBase extends string>(basePath: `/${TBase}`) {
  return {
    saveDraft: defineProcedure({ method: 'POST', path: `${basePath}/save-draft` })
      .input(saveBodyInput)
      .output(saveResultOutput),
    publishLatest: defineProcedure({ method: 'POST', path: `${basePath}/publish-latest` })
      .input(saveBodyInput)
      .output(saveResultOutput),
  }
}

export type RevisionContract<TBase extends string = string> = ReturnType<typeof revisionContract<TBase>>
