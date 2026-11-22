import type { ErrorMessageDescriptor } from '@kobato/api/contracts/api-error'

import { z } from 'zod'

export const authMessageDescriptorSchema = z.custom<ErrorMessageDescriptor>()

// Auth wire semantics: the redirect target every auth procedure falls back to when the caller-supplied
// `redirectTo` fails `safeRedirectPath` — action flows land on the admin entry, the status view on the site root.
export const AUTH_ACTION_REDIRECT_FALLBACK = '/admin'
export const AUTH_STATUS_REDIRECT_FALLBACK = '/'

const redirectTarget = z.string().nullish()

export const AUTH_SIGNIN_VIEW_ACTIONS = ['magiclink', 'lostpassword', 'resetpassword', 'accept-invite'] as const
export type AuthSigninViewAction = (typeof AUTH_SIGNIN_VIEW_ACTIONS)[number]
export const AUTH_SIGNIN_ACTIONS = ['login', 'verifyotp', ...AUTH_SIGNIN_VIEW_ACTIONS] as const
export const authSigninActionSchema = z.enum(AUTH_SIGNIN_ACTIONS)
export type AuthSigninAction = z.infer<typeof authSigninActionSchema>

export const authStatusInput = z.object({
  redirectTo: redirectTarget,
  action: z.string().nullish(),
  token: z.string().nullish(),
  error: z.string().nullish(),
})
export type AuthStatusInput = z.input<typeof authStatusInput>

export const authFlowRedirectDto = z.object({ type: z.literal('redirect'), to: z.string() })
export const authFlowErrorDto = z.object({
  type: z.literal('error'),
  message: z.string(),
  descriptor: authMessageDescriptorSchema.optional(),
})
export const authFlowSuccessDto = z.object({
  type: z.literal('success'),
  message: z.string(),
  descriptor: authMessageDescriptorSchema.optional(),
})
export const authFlowOutputSchema = z.discriminatedUnion('type', [
  authFlowRedirectDto,
  authFlowErrorDto,
  authFlowSuccessDto,
])
export type AuthFlowOutput = z.infer<typeof authFlowOutputSchema>

export const authStatusRedirectDto = z.object({ kind: z.literal('redirect'), to: z.string() })
export const authStatusViewDto = z.object({
  kind: z.literal('view'),
  redirectTo: z.string(),
  action: authSigninActionSchema,
  tokenError: z.string().nullable(),
  resetToken: z.string().nullable(),
  magicToken: z.string().nullable(),
  authError: z.string().nullable(),
  csrfToken: z.string().nullable(),
  pendingOtpEmail: z.string().optional(),
  pendingOtpSentAt: z.number().optional(),
})
export const authStatusOutputSchema = z.discriminatedUnion('kind', [authStatusRedirectDto, authStatusViewDto])
export type AuthStatusOutput = z.infer<typeof authStatusOutputSchema>
export type AuthStatusView = Extract<AuthStatusOutput, { kind: 'view' }>

export const authIdentifyInput = z.object({ email: z.string(), redirectTo: redirectTarget })
export type AuthIdentifyInput = z.input<typeof authIdentifyInput>

export const authIdentifyOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('passkey') }),
  z.object({ kind: z.literal('password') }),
  z.object({ kind: z.literal('magic-link-sent'), message: z.string(), descriptor: authMessageDescriptorSchema }),
  z.object({ kind: z.literal('error'), message: z.string(), descriptor: authMessageDescriptorSchema.optional() }),
])
export type AuthIdentifyOutput = z.infer<typeof authIdentifyOutputSchema>

export const authLoginInput = z.object({ email: z.string(), password: z.string(), redirectTo: redirectTarget })
export type AuthLoginInput = z.input<typeof authLoginInput>

export const authLogoutInput = z.object({ redirectTo: redirectTarget })
export type AuthLogoutInput = z.input<typeof authLogoutInput>

export const authMagicLinkInput = z.object({ token: z.string(), redirectTo: redirectTarget })
export type AuthMagicLinkInput = z.input<typeof authMagicLinkInput>

export const authOtpVerifyInput = z.object({ code: z.string(), redirectTo: redirectTarget })
export type AuthOtpVerifyInput = z.input<typeof authOtpVerifyInput>

export const authOtpResendInput = z.object({})
export type AuthOtpResendInput = z.input<typeof authOtpResendInput>

export const authOtpCancelInput = z.object({ redirectTo: redirectTarget })
export type AuthOtpCancelInput = z.input<typeof authOtpCancelInput>

export const authPasswordResetRequestInput = z.object({ email: z.string() })
export type AuthPasswordResetRequestInput = z.input<typeof authPasswordResetRequestInput>

export const authPasswordResetInput = z.object({
  token: z.string(),
  password: z.string(),
  purpose: z.enum(['password-reset', 'author-invite']).default('password-reset'),
  redirectTo: redirectTarget,
})
export type AuthPasswordResetInput = z.input<typeof authPasswordResetInput>

export const passkeyAuthFinishInput = z.object({
  response: z.string(),
  challenge: z.string(),
  redirectTo: redirectTarget,
})
export type PasskeyAuthFinishInput = z.input<typeof passkeyAuthFinishInput>
