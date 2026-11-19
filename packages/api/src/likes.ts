import {
  likeDecreaseInput,
  likeDecreaseOutput,
  likeIncreaseInput,
  likeIncreaseOutput,
  likeValidateInput,
  likeValidateOutput,
} from '@kobato/contracts/likes.ts'
import { oc } from '@orpc/contract'

export const likesContract = {
  increase: oc.route({ method: 'POST', path: '/likes/increase' }).input(likeIncreaseInput).output(likeIncreaseOutput),
  decrease: oc.route({ method: 'POST', path: '/likes/decrease' }).input(likeDecreaseInput).output(likeDecreaseOutput),
  validate: oc.route({ method: 'GET', path: '/likes/validate' }).input(likeValidateInput).output(likeValidateOutput),
}
