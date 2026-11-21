import { saveBodyInput, saveResultOutput } from '@kobato/contracts/revision'
import { oc } from '@orpc/contract'

export function revisionContract(basePath: `/${string}`) {
  return {
    saveDraft: oc
      .route({ method: 'POST', path: `${basePath}/save-draft` })
      .input(saveBodyInput)
      .output(saveResultOutput),
    publishLatest: oc
      .route({ method: 'POST', path: `${basePath}/publish-latest` })
      .input(saveBodyInput)
      .output(saveResultOutput),
  }
}

export type RevisionContract = ReturnType<typeof revisionContract>
