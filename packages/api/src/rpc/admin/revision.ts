import { saveBodyInput, saveResultOutput } from '@kobato/api/contracts/admin/revision'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

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
