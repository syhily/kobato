import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { toastApiError } from '@/client/lib/toast-api-error'
import { LabelledRadio } from '@/ui/admin/shared/LabelledRadio'
import { Button } from '@/ui/components/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/ui/components/dialog'
import { FieldLabel } from '@/ui/components/field'
import { Input } from '@/ui/components/input'
import { RadioGroup } from '@/ui/components/radio-group'
import { Switch } from '@/ui/components/switch'
import { useI18n } from '@/ui/lib/I18nProvider'

interface StorageMigrationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Current primary backend: S3 → migrate bucket / fall back to local; local → configure and enable S3. */
  s3Primary: boolean
}

interface S3TargetForm {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle: boolean
  urlTemplate: string
}

const EMPTY_TARGET: S3TargetForm = {
  endpoint: '',
  region: '',
  bucket: '',
  accessKeyId: '',
  secretAccessKey: '',
  forcePathStyle: false,
  urlTemplate: '',
}

/**
 * Migration wizard: pick a direction, fill the target S3 config when needed,
 * submit → `admin.storage.startMigration`. The server probes connectivity
 * before accepting; progress is shown by the page's migration card.
 */
export function StorageMigrationDialog({ open, onOpenChange, s3Primary }: StorageMigrationDialogProps) {
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const [direction, setDirection] = useState<'s3' | 'local'>('s3')
  const [target, setTarget] = useState<S3TargetForm>(EMPTY_TARGET)
  const [submitting, setSubmitting] = useState(false)

  const set = (patch: Partial<S3TargetForm>) => setTarget((prev) => ({ ...prev, ...patch }))

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      if (direction === 'local') {
        await orpc.admin.storage.startMigration({ target: 'local' })
      } else {
        await orpc.admin.storage.startMigration({
          target: 's3',
          config: {
            endpoint: target.endpoint.trim(),
            region: target.region.trim(),
            bucket: target.bucket.trim(),
            accessKeyId: target.accessKeyId.trim(),
            secretAccessKey: target.secretAccessKey.trim(),
            forcePathStyle: target.forcePathStyle,
            urlTemplate: target.urlTemplate.trim(),
          },
        })
      }
      setTarget(EMPTY_TARGET)
      onOpenChange(false)
      await queryClient.invalidateQueries({ queryKey: orpcQuery.admin.storage.migrationStatus.key() })
    } catch (error) {
      toastApiError(error, 'admin.toast.migrationStartFailed', t)
    }
    // React Compiler can't lower try/finally — the pending reset runs after the catch instead.
    setSubmitting(false)
  }

  const s3TargetIncomplete =
    direction === 's3' &&
    (target.endpoint.trim() === '' ||
      target.region.trim() === '' ||
      target.bucket.trim() === '' ||
      target.accessKeyId.trim() === '' ||
      target.secretAccessKey.trim() === '')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('admin.settings.storage.migration.dialog.title')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <RadioGroup
            value={direction}
            onValueChange={(value) => {
              if (value === 's3' || value === 'local') {
                setDirection(value)
              }
            }}
          >
            <LabelledRadio
              id="migration-direction-s3"
              value="s3"
              label={t(
                s3Primary
                  ? 'admin.settings.storage.migration.dialog.migrateToS3'
                  : 'admin.settings.storage.migration.dialog.enableS3',
              )}
              description={t('admin.settings.storage.migration.dialog.s3Description')}
            />
            {s3Primary && (
              <LabelledRadio
                id="migration-direction-local"
                value="local"
                label={t('admin.settings.storage.migration.dialog.localLabel')}
                description={t('admin.settings.storage.migration.dialog.localDescription')}
              />
            )}
          </RadioGroup>

          {direction === 's3' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="migration-endpoint">{t('admin.settings.storage.s3.endpoint')}</FieldLabel>
                <Input
                  id="migration-endpoint"
                  type="url"
                  placeholder={t('admin.settings.storage.s3.endpointPlaceholder')}
                  value={target.endpoint}
                  onChange={(e) => set({ endpoint: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <FieldLabel htmlFor="migration-region">{t('admin.settings.storage.s3.region')}</FieldLabel>
                  <Input
                    id="migration-region"
                    placeholder={t('admin.settings.storage.migration.dialog.regionPlaceholder')}
                    maxLength={60}
                    value={target.region}
                    onChange={(e) => set({ region: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel htmlFor="migration-bucket">{t('admin.settings.storage.s3.bucket')}</FieldLabel>
                  <Input
                    id="migration-bucket"
                    maxLength={120}
                    value={target.bucket}
                    onChange={(e) => set({ bucket: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="migration-access-key-id">{t('admin.settings.storage.s3.accessKey')}</FieldLabel>
                <Input
                  id="migration-access-key-id"
                  autoComplete="off"
                  maxLength={255}
                  value={target.accessKeyId}
                  onChange={(e) => set({ accessKeyId: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="migration-secret">{t('admin.settings.storage.s3.secret')}</FieldLabel>
                <Input
                  id="migration-secret"
                  type="password"
                  autoComplete="off"
                  maxLength={512}
                  value={target.secretAccessKey}
                  onChange={(e) => set({ secretAccessKey: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="migration-url-template">{t('admin.settings.storage.s3.urlTemplate')}</FieldLabel>
                <Input
                  id="migration-url-template"
                  maxLength={500}
                  value={target.urlTemplate}
                  onChange={(e) => set({ urlTemplate: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="migration-force-path-style"
                  checked={target.forcePathStyle}
                  onCheckedChange={(checked) => set({ forcePathStyle: checked })}
                />
                <FieldLabel htmlFor="migration-force-path-style" className="font-normal">
                  {t('admin.settings.storage.s3.pathStyleLabel')}
                </FieldLabel>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">{t('admin.settings.storage.migration.dialog.verifyNote')}</p>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t('common.action.cancel')}
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={submitting || s3TargetIncomplete}>
              {submitting
                ? t('admin.settings.storage.migration.dialog.submitting')
                : t('admin.settings.storage.migration.dialog.start')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
