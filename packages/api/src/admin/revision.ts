import { saveBodyInput, saveResultOutput } from '@kobato/contracts/revision.ts'
import { oc } from '@orpc/contract'

/**
 * The save-draft / publish-latest contract pair shared by the posts and pages
 * admin domains. Both mount the same wire shapes under their own base path
 * (`/admin/posts` uses the author base, `/admin/pages` the admin base — the
 * controller picks the implementer; the route paths are the deployed surface).
 */
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
