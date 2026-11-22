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
} from '@kobato/api/contracts/auth'
import { oc } from '@orpc/contract'

export const accountAuthContract = {
  status: oc.route({ method: 'GET', path: '/auth/status' }).input(authStatusInput).output(authStatusOutputSchema),
  identify: oc
    .route({ method: 'POST', path: '/auth/identify' })
    .input(authIdentifyInput)
    .output(authIdentifyOutputSchema),
  login: oc.route({ method: 'POST', path: '/auth/login' }).input(authLoginInput).output(authFlowOutputSchema),
  logout: oc.route({ method: 'POST', path: '/auth/logout' }).input(authLogoutInput).output(authFlowOutputSchema),
  magicLink: oc
    .route({ method: 'POST', path: '/auth/magic-link' })
    .input(authMagicLinkInput)
    .output(authFlowOutputSchema),
  otpVerify: oc
    .route({ method: 'POST', path: '/auth/otp/verify' })
    .input(authOtpVerifyInput)
    .output(authFlowOutputSchema),
  otpResend: oc
    .route({ method: 'POST', path: '/auth/otp/resend' })
    .input(authOtpResendInput)
    .output(authFlowOutputSchema),
  otpCancel: oc
    .route({ method: 'POST', path: '/auth/otp/cancel' })
    .input(authOtpCancelInput)
    .output(authFlowOutputSchema),
  passwordResetRequest: oc
    .route({ method: 'POST', path: '/auth/password-reset/request' })
    .input(authPasswordResetRequestInput)
    .output(authFlowOutputSchema),
  passwordReset: oc
    .route({ method: 'POST', path: '/auth/password-reset' })
    .input(authPasswordResetInput)
    .output(authFlowOutputSchema),
}
