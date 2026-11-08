import { useQueryClient } from '@tanstack/react-query'
import { CircleAlertIcon, CircleCheckIcon, Loader2Icon, UploadIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useRevalidator } from 'react-router'

import { orpcQuery } from '@/client/api/orpc-query'
import { useFileUpload } from '@/client/hooks/use-file-upload'
import { Button } from '@/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/components/dialog'
import { Input } from '@/ui/components/input'
import { useI18n } from '@/ui/lib/I18nProvider'

// Web-font upload via the dedicated resource route, not oRPC — fonts can be
// 60 MiB and oRPC sits behind the request-wide body limit.
type UploadPhase =
  | { kind: 'idle' }
  | { kind: 'input'; file: File; familyName: string }
  | { kind: 'uploading'; fileName: string; familyName: string }
  | { kind: 'success'; familyName: string }
  | { kind: 'error'; familyName: string; message: string }

export function FontUploadButton() {
  const revalidator = useRevalidator()
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const familyInputRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<UploadPhase>({ kind: 'idle' })

  const dialogOpen = phase.kind !== 'idle'

  // Options close over the click-time family name so the phases keep the value the user saw.
  const inputFamilyName = phase.kind === 'input' ? phase.familyName : ''
  const trimmedFamilyName = inputFamilyName.trim()

  const { upload } = useFileUpload({
    endpoint: '/api/admin/fonts/package/upload',
    t,
    fields: { familyName: trimmedFamilyName },
    accept: ['.ttf', '.otf'],
    maxBytes: 60 * 1024 * 1024,
    messages: {
      invalidType: { title: t('admin.fonts.upload.invalidType') },
      tooLarge: () => ({ title: t('admin.fonts.upload.tooLarge') }),
      httpFailure: (status) => t('admin.fonts.upload.httpFailure', { status }),
      failure: 'admin.toast.unknownErrorRetry',
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

  useEffect(() => {
    if (phase.kind === 'input') {
      const id = requestAnimationFrame(() => familyInputRef.current?.focus())
      return () => cancelAnimationFrame(id)
    }
  }, [phase.kind])

  const reset = () => setPhase({ kind: 'idle' })

  const startUpload = async (file: File) => {
    if (trimmedFamilyName === '') {
      setPhase({ kind: 'error', familyName: inputFamilyName, message: t('admin.fonts.upload.familyNameRequired') })
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
        {t('admin.fonts.upload.button')}
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
  const { t } = useI18n()
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('admin.fonts.upload.inputTitle')}</DialogTitle>
        <DialogDescription>{t('admin.fonts.upload.inputDescription', { file: fileName })}</DialogDescription>
      </DialogHeader>
      <Input
        ref={familyInputRef}
        value={familyName}
        onChange={(e) => onFamilyNameChange(e.target.value)}
        placeholder={t('admin.fonts.upload.familyPlaceholder')}
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
          {t('common.action.cancel')}
        </Button>
        <Button onClick={onUpload} disabled={familyName.trim() === ''}>
          {t('admin.shared.upload.submit')}
        </Button>
      </DialogFooter>
    </>
  )
}

function UploadProgressPhase({ fileName, familyName }: { fileName: string; familyName: string }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <Loader2Icon className="size-10 animate-spin text-primary" />
      <div className="text-center">
        <p className="font-semibold">{t('admin.fonts.upload.processing')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('admin.fonts.upload.processingHint')}</p>
      </div>
      <div className="w-full rounded-md border bg-muted/50 px-3 py-2 text-sm">
        <p>
          <span className="text-muted-foreground">{t('admin.fonts.upload.fileLabel')}</span>
          {fileName}
        </p>
        <p>
          <span className="text-muted-foreground">{t('admin.fonts.upload.familyLabel')}</span>
          {familyName}
        </p>
      </div>
    </div>
  )
}

function UploadSuccessPhase({ familyName, onClose }: { familyName: string; onClose: () => void }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <CircleCheckIcon className="size-10 text-emerald-500" />
      <div className="text-center">
        <p className="font-semibold">{t('admin.fonts.upload.success')}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('admin.fonts.upload.successBody', { name: familyName })}
        </p>
      </div>
      <DialogFooter className="w-full">
        <Button onClick={onClose} className="w-full">
          {t('common.action.close')}
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
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex flex-col items-center gap-3">
        <CircleAlertIcon className="size-10 text-destructive" />
        <div className="text-center">
          <p className="font-semibold">{t('admin.fonts.upload.errorTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('admin.fonts.upload.errorBody', { name: familyName })}
          </p>
        </div>
      </div>
      <div className="w-full rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        {message}
      </div>
      <DialogFooter>
        <Button onClick={onClose} className="w-full">
          {t('common.action.close')}
        </Button>
      </DialogFooter>
    </div>
  )
}
