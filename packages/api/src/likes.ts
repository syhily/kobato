import {
  likeDecreaseInput,
  likeDecreaseOutput,
  likeIncreaseInput,
  likeIncreaseOutput,
  likeValidateInput,
  likeValidateOutput,
} from '@kobato/contracts/likes.ts'
import { oc } from '@orpc/contract'

// The likes RPC contract — the single source of each procedure's HTTP route and
// wire schemas. Route paths are the deployed surface; the server controller
// implements these procedures and owns no schema or route of its own.
export const likesContract = {
  increase: oc.route({ method: 'POST', path: '/likes/increase' }).input(likeIncreaseInput).output(likeIncreaseOutput),
  decrease: oc.route({ method: 'POST', path: '/likes/decrease' }).input(likeDecreaseInput).output(likeDecreaseOutput),
  validate: oc.route({ method: 'GET', path: '/likes/validate' }).input(likeValidateInput).output(likeValidateOutput),
}
