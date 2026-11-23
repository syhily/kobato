import {
  authFlowOutputSchema,
  authIdentifyInput,
  authIdentifyOutputSchema,
  authLoginInput,
  authLogoutInput,
  authMagicLinkInput,
  authOtpCancelInput,
  authOtpResendInput,
  authOtpVerifyInput,
  authPasswordResetInput,
  authPasswordResetRequestInput,
  authStatusInput,
  authStatusOutputSchema,
} from '@kobato/api/contracts/account/auth'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const accountAuthContract = {
  status: defineProcedure({ method: 'GET', path: '/auth/status' })
    .input(authStatusInput)
    .output(authStatusOutputSchema),
  identify: defineProcedure({ method: 'POST', path: '/auth/identify' })
    .input(authIdentifyInput)
    .output(authIdentifyOutputSchema),
  login: defineProcedure({ method: 'POST', path: '/auth/login' }).input(authLoginInput).output(authFlowOutputSchema),
  logout: defineProcedure({ method: 'POST', path: '/auth/logout' }).input(authLogoutInput).output(authFlowOutputSchema),
  magicLink: defineProcedure({ method: 'POST', path: '/auth/magic-link' })
    .input(authMagicLinkInput)
    .output(authFlowOutputSchema),
  otpVerify: defineProcedure({ method: 'POST', path: '/auth/otp/verify' })
    .input(authOtpVerifyInput)
    .output(authFlowOutputSchema),
  otpResend: defineProcedure({ method: 'POST', path: '/auth/otp/resend' })
    .input(authOtpResendInput)
    .output(authFlowOutputSchema),
  otpCancel: defineProcedure({ method: 'POST', path: '/auth/otp/cancel' })
    .input(authOtpCancelInput)
    .output(authFlowOutputSchema),
  passwordResetRequest: defineProcedure({ method: 'POST', path: '/auth/password-reset/request' })
    .input(authPasswordResetRequestInput)
    .output(authFlowOutputSchema),
  passwordReset: defineProcedure({ method: 'POST', path: '/auth/password-reset' })
    .input(authPasswordResetInput)
    .output(authFlowOutputSchema),
}
