import type { CacheBucketId } from '@kobato/cache/types'
import type { CacheBucketStats } from '@kobato/contracts/cache'
import type { CacheSettings } from '@kobato/settings/types'
import type { ClearStatus } from '@kobato/web-admin/ui/settings/cache/cache-status'

import { Button } from '@kobato/ui/components/button'
import { Input } from '@kobato/ui/components/input'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { formatBytes } from '@kobato/utils/format'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { MAX_TTL_HOURS, MIN_TTL_HOURS, SECONDS_PER_HOUR } from '@kobato/web-admin/ui/settings/cache/cache-constants'
import { clamp, formatTtl, hoursToSeconds } from '@kobato/web-admin/ui/settings/cache/cache-formatters'
import {
  type BucketDraft,
  draftsEqual,
  snapshotFromSettings,
  validateBucket,
} from '@kobato/web-admin/ui/settings/cache/cache-validation'
import { BucketSaveStatus, ReadOnlyStatusLine } from '@kobato/web-admin/ui/settings/cache/CacheStatusLine'
import { SettingsRow } from '@kobato/web-admin/ui/settings/SettingsSection'
import { SettingGroup } from '@kobato/web-admin/ui/settings/shell/SettingGroup'
import { useSettingsMutation } from '@kobato/web-admin/ui/settings/use-settings-mutation'
import { SaveIcon, SquarePenIcon, Trash2Icon, XIcon } from 'lucide-react'
import { type SubmitEventHandler, useCallback, useMemo, useRef, useState } from 'react'

type CacheSlice = CacheSettings['cache']

interface BucketCardProps {
  bucket: CacheBucketStats
  settings?: { prefix: string; ttlSeconds: number }
  allBuckets: CacheSlice
  isClearPending: boolean
  clearStatus: ClearStatus
  onClear: () => void
}

