import type { CacheSettings } from '@kobato/shared/config/types'
import type { CacheBucketStats } from '@kobato/shared/contracts/cache'
import type { CacheBucketId } from '@kobato/shared/types/cache'
import type { ClearStatus } from '@kobato/ui/admin/settings/cache/cache-status'

import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { MAX_TTL_HOURS, MIN_TTL_HOURS, SECONDS_PER_HOUR } from '@kobato/ui/admin/settings/cache/cache-constants'
import { clamp, formatTtl, hoursToSeconds } from '@kobato/ui/admin/settings/cache/cache-formatters'
import {
  type BucketDraft,
  draftsEqual,
  snapshotFromSettings,
  validateBucket,
} from '@kobato/ui/admin/settings/cache/cache-validation'
import { BucketSaveStatus, ReadOnlyStatusLine } from '@kobato/ui/admin/settings/cache/CacheStatusLine'
import { SettingsRow } from '@kobato/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@kobato/ui/admin/settings/shell/SettingGroup'
import { useSettingsMutation } from '@kobato/ui/admin/settings/useSettingsMutation'
import { Button } from '@kobato/ui/components/button'
import { Input } from '@kobato/ui/components/input'
import { SaveIcon, SquarePenIcon, Trash2Icon, XIcon } from 'lucide-react'
import { type SubmitEventHandler, useCallback, useMemo, useRef, useState } from 'react'

type CacheSlice = CacheSettings['cache']

interface BucketCardProps {
  bucket: CacheBucketStats
  /**
   * This bucket's authoritative settings (server-side snapshot).
   * `undefined` for non-tunable buckets — their prefix/TTL are declared
   * in the cache registry and the card renders read-only.
   */
  settings?: { prefix: string; ttlSeconds: number }
  /**
   * The full cache slice — feeds the prefix-collision validation for the
   * sibling buckets. The save itself posts only this card's bucket; the
   * server merges it into the stored row.
   */
  allBuckets: CacheSlice
  isClearPending: boolean
  clearStatus: ClearStatus
  onClear: () => void
}

export function BucketCard({ bucket, settings, allBuckets, isClearPending, clearStatus, onClear }: BucketCardProps) {
  const editable = settings !== undefined
  // Non-tunable buckets fall back to the stats row for display; memoized
  // for a stable identity — the snapshot sync below compares by reference.
  const effectiveSettings = useMemo(
    () => settings ?? { prefix: bucket.prefix, ttlSeconds: bucket.ttlSeconds },
    [settings, bucket.prefix, bucket.ttlSeconds],
  )
  const [isEditing, setIsEditing] = useState(false)
  const [snapshot, setSnapshot] = useState<BucketDraft>(() => snapshotFromSettings(effectiveSettings))
  const [draft, setDraft] = useState<BucketDraft>(snapshot)
  const submittedDraftRef = useRef<{ value: BucketDraft } | null>(null)
  // Fire "auto-exit on save" exactly once per successful save, not on
  // every render where `status === 'saved'`: track whether THIS card
  // initiated the submission so a sibling card's save doesn't close this one.
  const [savingFromHere, setSavingFromHere] = useState(false)

  // Sync snapshot/draft to settings via the React-blessed "adjust state
  // during render" pattern instead of setState-in-effect.
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
    // CacheSlice keys are exactly the tunable bucket ids.
    const all = unsafeCast<[CacheBucketId, { prefix: string; ttlSeconds: number }][]>(Object.entries(allBuckets)).map(
      ([id, slot]) => ({ id, prefix: slot.prefix }),
    )
    return all.filter((entry) => entry.id !== bucket.id)
  }, [allBuckets, bucket.id])

  const validationError = useMemo(
    () => (isEditing ? validateBucket(draft, bucket.id, otherBuckets) : null),
    [isEditing, draft, bucket.id, otherBuckets],
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
    // Honest Section patch: only the bucket this card owns. The server
    // merges it into the stored cache row, so sibling buckets — possibly
    // edited concurrently in another tab — are never re-sent.
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
            <XIcon data-icon /> 取消
          </Button>
        ) : (
          <Button type="button" variant="outline" disabled={isClearPending} onClick={onEdit}>
            <SquarePenIcon data-icon /> 编辑
          </Button>
        )
      ) : null}
      {editable && isEditing ? (
        <Button type="submit" disabled={isSavePending || !isDirty || validationError !== null}>
          <SaveIcon data-icon /> {isSavePending ? '保存中…' : '保存配置'}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="destructive-soft"
        disabled={isClearPending || isSavePending || bucket.keyCount === 0}
        onClick={onClear}
      >
        <Trash2Icon data-icon /> {isClearingSelf ? '清空中…' : '清空该分组'}
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
      savedHint={saveStatus === 'saved' && !isDirty ? '配置已更新' : undefined}
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
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <BucketField label="缓存条数" value={`${bucket.keyCount}`} />
        <BucketField label="当前前缀" value={<code className="font-mono text-xs">{bucket.prefix}</code>} />
        <BucketField label="键匹配模式" value={<code className="font-mono text-xs">{bucket.pattern}</code>} />
        <BucketField label="当前 TTL" value={formatTtl(bucket.ttlSeconds)} />
      </dl>

      {editable && isEditing ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <SettingsRow
            label="键前缀"
            htmlFor={prefixId}
            hint="必须以 `-` 或 `:` 结尾，作为前缀和后续字段的分隔符。修改后写入端立即用新前缀生成键。"
            error={validationError ?? undefined}
          >
            {(controlProps) => (
              <Input
                id={prefixId}
                {...controlProps}
                value={draft.prefix}
                onChange={(e) => setDraft((prev) => ({ ...prev, prefix: e.target.value }))}
                placeholder={`${bucket.id}-`}
                maxLength={40}
                required
              />
            )}
          </SettingsRow>
          <SettingsRow
            label="TTL（小时）"
            htmlFor={ttlId}
            hint={`将以 ${draft.ttlHours * SECONDS_PER_HOUR} 秒为有效期写入数据库缓存表（1 小时 ~ 30 天）。`}
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
