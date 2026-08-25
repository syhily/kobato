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

interface StorageMigrationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Current primary backend: S3 → 换桶/回退本地；local → 配置并启用 S3。 */
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
      toastApiError(error, '启动迁移失败')
    } finally {
      setSubmitting(false)
    }
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
          <DialogTitle>迁移存储</DialogTitle>
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
              label={s3Primary ? '迁移到新的 S3 存储' : '配置并启用 S3 存储'}
              description="把当前存储中的全部文件复制到新的 S3 Bucket，完成后切换。"
            />
            {s3Primary && (
              <LabelledRadio
                id="migration-direction-local"
                value="local"
                label="回退到本地存储"
                description="把 S3 中的全部文件复制回本地文件系统，完成后关闭 S3。"
              />
            )}
          </RadioGroup>

          {direction === 's3' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="migration-endpoint">Endpoint</FieldLabel>
                <Input
                  id="migration-endpoint"
                  type="url"
                  placeholder="https://s3.amazonaws.com"
                  value={target.endpoint}
                  onChange={(e) => set({ endpoint: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <FieldLabel htmlFor="migration-region">Region</FieldLabel>
                  <Input
                    id="migration-region"
                    placeholder="us-east-1 / auto"
                    maxLength={60}
                    value={target.region}
                    onChange={(e) => set({ region: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel htmlFor="migration-bucket">Bucket</FieldLabel>
                  <Input
                    id="migration-bucket"
                    maxLength={120}
                    value={target.bucket}
                    onChange={(e) => set({ bucket: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="migration-access-key-id">Access Key ID</FieldLabel>
                <Input
                  id="migration-access-key-id"
                  autoComplete="off"
                  maxLength={255}
                  value={target.accessKeyId}
                  onChange={(e) => set({ accessKeyId: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="migration-secret">Secret Access Key</FieldLabel>
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
                <FieldLabel htmlFor="migration-url-template">图片地址模板（可选）</FieldLabel>
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
                  强制使用 path-style URL
                </FieldLabel>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            提交前会对目标 S3 做连通性验证；迁移在后台执行，可取消、失败后可从断点继续。
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              取消
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={submitting || s3TargetIncomplete}>
              {submitting ? '正在验证并启动…' : '开始迁移'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
