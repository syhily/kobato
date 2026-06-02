import { ArrowRightIcon, EyeIcon, EyeOffIcon, SendIcon } from 'lucide-react'
import { useState } from 'react'
import { Form, Link, useNavigation, useRouteLoaderData } from 'react-router'

import { Button } from '@/ui/components/button'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { cn } from '@/ui/lib/cn'

// Shared auth input styling across login / install / reset forms.
const inputClasses =
  'h-(--spacing-auth-input) rounded-xl border-0 bg-muted/50 px-4 text-xl md:text-xl placeholder:text-muted-foreground/50 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary'

function useAuthSubmitting(): boolean {
  const navigation = useNavigation()
  return navigation.state === 'submitting' && navigation.formMethod === 'POST'
}

function useCsrfToken(): string | undefined {
  const rootData = useRouteLoaderData<{ csrfToken?: string }>('root')
  return rootData?.csrfToken
}

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

// ── Login form ──────────────────────────────────────────────────────────────

export interface LoginFormProps {
  action?: string
}

export function LoginForm({ action }: LoginFormProps) {
  const isSubmitting = useAuthSubmitting()
  const [showPassword, setShowPassword] = useState(false)
  const csrfToken = useCsrfToken()

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
      <div className="flex w-full flex-col gap-2">
        <Label htmlFor="loginForm-password" className="font-semibold text-(--text-admin-base)">
          密码
        </Label>
        <div className="relative w-full">
          <Input
            id="loginForm-password"
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

// ── Lost-password form ──────────────────────────────────────────────────────

export interface LostPasswordFormProps {
  action?: string
}

export function LostPasswordForm({ action }: LostPasswordFormProps) {
  const isSubmitting = useAuthSubmitting()
  const csrfToken = useCsrfToken()

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
}

export function ResetPasswordForm({ action, token }: ResetPasswordFormProps) {
  const isSubmitting = useAuthSubmitting()
  const [showPassword, setShowPassword] = useState(false)
  const csrfToken = useCsrfToken()

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
          '保存中...'
        ) : (
          <>
            设置密码 <ArrowRightIcon className="ml-1 inline-block" size={18} />
          </>
        )}
      </Button>
    </Form>
  )
}
