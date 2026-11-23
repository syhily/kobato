import type { ErrorMessageDescriptor } from '@kobato/api/contracts/primitives'
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'

import { Button } from '@kobato/ui/components/button'
import { Input } from '@kobato/ui/components/input'
import { Label } from '@kobato/ui/components/label'
import { cn } from '@kobato/ui/lib/cn'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { inputClasses } from '@kobato/web-admin/ui/auth/input-classes'
import { PasswordToggle } from '@kobato/web-admin/ui/auth/PasswordToggle'
import { orpc } from '@kobato/web-client/api/client'
import { startAuthentication, WebAuthnAbortService } from '@simplewebauthn/browser'
import { ArrowRightIcon, FingerprintIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Form, Link } from 'react-router'

export interface LoginActionData {
  method?: 'passkey' | 'password'
  message?: string
  messageDescriptor?: ErrorMessageDescriptor
  error?: string
  errorDescriptor?: ErrorMessageDescriptor
}

export interface LoginFormProps {
  redirectTo?: string
  isSubmitting: boolean
  csrfToken?: string
  actionData?: LoginActionData | null
}

function signinActionUrl(handler: 'identify' | 'passkey' | null, redirectTo?: string): string {
  const params = new URLSearchParams()
  if (handler !== null) {
    params.set('action', handler)
  }
  if (redirectTo && redirectTo !== '/') {
    params.set('redirect_to', redirectTo)
  }
  const query = params.toString()
  return query ? `?${query}` : '.'
}

export function useWebAuthnSupported(): boolean {
  const [supported] = useState(() => typeof window !== 'undefined' && 'PublicKeyCredential' in window)
  return supported
}

function isAuthBeginResponse(value: unknown): value is { options: PublicKeyCredentialRequestOptionsJSON } {
  if (typeof value !== 'object' || value === null || !('options' in value)) {
    return false
  }
  const opts = (value as { options: unknown }).options
  if (typeof opts !== 'object' || opts === null) {
    return false
  }
  return typeof (opts as { challenge?: unknown }).challenge === 'string'
}

function extractAuthOptions(value: unknown): PublicKeyCredentialRequestOptionsJSON {
  if (isAuthBeginResponse(value)) {
    return value.options
  }
  throw new Error('Passkey service returned malformed data')
}

type LoginStep = 'email' | 'password' | 'passkey'

const PASSKEY_TIMEOUT_MS = 120_000

