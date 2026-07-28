import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'

import { startAuthentication } from '@simplewebauthn/browser'
import { ArrowRightIcon, EyeIcon, EyeOffIcon, RotateCcwIcon, SendIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Form, Link } from 'react-router'

import { orpc } from '@/client/api/client'
import { Button } from '@/ui/components/button'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { cn } from '@/ui/lib/cn'

// Shared auth input styling across login / install / reset forms.
const inputClasses =
  'h-(--spacing-auth-input) rounded-xl border-0 bg-muted/50 px-4 text-xl md:text-xl placeholder:text-muted-foreground/50 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary'

function PasswordToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center px-2 text-muted-foreground hover:text-foreground"
      aria-label={show ? '隐藏密码' : '显示密码'}
    >
      {show ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
    </button>
  )
}

// ── Login form (identifier-first: email → passkey / mailbox / password) ─────

export interface LoginActionData {
  method?: 'passkey' | 'password'
  message?: string
  error?: string
}

export interface LoginFormProps {
  action?: string
  isSubmitting: boolean
  csrfToken?: string
  actionData?: LoginActionData | null
}

export function useWebAuthnSupported(): boolean {
  // Lazy initializer runs once on mount; avoids setState-in-effect.
  const [supported] = useState(() => typeof window !== 'undefined' && 'PublicKeyCredential' in window)
  return supported
}

// The `passkey/auth-begin` endpoint returns `{ options: z.any() }` because
// the WebAuthn options JSON is owned by @simplewebauthn. This guard narrows
// the untyped response back to the library's expected shape without an
// unsafe cast.
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
  // Unreachable in practice — the server always returns a well-formed
  // challenge. Throw so a malformed response surfaces as a caught error
  // rather than silent undefined-propagation.
  throw new Error('Passkey 服务返回数据格式错误')
}

type LoginStep = 'email' | 'password' | 'passkey'