export function BucketCard({ bucket, settings, allBuckets, isClearPending, clearStatus, onClear }: BucketCardProps) {
  const { locale, t } = useI18n()
  const editable = settings !== undefined
  const effectiveSettings = useMemo(
    () => settings ?? { prefix: bucket.prefix, ttlSeconds: bucket.ttlSeconds },
    [settings, bucket.prefix, bucket.ttlSeconds],
  )
  const [isEditing, setIsEditing] = useState(false)
  const [snapshot, setSnapshot] = useState<BucketDraft>(() => snapshotFromSettings(effectiveSettings))
  const [draft, setDraft] = useState<BucketDraft>(snapshot)
  const submittedDraftRef = useRef<{ value: BucketDraft } | null>(null)
  const [savingFromHere, setSavingFromHere] = useState(false)

  const [lastSettingsRef, setLastSettingsRef] = useState<{ settings: typeof effectiveSettings; isEditing: boolean }>({
    settings: effectiveSettings,
    isEditing,
  })
  if (lastSettingsRef.settings !== effectiveSettings || lastSettingsRef.isEditing !== isEditing) {
    setLastSettingsRef({ settings: effectiveSettings, isEditing })
    const fresh = snapshotFromSettings(effectiveSettings)
    setSnapshot(fresh)
    if (!isEditing) {
      setDraft(fresh)
    }
  }

  const isDirty = !draftsEqual(draft, snapshot)
  const onSaved = useCallback(() => {
    const submitted = submittedDraftRef.current
    if (!submitted) {
      return
    }
    submittedDraftRef.current = null
    setSnapshot(submitted.value)
  }, [])
  const { commit, isPending: isSavePending, status: saveStatus } = useSettingsMutation()

  const save = useCallback(
    async (payload: Record<string, unknown>) => {
      const result = await commit('cache', payload)
      if (result.ok) {
        onSaved?.()
      }
    },
    [commit, onSaved],
  )

  const [lastSaveStatus, setLastSaveStatus] = useState<{ status: typeof saveStatus; saving: boolean }>({
    status: saveStatus,
    saving: savingFromHere,
  })
  if (lastSaveStatus.status !== saveStatus || lastSaveStatus.saving !== savingFromHere) {
    setLastSaveStatus({ status: saveStatus, saving: savingFromHere })
    if (saveStatus === 'saved' && savingFromHere) {
      setIsEditing(false)
      setSavingFromHere(false)
    }
  }

  const otherBuckets = useMemo(() => {
    const all = unsafeCast<[CacheBucketId, { prefix: string; ttlSeconds: number }][]>(Object.entries(allBuckets)).map(
      ([id, slot]) => ({ id, prefix: slot.prefix }),
    )
    return all.filter((entry) => entry.id !== bucket.id)
  }, [allBuckets, bucket.id])

  const validationError = useMemo(
    () => (isEditing ? validateBucket(draft, bucket.id, otherBuckets, t) : null),
    [isEditing, draft, bucket.id, otherBuckets, t],
  )

  const onSubmit: SubmitEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()
    if (validationError !== null) {
      return
    }
    setSavingFromHere(true)
    const submittedDraft = {
      prefix: draft.prefix.trim(),
      ttlHours: draft.ttlHours,
    }
    submittedDraftRef.current = { value: submittedDraft }
    void save({
      cache: {
        [bucket.id]: {
          prefix: submittedDraft.prefix,
          ttlSeconds: hoursToSeconds(submittedDraft.ttlHours),
        },
      },
    })
  }

  const onCancel = () => {
    setDraft(snapshot)
    setIsEditing(false)
  }

  const onEdit = () => {
    setDraft(snapshot)
    setIsEditing(true)
  }

  const isClearingSelf = isClearPending && clearStatus.target === bucket.id
  const prefixId = `cache-${bucket.id}-prefix`
  const ttlId = `cache-${bucket.id}-ttl`

  const actionButtons = (
    <>
      {editable ? (
        isEditing ? (
          <Button type="button" variant="ghost" disabled={isSavePending} onClick={onCancel}>
            <XIcon data-icon /> {t('common.action.cancel')}
          </Button>
        ) : (
          <Button type="button" variant="outline" disabled={isClearPending} onClick={onEdit}>
            <SquarePenIcon data-icon /> {t('common.action.edit')}
          </Button>
        )
      ) : null}
      {editable && isEditing ? (
        <Button type="submit" disabled={isSavePending || !isDirty || validationError !== null}>
          <SaveIcon data-icon />{' '}
          {isSavePending ? t('admin.settings.cache.bucket.saving') : t('admin.settings.cache.bucket.save')}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="destructive-soft"
        disabled={isClearPending || isSavePending || bucket.keyCount === 0}
        onClick={onClear}
      >
        <Trash2Icon data-icon />{' '}
        {isClearingSelf ? t('admin.settings.cache.view.clearing') : t('admin.settings.cache.bucket.clear')}
      </Button>
    </>
  )

  const statusLine = isEditing ? (
    <BucketSaveStatus
      isDirty={isDirty}
      isPending={isSavePending}
      status={saveStatus}
      validationError={validationError}
    />
  ) : (
    <ReadOnlyStatusLine
      clearStatus={clearStatus}
      target={bucket.id}
      savedHint={saveStatus === 'saved' && !isDirty ? t('admin.settings.cache.bucket.saved') : undefined}
    />
  )

  const actionBar = (
    <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
      {statusLine ? <div className="mr-auto">{statusLine}</div> : null}
      {actionButtons}
    </div>
  )

  return (
    <SettingGroup title={bucket.label} description={bucket.description}>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <BucketField label={t('admin.settings.cache.bucket.keyCount')} value={`${bucket.keyCount}`} />
        <BucketField
          label={t('admin.settings.cache.bucket.byteSize')}
          value={formatBytes(bucket.byteSize, { locale })}
        />
        <BucketField
          label={t('admin.settings.cache.bucket.prefix')}
          value={<code className="font-mono text-xs">{bucket.prefix}</code>}
        />
        <BucketField
          label={t('admin.settings.cache.bucket.pattern')}
          value={<code className="font-mono text-xs">{bucket.pattern}</code>}
        />
        <BucketField label={t('admin.settings.cache.bucket.ttl')} value={formatTtl(bucket.ttlSeconds, { locale })} />
      </dl>

      {editable && isEditing ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <SettingsRow
            label={t('admin.settings.cache.bucket.editPrefix')}
            htmlFor={prefixId}
            hint={t('admin.settings.cache.bucket.editPrefixHint')}
            error={validationError ?? undefined}
          >
            {(controlProps) => (
              <Input
                id={prefixId}
                {...controlProps}
                value={draft.prefix}
                onChange={(e) => setDraft((prev) => ({ ...prev, prefix: e.target.value }))}
                placeholder={`${bucket.id}:`}
                maxLength={40}
                required
              />
            )}
          </SettingsRow>
          <SettingsRow
            label={t('admin.settings.cache.bucket.ttlHours')}
            htmlFor={ttlId}
            hint={t('admin.settings.cache.bucket.ttlHint', { seconds: draft.ttlHours * SECONDS_PER_HOUR })}
          >
            <Input
              id={ttlId}
              type="number"
              min={MIN_TTL_HOURS}
              max={MAX_TTL_HOURS}
              value={draft.ttlHours}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  ttlHours: clamp(Number.parseInt(e.target.value, 10) || MIN_TTL_HOURS, MIN_TTL_HOURS, MAX_TTL_HOURS),
                }))
              }
            />
          </SettingsRow>
          {actionBar}
        </form>
      ) : (
        actionBar
      )}
    </SettingGroup>
  )
}

interface BucketFieldProps {
  label: string
  value: React.ReactNode
}

function BucketField({ label, value }: BucketFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  )
}