export function LoginForm({ redirectTo, isSubmitting, csrfToken, actionData }: LoginFormProps) {
  const { t } = useI18n()
  const [step, setStep] = useState<LoginStep>(() =>
    actionData?.method === 'password' ? 'password' : actionData?.method === 'passkey' ? 'passkey' : 'email',
  )
  const [email, setEmail] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const webAuthnSupported = useWebAuthnSupported()
  const [passkeyError, setPasskeyError] = useState<string | null>(null)
  const [passkeyPending, setPasskeyPending] = useState(false)
  const passkeyFormRef = useRef<HTMLFormElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const passkeyRunRef = useRef(0)

  const [lastActionData, setLastActionData] = useState(actionData)
  if (actionData !== lastActionData) {
    setLastActionData(actionData)
    if (actionData?.method === 'password') {
      setStep('password')
    } else if (actionData?.method === 'passkey') {
      setStep('passkey')
    }
  }

  const runPasskey = useCallback(async () => {
    setPasskeyError(null)
    setPasskeyPending(true)
    const runId = ++passkeyRunRef.current
    const isCurrent = () => passkeyRunRef.current === runId
    const timeoutId = setTimeout(() => {
      if (!isCurrent()) {
        return
      }
      passkeyRunRef.current += 1
      WebAuthnAbortService.cancelCeremony()
      setPasskeyPending(false)
      setPasskeyError(t('auth.signin.passkeyTimeout'))
    }, PASSKEY_TIMEOUT_MS)
    try {
      const result: unknown = await orpc.account.passkey.authBegin({ email: email.trim() })
      const options = extractAuthOptions(result)
      const challenge = options.challenge
      const assertion = await startAuthentication({ optionsJSON: options })
      clearTimeout(timeoutId)
      if (!isCurrent()) {
        return
      }
      const form = passkeyFormRef.current
      if (!form) {
        setPasskeyPending(false)
        return
      }
      form.querySelectorAll('input[name^="passkey_"]').forEach((el) => el.remove())
      const responseInput = document.createElement('input')
      responseInput.type = 'hidden'
      responseInput.name = 'passkey_response'
      responseInput.value = JSON.stringify(assertion)
      form.appendChild(responseInput)
      const challengeInput = document.createElement('input')
      challengeInput.type = 'hidden'
      challengeInput.name = 'passkey_challenge'
      challengeInput.value = challenge
      form.appendChild(challengeInput)
      form.requestSubmit()
      setPasskeyPending(false)
    } catch (err) {
      clearTimeout(timeoutId)
      if (!isCurrent()) {
        return
      }
      setPasskeyPending(false)
      let message = t('auth.signin.passkeyFailed')
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          message = t('auth.signin.passkeyCancelled')
        } else if (err.name === 'SecurityError') {
          message = t('auth.signin.passkeyRejected')
        }
      } else if (err instanceof Error && err.message) {
        message = err.message
      }
      setPasskeyError(message)
    }
  }, [email, t])

  const backToEmail = () => {
    passkeyRunRef.current += 1
    WebAuthnAbortService.cancelCeremony()
    setPasskeyPending(false)
    setPasskeyError(null)
    setStep('email')
  }

  useEffect(() => {
    return () => {
      passkeyRunRef.current += 1
    }
  }, [])

  useEffect(() => {
    if (step === 'password') {
      passwordRef.current?.focus()
    }
  }, [step])

  if (step === 'password') {
    return (
      <Form
        method="post"
        action={signinActionUrl(null, redirectTo)}
        id="loginForm"
        className="flex w-full flex-col gap-6"
      >
        {csrfToken ? <input type="hidden" name="csrf_token" value={csrfToken} /> : null}
        <input type="hidden" name="email" value={email} />
        <div className="flex w-full items-center justify-between gap-2">
          <span className="truncate text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{email}</span>
          </span>
          <button
            type="button"
            onClick={backToEmail}
            className="shrink-0 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('auth.signin.changeEmail')}
          </button>
        </div>
        <div className="flex w-full flex-col gap-2">
          <Label htmlFor="loginForm-password" className="text-admin-base font-semibold">
            {t('auth.signin.password')}
          </Label>
          <div className="relative w-full">
            <Input
              id="loginForm-password"
              ref={passwordRef}
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="•••••••••••••••"
              required
              minLength={10}
              disabled={isSubmitting}
              className={cn(inputClasses, 'pr-auth-input-pad')}
            />
            <div className="absolute top-3 right-2 bottom-3 flex items-center gap-1">
              <PasswordToggle show={showPassword} onToggle={() => setShowPassword((v) => !v)} />
              <Link
                to="?action=lostpassword"
                className="flex items-center border-l border-foreground/20 px-4 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
              >
                {t('auth.signin.forgot')}
              </Link>
            </div>
          </div>
        </div>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="mt-7 h-auth-btn w-full rounded-xl bg-brand text-xl font-normal text-white hover:opacity-90"
        >
          {isSubmitting ? (
            t('auth.signin.submitting')
          ) : (
            <>
              {t('auth.signin.submit')} <ArrowRightIcon className="ml-1 inline-block" size={18} />
            </>
          )}
        </Button>
      </Form>
    )
  }

  const isPasskeyStep = step === 'passkey'
  return (
    <div className="flex w-full flex-col gap-6">
      <Form
        method="post"
        action={signinActionUrl('identify', redirectTo)}
        id="identifyForm"
        className="flex w-full flex-col gap-6"
      >
        {csrfToken ? <input type="hidden" name="csrf_token" value={csrfToken} /> : null}
        <div className="flex w-full flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="identifyForm-email" className="text-admin-base font-semibold">
              {t('auth.signin.email')}
            </Label>
            {isPasskeyStep && (
              <button
                type="button"
                onClick={backToEmail}
                className="shrink-0 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {t('auth.signin.changeEmail')}
              </button>
            )}
          </div>
          <Input
            id="identifyForm-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder={t('auth.shared.emailPlaceholder')}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isSubmitting || isPasskeyStep}
            className={inputClasses}
          />
        </div>
        {isPasskeyStep ? (
          <Button
            type="button"
            disabled={!webAuthnSupported || isSubmitting || passkeyPending}
            onClick={() => {
              void runPasskey()
            }}
            className="mt-7 h-auth-btn w-full rounded-xl bg-brand text-xl font-normal text-white hover:opacity-90"
          >
            {passkeyPending ? (
              t('auth.signin.waitingAuthenticator')
            ) : (
              <>
                {passkeyError ? t('auth.signin.retryPasskey') : t('auth.signin.usePasskey')}
                <FingerprintIcon className="ml-1 inline-block" size={18} />
              </>
            )}
          </Button>
        ) : (
          <Button
            type="submit"
            disabled={isSubmitting}
            className="mt-7 h-auth-btn w-full rounded-xl bg-brand text-xl font-normal text-white hover:opacity-90"
          >
            {isSubmitting ? (
              t('auth.signin.submitting')
            ) : (
              <>
                {t('auth.signin.submit')} <ArrowRightIcon className="ml-1 inline-block" size={18} />
              </>
            )}
          </Button>
        )}
      </Form>
      {isPasskeyStep && (
        <>
          <Form method="post" action={signinActionUrl('passkey', redirectTo)} ref={passkeyFormRef} className="hidden">
            {csrfToken ? <input type="hidden" name="csrf_token" value={csrfToken} /> : null}
          </Form>
          {!webAuthnSupported && (
            <p role="alert" className="text-center text-sm text-destructive">
              {t('auth.signin.passkeyUnsupported')}
            </p>
          )}
          {passkeyError && (
            <p role="alert" aria-live="polite" className="text-center text-sm text-destructive">
              {passkeyError}
            </p>
          )}
          <p className="text-center text-sm text-muted-foreground">
            {passkeyPending ? t('auth.signin.passkeyVerifying') : t('auth.signin.passkeyPrompt')}
          </p>
          <p className="text-center text-sm text-muted-foreground">
            {t('auth.signin.passkeyUnavailable')}
            <Link
              to="?action=lostpassword"
              className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              {t('auth.signin.resetViaEmail')}
            </Link>
          </p>
        </>
      )}
    </div>
  )
}
