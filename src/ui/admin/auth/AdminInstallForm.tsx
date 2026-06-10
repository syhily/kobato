import { EyeIcon, EyeOffIcon, Loader2Icon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Form, useNavigation, useRouteLoaderData } from 'react-router'

import { Button } from '@/ui/components/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/ui/components/dialog'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { extractApiErrorMessage, isApiAccepted } from '@/ui/lib/api-error'
import { cn } from '@/ui/lib/cn'

// Shared auth input styling — must match AdminCredentialsForm.
const inputClasses =
  'h-(--spacing-auth-input) rounded-xl border-0 bg-muted/50 px-4 text-xl md:text-xl placeholder:text-muted-foreground/50 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary'

interface AdminInstallFormProps {
  pgToolsAvailable?: boolean
}

type InstallMode = 'install' | 'restore'

function useCsrfToken(): string | undefined {
  const rootData = useRouteLoaderData<{ csrfToken?: string }>('root')
  return rootData?.csrfToken
}

export function AdminInstallForm({ pgToolsAvailable }: AdminInstallFormProps) {
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting' && navigation.formMethod === 'POST'
  const [showPassword, setShowPassword] = useState(false)
  const csrfToken = useCsrfToken()

  const [mode, setMode] = useState<InstallMode>('install')
  const [isRestoring, setIsRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [waitingForRestart, setWaitingForRestart] = useState(false)
  const [waitStatus, setWaitStatus] = useState<'polling' | 'timeout'>('polling')
  const pollAbortRef = useRef<AbortController | null>(null)

  // Abort any in-flight polling when the component unmounts.
  useEffect(() => {
    return () => {
      pollAbortRef.current?.abort()
    }
  }, [])

  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    if (file && !/\.(sql|sql\.gz)$/i.test(file.name)) {
      setRestoreError('仅支持 .sql 或 .sql.gz 格式的备份文件')
      setSelectedFile(null)
      e.target.value = ''
      return
    }
    setRestoreError(null)
    setSelectedFile(file)
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  async function pollReady(signal: AbortSignal) {
    const MAX_ATTEMPTS = 150
    const INTERVAL_MS = 2000

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      if (signal.aborted) {
        return
      }

      try {
        const res = await fetch('/ready', { cache: 'no-store', signal })
        if (res.ok) {
          window.location.href = '/admin/signin'
          return
        }
      } catch {
        // Network errors during restart are expected; keep polling.
      }

      await new Promise<void>((resolve) => setTimeout(resolve, INTERVAL_MS))
    }

    if (!signal.aborted) {
      setWaitStatus('timeout')
    }
  }

  async function handleRestoreSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setRestoreError(null)
    setIsRestoring(true)

    try {
      const form = e.currentTarget
      const formData = new FormData(form)
      const headers: Record<string, string> = {}
      if (csrfToken) {
        headers['x-csrf-token'] = csrfToken
      }
      const res = await fetch('/api/setup/restore', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers,
      })

      const json: unknown = await res.json()
      const errorMessage = extractApiErrorMessage(json)
      const accepted = isApiAccepted(json)

      if (!res.ok) {
        setRestoreError(errorMessage ?? '恢复失败，请检查备份文件后重试。')
        return
      }

      if (accepted) {
        setWaitingForRestart(true)
        setWaitStatus('polling')
        pollAbortRef.current = new AbortController()
        void pollReady(pollAbortRef.current.signal)
      }
    } catch {
      setRestoreError('网络错误，请稍后重试。')
    } finally {
      setIsRestoring(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <Dialog open={waitingForRestart}>
        <DialogContent showCloseButton={false} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2Icon className="animate-spin" size={18} />
              {waitStatus === 'polling' ? '数据库恢复中，请稍候…' : '连接超时'}
            </DialogTitle>
            <DialogDescription>
              {waitStatus === 'polling'
                ? '备份已接收，服务正在重启。此过程可能需要数十秒，请勿关闭页面。'
                : '等待服务重启超时，请手动刷新页面后前往登录。'}
            </DialogDescription>
          </DialogHeader>
          {waitStatus === 'timeout' && (
            <Button onClick={() => (window.location.href = '/admin/signin')}>前往登录</Button>
          )}
        </DialogContent>
      </Dialog>

      {/* Mode switcher */}
      <div className="flex w-full rounded-xl bg-muted/50 p-1">
        <button
          type="button"
          onClick={() => {
            setMode('install')
            setRestoreError(null)
            setSelectedFile(null)
          }}
          className={cn(
            'flex-1 rounded-xl py-2.5 text-sm font-medium transition-colors',
            mode === 'install'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          全新安装
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('restore')
            setRestoreError(null)
            setSelectedFile(null)
          }}
          disabled={pgToolsAvailable === false}
          className={cn(
            'flex-1 rounded-xl py-2.5 text-sm font-medium transition-colors',
            mode === 'restore'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
            pgToolsAvailable === false && 'cursor-not-allowed opacity-50',
          )}
        >
          从备份恢复
        </button>
      </div>

      {pgToolsAvailable === false && mode === 'restore' ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          当前运行环境缺少 postgresql-client，无法使用备份恢复功能。请联系管理员或选择全新安装。
        </div>
      ) : null}

      {mode === 'install' ? (
        <Form method="post" id="adminInstallForm" className="flex w-full flex-col gap-6">
          <input type="hidden" name="intent" value="install" />
          {csrfToken ? <input type="hidden" name="csrf_token" value={csrfToken} /> : null}
          <div className="flex w-full flex-col gap-2">
            <Label htmlFor="install-title" className="font-semibold text-(--text-admin-base)">
              站点名称
            </Label>
            <Input
              id="install-title"
              name="title"
              type="text"
              autoComplete="off"
              placeholder="My Blog"
              required
              disabled={isSubmitting}
              className={inputClasses}
            />
          </div>

          <div className="flex w-full flex-col gap-2">
            <Label htmlFor="install-name" className="font-semibold text-(--text-admin-base)">
              昵称
            </Label>
            <Input
              id="install-name"
              name="name"
              type="text"
              autoComplete="nickname"
              placeholder="你的名字"
              required
              disabled={isSubmitting}
              className={inputClasses}
            />
          </div>

          <div className="flex w-full flex-col gap-2">
            <Label htmlFor="install-email" className="font-semibold text-(--text-admin-base)">
              邮箱
            </Label>
            <Input
              id="install-email"
              name="email"
              type="email"
              autoComplete="username"
              placeholder="your@email.com"
              required
              disabled={isSubmitting}
              className={inputClasses}
            />
          </div>

          <div className="flex w-full flex-col gap-2">
            <Label htmlFor="install-password" className="font-semibold text-(--text-admin-base)">
              密码
            </Label>
            <div className="relative w-full">
              <Input
                id="install-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="至少 10 个字符"
                required
                minLength={10}
                disabled={isSubmitting}
                className={cn(inputClasses, 'pr-12')}
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="px-1 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                </button>
              </div>
            </div>
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="mt-7 h-(--spacing-auth-btn) w-full rounded-xl bg-brand text-xl font-normal text-white hover:opacity-90"
          >
            {isSubmitting ? (
              '创建中...'
            ) : (
              <>
                创建账号并开始写作 <span aria-hidden>&rarr;</span>
              </>
            )}
          </Button>
        </Form>
      ) : (
        <form
          onSubmit={(e) => {
            void handleRestoreSubmit(e)
          }}
          encType="multipart/form-data"
          className="flex w-full flex-col gap-6"
        >
          {csrfToken ? <input type="hidden" name="csrf_token" value={csrfToken} /> : null}
          <div className="flex w-full flex-col gap-2">
            <Label htmlFor="restore-file" className="font-semibold text-(--text-admin-base)">
              备份文件
            </Label>
            <input
              ref={fileInputRef}
              id="restore-file"
              name="file"
              type="file"
              accept=".sql,.gz,application/gzip"
              required
              disabled={isRestoring || pgToolsAvailable === false}
              onChange={handleFileChange}
              className="sr-only"
              aria-label="选择备份文件"
            />
            <div className="flex items-center gap-3 rounded-xl bg-muted px-3 py-2.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isRestoring || pgToolsAvailable === false}
                onClick={() => fileInputRef.current?.click()}
              >
                {selectedFile ? '重新选择' : '选择文件'}
              </Button>
              {selectedFile ? (
                <span className="text-sm text-muted-foreground">
                  {selectedFile.name}（{formatFileSize(selectedFile.size)}）
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">未选择文件</span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            <p className="mb-2 font-medium text-foreground">恢复说明</p>
            <ul className="flex list-disc flex-col gap-1 pl-4">
              <li>支持 .sql 和 .sql.gz 格式的备份文件。</li>
              <li>备份文件仅还原数据库内容（文章、设置、评论等）。</li>
              <li>S3 上的图片、音乐、品牌资产等不会自动恢复，需单独处理。</li>
            </ul>
          </div>

          {restoreError ? (
            <div role="alert" aria-live="polite" className="text-center text-sm leading-relaxed text-destructive">
              {restoreError}
            </div>
          ) : null}

          <Button
            type="submit"
            disabled={isRestoring || pgToolsAvailable === false || restoreError !== null}
            className="mt-7 h-(--spacing-auth-btn) w-full rounded-xl bg-brand text-xl font-normal text-white hover:opacity-90"
          >
            {isRestoring ? '恢复中...' : '上传并恢复'}
          </Button>
        </form>
      )}
    </div>
  )
}
