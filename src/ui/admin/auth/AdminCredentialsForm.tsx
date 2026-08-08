import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'

import { startAuthentication, WebAuthnAbortService } from '@simplewebauthn/browser'
import { ArrowRightIcon, FingerprintIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Form, Link } from 'react-router'

import { orpc } from '@/client/api/client'
import { inputClasses, PasswordToggle } from '@/ui/admin/auth/shared'
import { Button } from '@/ui/components/button'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { cn } from '@/ui/lib/cn'

export interface LoginActionData {
  method?: 'passkey' | 'password'
  message?: string
  error?: string
}

export interface LoginFormProps {
  redirectTo?: string
  isSubmitting: boolean
  csrfToken?: string
  actionData?: LoginActionData | null
}

// Each step posts to its own handler URL (a bare <Form> would loop the previous `action`); redirect rides along.
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
  // Lazy initializer runs once on mount; avoids setState-in-effect.
  const [supported] = useState(() => typeof window !== 'undefined' && 'PublicKeyCredential' in window)
  return supported
}

// `passkey/auth-begin` returns `{ options: z.any() }` — narrows the untyped
// response to the library's expected shape without an unsafe cast.
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
  // Unreachable in practice — throw so a malformed response surfaces as a caught error.
  throw new Error('Passkey 服务返回数据格式错误')
}

type LoginStep = 'email' | 'password' | 'passkey'

// A cross-device ceremony can leave the browser promise pending forever;
// past two minutes retire the run and surface a visible error.
const PASSKEY_TIMEOUT_MS = 120_000

export function LoginForm({ redirectTo, isSubmitting, csrfToken, actionData }: LoginFormProps) {
  // Initial step derives from the identify answer so a fresh mount / SSR lands on the right step.
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
  // Monotonic run id: a retry / timeout retires the in-flight ceremony so a
  // late-resolving promise can never submit or overwrite a newer error state.
  const passkeyRunRef = useRef(0)

  // actionData-driven step transitions (same sync-during-render pattern as OtpForm).
  const [lastActionData, setLastActionData] = useState(actionData)
  if (actionData !== lastActionData) {
    setLastActionData(actionData)
    if (actionData?.method === 'password') {
      setStep('password')
    } else if (actionData?.method === 'passkey') {
      setStep('passkey')
    }
  }

  // The ceremony MUST launch from a user gesture — modal WebAuthn requires transient activation.
  const runPasskey = useCallback(async () => {
    setPasskeyError(null)
    setPasskeyPending(true)
    const runId = ++passkeyRunRef.current
    const isCurrent = () => passkeyRunRef.current === runId
    const timeoutId = setTimeout(() => {
      if (!isCurrent()) {
        return
      }
      // Retire the run first so the abort's rejection lands as stale, not as an overwrite.
      passkeyRunRef.current += 1
      // Dismiss the native prompt so the QR sheet doesn't linger behind the error state.
      WebAuthnAbortService.cancelCeremony()
      setPasskeyPending(false)
      setPasskeyError('Passkey 验证超时，请重试。多次失败可通过下方链接改用邮箱登录。')
    }, PASSKEY_TIMEOUT_MS)
    try {
      const result: unknown = await orpc.passkey.authBegin({ email: email.trim() })
      const options = extractAuthOptions(result)
      const challenge = options.challenge
      const assertion = await startAuthentication({ optionsJSON: options })
      clearTimeout(timeoutId)
      if (!isCurrent()) {
        return
      }
      // Submit via a hidden form so the React Router action handles session creation
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
      // The router's `isSubmitting` takes over the disabled state from here.
      form.requestSubmit()
      setPasskeyPending(false)
    } catch (err) {
      clearTimeout(timeoutId)
      if (!isCurrent()) {
        return
      }
      setPasskeyPending(false)
      let message = 'Passkey 登录失败，请重试。'
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          message = 'Passkey 验证被取消或超时。'
        } else if (err.name === 'SecurityError') {
          message = 'Passkey 验证因安全原因被拒绝。'
        }
      } else if (err instanceof Error && err.message) {
        message = err.message
      }
      setPasskeyError(message)
    }
  }, [email])

  // Leaving the passkey step retires any in-flight ceremony and dismisses the
  // lingering native prompt.
  const backToEmail = () => {
    passkeyRunRef.current += 1
    WebAuthnAbortService.cancelCeremony()
    setPasskeyPending(false)
    setPasskeyError(null)
    setStep('email')
  }

  // Unmounting retires any in-flight ceremony for the same reason.
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
            更换邮箱
          </button>
        </div>
        <div className="flex w-full flex-col gap-2">
          <Label htmlFor="loginForm-password" className="font-semibold text-(--text-admin-base)">
            密码
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
                忘记？
              </Link>
            </div>
          </div>
        </div>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="mt-7 h-(--spacing-auth-btn) w-full rounded-xl bg-brand text-xl font-normal text-white hover:opacity-90"
        >
          {isSubmitting ? (
            '登陆中...'
          ) : (
            <>
              登陆 <ArrowRightIcon className="ml-1 inline-block" size={18} />
            </>
          )}
        </Button>
      </Form>
    )
  }

  // The email and passkey states share the identify form's layout: the input
  // locks and the primary button becomes the scenario's action.
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
            <Label htmlFor="identifyForm-email" className="font-semibold text-(--text-admin-base)">
              邮箱
            </Label>
            {isPasskeyStep && (
              <button
                type="button"
                onClick={backToEmail}
                className="shrink-0 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                更换邮箱
              </button>
            )}
          </div>
          <Input
            id="identifyForm-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="your@email.com"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isSubmitting || isPasskeyStep}
            className={inputClasses}
          />
        </div>
        {isPasskeyStep ? (
          /* The ceremony launches from this click — inside the browser's transient-activation window. */
          <Button
            type="button"
            disabled={!webAuthnSupported || isSubmitting || passkeyPending}
            onClick={() => {
              void runPasskey()
            }}
            className="mt-7 h-(--spacing-auth-btn) w-full rounded-xl bg-brand text-xl font-normal text-white hover:opacity-90"
          >
            {passkeyPending ? (
              '等待验证器…'
            ) : (
              <>
                {passkeyError ? '重试 Passkey 登陆' : '使用 Passkey 登陆'}
                <FingerprintIcon className="ml-1 inline-block" size={18} />
              </>
            )}
          </Button>
        ) : (
          <Button
            type="submit"
            disabled={isSubmitting}
            className="mt-7 h-(--spacing-auth-btn) w-full rounded-xl bg-brand text-xl font-normal text-white hover:opacity-90"
          >
            {isSubmitting ? (
              '登陆中...'
            ) : (
              <>
                登陆 <ArrowRightIcon className="ml-1 inline-block" size={18} />
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
              当前浏览器不支持 Passkey。
            </p>
          )}
          {passkeyError && (
            <p role="alert" aria-live="polite" className="text-center text-sm text-destructive">
              {passkeyError}
            </p>
          )}
          <p className="text-center text-sm text-muted-foreground">
            {passkeyPending
              ? '正在验证 Passkey，请按浏览器提示完成验证（跨设备登陆可扫码）。'
              : '此账号已启用 Passkey 验证，请点击上方按钮完成登陆。'}
          </p>
          {/* Passkey-only account with a failing ceremony is otherwise a lockout — identify always routes back here. */}
          <p className="text-center text-sm text-muted-foreground">
            无法使用 Passkey？
            <Link
              to="?action=lostpassword"
              className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              通过邮箱重置密码
            </Link>
          </p>
        </>
      )}
    </div>
  )
}
