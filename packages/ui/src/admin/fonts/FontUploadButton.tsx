import { orpcQuery } from '@kobato/client/api/orpc-query'
import { useFileUpload } from '@kobato/client/hooks/use-file-upload'
import { Button } from '@kobato/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kobato/ui/components/dialog'
import { Input } from '@kobato/ui/components/input'
import { useQueryClient } from '@tanstack/react-query'
import { CircleAlertIcon, CircleCheckIcon, Loader2Icon, UploadIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useRevalidator } from 'react-router'

// Web-font upload button + dialog: name input → upload progress →
// success/error result. Uses the dedicated resource route (not oRPC, which
// sits behind the request-wide body limit) because source fonts can be
// 60 MiB; slicing runs synchronously server-side (~15–20s for CJK), so the
// progress phase holds until the response returns.

type UploadPhase =
  | { kind: 'idle' }
  | { kind: 'input'; file: File; familyName: string }
  | { kind: 'uploading'; fileName: string; familyName: string }
  | { kind: 'success'; familyName: string }
  | { kind: 'error'; familyName: string; message: string }

export function FontUploadButton() {
  const revalidator = useRevalidator()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const familyInputRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<UploadPhase>({ kind: 'idle' })

  const dialogOpen = phase.kind !== 'idle'

  // The upload options close over the family name from the click-time
  // render, so the guards, multipart fields, and result phases keep the
  // value the user saw even after the phase advances and the name
  // re-renders empty.
  const inputFamilyName = phase.kind === 'input' ? phase.familyName : ''
  const trimmedFamilyName = inputFamilyName.trim()

  const { upload } = useFileUpload({
    endpoint: '/api/admin/fonts/package/upload',
    fields: { familyName: trimmedFamilyName },
    accept: ['.ttf', '.otf'],
    maxBytes: 60 * 1024 * 1024,
    messages: {
      invalidType: { title: '仅支持 .ttf 或 .otf 字体文件' },
      tooLarge: () => ({ title: '字体文件大小上限为 60 MB' }),
      httpFailure: (status) => `服务器错误 (${status})`,
      failure: '未知错误，请稍后重试',
    },
    onSuccess: async () => {
      // Await the refetch so the success phase renders the fresh list.
      await queryClient.invalidateQueries({ queryKey: orpcQuery.admin.fonts.list.key() })
      void revalidator.revalidate()
      setPhase({ kind: 'success', familyName: trimmedFamilyName })
    },
    onError: (message) => {
      setPhase({ kind: 'error', familyName: trimmedFamilyName, message })
    },
  })

  // Focus the family-name input when the dialog enters the input phase.
  useEffect(() => {
    if (phase.kind === 'input') {
      const id = requestAnimationFrame(() => familyInputRef.current?.focus())
      return () => cancelAnimationFrame(id)
    }
  }, [phase.kind])

  // Reset everything when the dialog closes.
  const reset = () => setPhase({ kind: 'idle' })

  const startUpload = async (file: File) => {
    if (trimmedFamilyName === '') {
      setPhase({ kind: 'error', familyName: inputFamilyName, message: '请填写字体族名' })
      return
    }
    setPhase({ kind: 'uploading', fileName: file.name, familyName: inputFamilyName })
    await upload(file)
  }

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) {
      setPhase({
        kind: 'input',
        file: f,
        familyName: f.name.replace(/\.(ttf|otf)$/i, ''),
      })
    }
    e.target.value = ''
  }

  return (
    <>
      <input ref={fileInputRef} type="file" accept=".ttf,.otf" hidden onChange={onFileSelected} />
      <Button type="button" onClick={() => fileInputRef.current?.click()}>
        <UploadIcon data-icon="sm" />
        上传字体
      </Button>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && reset()}>
        <DialogContent className="sm:max-w-sm" showCloseButton={phase.kind !== 'uploading'}>
          {phase.kind === 'input' && (
            <UploadInputPhase
              familyName={phase.familyName}
              fileName={phase.file.name}
              familyInputRef={familyInputRef}
              onFamilyNameChange={(name) => setPhase({ ...phase, familyName: name })}
              onCancel={reset}
              onUpload={() => {
                void startUpload(phase.file)
              }}
            />
          )}
          {phase.kind === 'uploading' && (
            <UploadProgressPhase fileName={phase.fileName} familyName={phase.familyName} />
          )}
          {phase.kind === 'success' && <UploadSuccessPhase familyName={phase.familyName} onClose={reset} />}
          {phase.kind === 'error' && (
            <UploadErrorPhase familyName={phase.familyName} message={phase.message} onClose={reset} />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

// ---- phase sub-components --------------------------------------------------

function UploadInputPhase({
  familyName,
  fileName,
  familyInputRef,
  onFamilyNameChange,
  onCancel,
  onUpload,
}: {
  familyName: string
  fileName: string
  familyInputRef: React.RefObject<HTMLInputElement | null>
  onFamilyNameChange: (name: string) => void
  onCancel: () => void
  onUpload: () => void
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>上传网站字体</DialogTitle>
        <DialogDescription>
          文件：{fileName}
          <br />
          请输入字体族名，用于 CSS font-family 属性。
        </DialogDescription>
      </DialogHeader>
      <Input
        ref={familyInputRef}
        value={familyName}
        onChange={(e) => onFamilyNameChange(e.target.value)}
        placeholder="例如：OPPOSans"
        maxLength={100}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onUpload()
          }
        }}
      />
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button onClick={onUpload} disabled={familyName.trim() === ''}>
          上传
        </Button>
      </DialogFooter>
    </>
  )
}

function UploadProgressPhase({ fileName, familyName }: { fileName: string; familyName: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <Loader2Icon className="size-10 animate-spin text-primary" />
      <div className="text-center">
        <p className="font-semibold">处理中…</p>
        <p className="mt-1 text-sm text-muted-foreground">分包可能需要数十秒，请耐心等待。</p>
      </div>
      <div className="w-full rounded-md border bg-muted/50 px-3 py-2 text-sm">
        <p>
          <span className="text-muted-foreground">文件：</span>
          {fileName}
        </p>
        <p>
          <span className="text-muted-foreground">族名：</span>
          {familyName}
        </p>
      </div>
    </div>
  )
}

function UploadSuccessPhase({ familyName, onClose }: { familyName: string; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <CircleCheckIcon className="size-10 text-emerald-500" />
      <div className="text-center">
        <p className="font-semibold">上传成功</p>
        <p className="mt-1 text-sm text-muted-foreground">「{familyName}」已添加到网站字体库。</p>
      </div>
      <DialogFooter className="w-full">
        <Button onClick={onClose} className="w-full">
          关闭
        </Button>
      </DialogFooter>
    </div>
  )
}

function UploadErrorPhase({
  familyName,
  message,
  onClose,
}: {
  familyName: string
  message: string
  onClose: () => void
}) {
  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex flex-col items-center gap-3">
        <CircleAlertIcon className="size-10 text-destructive" />
        <div className="text-center">
          <p className="font-semibold">上传失败</p>
          <p className="mt-1 text-sm text-muted-foreground">「{familyName}」未能完成上传。</p>
        </div>
      </div>
      <div className="w-full rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        {message}
      </div>
      <DialogFooter>
        <Button onClick={onClose} className="w-full">
          关闭
        </Button>
      </DialogFooter>
    </div>
  )
}