export function LoginForm({ action, isSubmitting, csrfToken, actionData }: LoginFormProps) {
  // Initial step derives from the identify answer so a fresh mount (or
  // SSR) lands on the right step, not just actionData *changes*.
  const [step, setStep] = useState<LoginStep>(() =>
    actionData?.method === 'password' ? 'password' : actionData?.method === 'passkey' ? 'passkey' : 'email',
  )
  const [email, setEmail] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const webAuthnSupported = useWebAuthnSupported()
  const [passkeyError, setPasskeyError] = useState<string | null>(null)
  const passkeyFormRef = useRef<HTMLFormElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const passkeyStartedRef = useRef(false)

  // actionData-driven step transitions (same sync-during-render pattern as
  // OtpForm): the identify answer picks the next step.
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
    try {
      const result: unknown = await orpc.passkey.authBegin({ email: email.trim() })
      const options = extractAuthOptions(result)
      const challenge = options.challenge
      const assertion = await startAuthentication({ optionsJSON: options })
      // Submit via a hidden form so the React Router action handles session creation
      const form = passkeyFormRef.current
      if (!form) {
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
    } catch (err) {
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

  // Auto-launch the WebAuthn prompt when the passkey step opens. The
  // browser owns the actual UI (platform prompt, or the cross-device QR
  // code). Guarded against strict-mode double effects and repeated runs.
  useEffect(() => {
    if (step === 'passkey' && webAuthnSupported && !passkeyStartedRef.current) {
      passkeyStartedRef.current = true
      void runPasskey()
    }
    if (step !== 'passkey') {
      passkeyStartedRef.current = false
    }
  }, [step, webAuthnSupported, runPasskey])

  // Focus the password field when the password step opens.
  useEffect(() => {
    if (step === 'password') {
      passwordRef.current?.focus()
    }
  }, [step])

  if (step === 'passkey') {
    return (
      <div className="flex w-full flex-col gap-6">
        <p className="text-center text-sm text-muted-foreground">
          正在验证 <span className="font-medium text-foreground">{email}</span> 的
          Passkey，请按浏览器提示完成验证（跨设备登陆可扫码）。
        </p>
        <Form method="post" action="?action=passkey" ref={passkeyFormRef} className="hidden">
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
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              void runPasskey()
            }}
            disabled={!webAuthnSupported || isSubmitting}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcwIcon size={14} />
            重试
          </button>
          <button
            type="button"
            onClick={() => setStep('email')}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            返回
          </button>
        </div>
      </div>
    )
  }

  if (step === 'password') {
    return (
      <Form method="post" action={action} id="loginForm" className="flex w-full flex-col gap-6">
        {csrfToken ? <input type="hidden" name="csrf_token" value={csrfToken} /> : null}
        <input type="hidden" name="email" value={email} />
        <div className="flex w-full items-center justify-between gap-2">
          <span className="truncate text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{email}</span>
          </span>
          <button
            type="button"
            onClick={() => setStep('email')}
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

  return (
    <Form method="post" action="?action=identify" id="identifyForm" className="flex w-full flex-col gap-6">
      {csrfToken ? <input type="hidden" name="csrf_token" value={csrfToken} /> : null}
      <div className="flex w-full flex-col gap-2">
        <Label htmlFor="identifyForm-email" className="font-semibold text-(--text-admin-base)">
          邮箱
        </Label>
        <Input
          id="identifyForm-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="your@email.com"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={isSubmitting}
          className={inputClasses}
        />
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

// ── Magic-link confirm form ─────────────────────────────────────────────────

export interface MagicLinkConfirmFormProps {
  action?: string
  token: string
  isSubmitting: boolean
  csrfToken?: string
}

export function MagicLinkConfirmForm({ action, token, isSubmitting, csrfToken }: MagicLinkConfirmFormProps) {
  return (
    <Form
      method="post"
      action={action ?? '?action=magiclink'}
      id="magicLinkForm"
      className="flex w-full flex-col gap-6"
    >
      <input type="hidden" name="magic_token" value={token} />
      {csrfToken ? <input type="hidden" name="csrf_token" value={csrfToken} /> : null}
      <p className="text-center text-sm text-muted-foreground">点击下方按钮完成登录，链接仅可使用一次。</p>
      <Button
        type="submit"
        disabled={isSubmitting}
        className="mt-7 h-(--spacing-auth-btn) w-full rounded-xl bg-brand text-xl font-normal text-white hover:opacity-90"
      >
        {isSubmitting ? (
          '登陆中...'
        ) : (
          <>
            确认登陆 <ArrowRightIcon className="ml-1 inline-block" size={18} />
          </>
        )}
      </Button>
    </Form>
  )
}

// ── Lost-password form ──────────────────────────────────────────────────────

export interface LostPasswordFormProps {
  action?: string
  isSubmitting: boolean
  csrfToken?: string
}

export function LostPasswordForm({ action, isSubmitting, csrfToken }: LostPasswordFormProps) {
  return (
    <Form method="post" action={action} id="loginForm" className="flex w-full flex-col gap-6">
      {csrfToken ? <input type="hidden" name="csrf_token" value={csrfToken} /> : null}
      <div className="flex w-full flex-col gap-2">
        <Label htmlFor="loginForm-email" className="font-semibold text-(--text-admin-base)">
          邮箱
        </Label>
        <Input
          id="loginForm-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="your@email.com"
          required
          disabled={isSubmitting}
          className={inputClasses}
        />
      </div>
      <Button
        type="submit"
        disabled={isSubmitting}
        className="mt-7 h-(--spacing-auth-btn) w-full rounded-xl bg-brand text-xl font-normal text-white hover:opacity-90"
      >
        {isSubmitting ? (
          '发送中...'
        ) : (
          <>
            发送重置邮件 <SendIcon className="ml-1 inline-block" size={18} />
          </>
        )}
      </Button>
      <p className="text-center text-(--text-admin-sm) text-muted-foreground">
        <Link to="/admin/signin" className="transition-colors hover:text-foreground">
          返回登陆
        </Link>
      </p>
    </Form>
  )
}

// ── Reset-password form (covers both resetpassword and accept-invite) ───────

export interface ResetPasswordFormProps {
  action?: string
  token: string
  isSubmitting: boolean
  csrfToken?: string
}

export function ResetPasswordForm({ action, token, isSubmitting, csrfToken }: ResetPasswordFormProps) {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <Form method="post" action={action} id="loginForm" className="flex w-full flex-col gap-6">
      <input type="hidden" name="reset_token" value={token} />
      {csrfToken ? <input type="hidden" name="csrf_token" value={csrfToken} /> : null}
      <div className="flex w-full flex-col gap-2">
        <Label htmlFor="loginForm-password" className="font-semibold text-(--text-admin-base)">
          新密码
        </Label>
        <div className="relative w-full">
          <Input
            id="loginForm-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="•••••••••••••••"
            required
            minLength={6}
            disabled={isSubmitting}
            className={cn(inputClasses, 'pr-12')}
          />
          <div className="absolute top-3 right-2 bottom-3 flex items-center">
            <PasswordToggle show={showPassword} onToggle={() => setShowPassword((v) => !v)} />
          </div>
        </div>
      </div>
      <Button
        type="submit"
        disabled={isSubmitting}
        className="mt-7 h-(--spacing-auth-btn) w-full rounded-xl bg-brand text-xl font-normal text-white hover:opacity-90"
      >
        {isSubmitting ? (
          '保存中…'
        ) : (
          <>
            设置密码 <ArrowRightIcon className="ml-1 inline-block" size={18} />
          </>
        )}
      </Button>
    </Form>
  )
}

// ── OTP form ────────────────────────────────────────────────────────────────

export interface OtpFormProps {
  email: string
  sentAt: number
  isSubmitting: boolean
  csrfToken?: string
  actionData?: LoginActionData | null
}

const RESEND_COOLDOWN_SECONDS = 60

function calcInitialCooldown(sentAt: number): number {
  const elapsed = (Date.now() - sentAt) / 1000
  return Math.max(0, Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed))
}

export function OtpForm({ email, sentAt, isSubmitting, csrfToken, actionData }: OtpFormProps) {
  const [cooldown, setCooldown] = useState(() => calcInitialCooldown(sentAt))

  const shouldTick = cooldown > 0
  useEffect(() => {
    if (!shouldTick) {
      return
    }
    const id = setInterval(() => {
      setCooldown((p) => (p <= 1 ? 0 : p - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [shouldTick])

  const [lastActionData, setLastActionData] = useState(actionData)
  if (actionData !== lastActionData) {
    setLastActionData(actionData)
    if (actionData?.message === '验证码已重新发送。') {
      setCooldown(RESEND_COOLDOWN_SECONDS)
    }
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <p className="text-center text-sm text-muted-foreground">
        验证码已发送至 <span className="font-medium text-foreground">{email}</span>，请输入 6 位验证码
      </p>

      <Form method="post" action="?action=verifyotp" id="otpForm" className="flex w-full flex-col gap-6">
        {csrfToken ? <input type="hidden" name="csrf_token" value={csrfToken} /> : null}
        <div className="flex w-full flex-col gap-2">
          <Label htmlFor="otpForm-otp" className="font-semibold text-(--text-admin-base)">
            验证码
          </Label>
          <Input
            id="otpForm-otp"
            name="otp_code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            required
            minLength={6}
            maxLength={6}
            pattern="[0-9]{6}"
            disabled={isSubmitting}
            className={cn(inputClasses, 'text-center tracking-[0.5em]')}
          />
        </div>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="mt-7 h-(--spacing-auth-btn) w-full rounded-xl bg-brand text-xl font-normal text-white hover:opacity-90"
        >
          {isSubmitting ? (
            '验证中...'
          ) : (
            <>
              验证并登录 <ArrowRightIcon className="ml-1 inline-block" size={18} />
            </>
          )}
        </Button>
      </Form>

      <div className="flex items-center justify-between">
        <Form method="post" action="?action=resendotp" className="inline">
          {csrfToken ? <input type="hidden" name="csrf_token" value={csrfToken} /> : null}
          <button
            type="submit"
            disabled={cooldown > 0 || isSubmitting}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcwIcon size={14} />
            {cooldown > 0 ? `${cooldown} 秒后重新发送` : '重新发送'}
          </button>
        </Form>
        <Form method="post" action="?action=cancelotp" className="inline">
          {csrfToken ? <input type="hidden" name="csrf_token" value={csrfToken} /> : null}
          <button type="submit" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            返回登录
          </button>
        </Form>
      </div>
    </div>
  )
}
