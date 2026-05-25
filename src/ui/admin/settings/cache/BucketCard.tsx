import { EditIcon, SaveIcon, Trash2Icon, XIcon } from 'lucide-react'
import { type SubmitEventHandler, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { CacheSettings } from '@/shared/config/types'
import type { CacheBucketId, CacheBucketStats } from '@/shared/types/cache'
import type { ClearStatus } from '@/ui/admin/settings/cache/cache-status'

import { MAX_TTL_HOURS, MIN_TTL_HOURS, SECONDS_PER_HOUR } from '@/ui/admin/settings/cache/cache-constants'
import { clamp, formatTtl, hoursToSeconds } from '@/ui/admin/settings/cache/cache-formatters'
import {
  type BucketDraft,
  draftsEqual,
  snapshotFromSettings,
  validateBucket,
} from '@/ui/admin/settings/cache/cache-validation'
import { BucketSaveStatus, ReadOnlyStatusLine } from '@/ui/admin/settings/cache/CacheStatusLine'
import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { useSettingsMutation } from '@/ui/admin/settings/useSettingsMutation'
import { Button } from '@/ui/components/button'
import { Input } from '@/ui/components/input'

type CacheSlice = CacheSettings['cache']

interface BucketCardProps {
  bucket: CacheBucketStats
  /** This bucket's authoritative settings (server-side snapshot). */
  settings: { prefix: string; ttlSeconds: number }
  /**
   * The full cache slice — needed so a per-bucket save can re-send the
   * other two buckets unchanged (the cache section on the server is
   * atomic; we never want to nullify a bucket the editor isn't
   * touching).
   */
  allBuckets: CacheSlice
  isClearPending: boolean
  clearStatus: ClearStatus
  onClear: () => void
}

// Self-contained card for a single Redis bucket: shows the SCAN
// stats, exposes an inline edit form for prefix + TTL, and surfaces
// a destructive "清空该分组" action. Each card owns its own draft +
// fetcher so a per-card save never blocks (or accidentally overwrites)
// a sibling card's in-flight edits.
export function BucketCard({ bucket, settings, allBuckets, isClearPending, clearStatus, onClear }: BucketCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [snapshot, setSnapshot] = useState<BucketDraft>(() => snapshotFromSettings(settings))
  const [draft, setDraft] = useState<BucketDraft>(snapshot)
  const submittedDraftRef = useRef<{ value: BucketDraft } | null>(null)
  // The "auto-exit on save" effect needs to fire exactly once per
  // successful save, not on every render where `status === 'saved'`.
  // Track whether THIS card initiated the most recent submission so a
  // sibling card's save (which we ignore) doesn't accidentally close
  // this one.
  const [savingFromHere, setSavingFromHere] = useState(false)

  // Re-baseline both snapshot and draft when the parent loader serves
  // a new authoritative value (e.g. after this card's own save, or
  // after another card's save which also revalidates the layout).
  // We only re-baseline the draft when NOT editing — otherwise a
  // sibling card's revalidation would silently overwrite the editor's
  // typed-but-unsaved values.
  useEffect(() => {
    const fresh = snapshotFromSettings(settings)
    submittedDraftRef.current = null
    setSnapshot(fresh)
    if (!isEditing) {
      setDraft(fresh)
    }
  }, [settings, isEditing])

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
      const ok = await commit('cache', payload)
      if (ok) {
        onSaved?.()
      }
    },
    [commit, onSaved],
  )

  // Auto-exit the edit mode on a successful save originated from this
  // card. The "saved" status sticks until the next submission, so we
  // gate on the `savingFromHere` flag (cleared once we've reacted).
  useEffect(() => {
    if (saveStatus === 'saved' && savingFromHere) {
      setIsEditing(false)
      setSavingFromHere(false)
    }
  }, [saveStatus, savingFromHere])

  // Build the "other buckets" view from the parent's `allBuckets`
  // every render — that way if a sibling card just saved a rename, the
  // conflict check on this card immediately reflects the new value.
  const otherBuckets = useMemo(() => {
    const all: { id: CacheBucketId; prefix: string }[] = [
      { id: 'og', prefix: allBuckets.og.prefix },
      { id: 'calendar', prefix: allBuckets.calendar.prefix },
      { id: 'avatar', prefix: allBuckets.avatar.prefix },
      { id: 'imageMeta', prefix: allBuckets.imageMeta.prefix },
    ]
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
    // The cache section is atomic on the server — re-send the other
    // two buckets exactly as they came from the loader so a per-card
    // save can't accidentally clobber a sibling bucket.
    void save({
      cache: {
        ...allBuckets,
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
    // Re-baseline draft to the latest server snapshot before opening
    // the form so the editor sees what's actually in effect (matters
    // when a sibling save just revalidated this card's `settings`
    // while in read-only mode).
    setDraft(snapshot)
    setIsEditing(true)
  }

  const isClearingSelf = isClearPending && clearStatus.target === bucket.id
  const prefixId = `cache-${bucket.id}-prefix`
  const ttlId = `cache-${bucket.id}-ttl`

  // Shared action-bar buttons rendered in BOTH read-only AND edit
  // modes. Visual ordering, left-to-right:
  //   1. "取消" (edit mode) / "编辑" (read-only mode) — entry / exit
  //      affordance for the form.
  //   2. "保存配置" (edit mode only) — the form's submit. Adjacent to
  //      its inverse (取消) so the pair reads as a single decision.
  //   3. "清空该分组" — pinned LAST so it always sits on the far
  //      right, regardless of whether the form is open. The
  //      destructive action stays in a stable spot the editor can
  //      always reach without scanning the bar's contents.
  const actionButtons = (
    <>
      {isEditing ? (
        <Button type="button" variant="ghost" disabled={isSavePending} onClick={onCancel}>
          <XIcon data-icon /> 取消
        </Button>
      ) : (
        <Button type="button" variant="outline" disabled={isClearPending} onClick={onEdit}>
          <EditIcon data-icon /> 编辑
        </Button>
      )}
      {isEditing ? (
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

  // Status line that lives next to the action buttons. In edit mode
  // it surfaces the form-level status (尚未保存 / 保存中 / 配置冲突
  // / 已保存 / 错误信息); in read-only mode it surfaces clear-status
  // or the post-save "配置已更新" hint.
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

  // Bottom action bar shared by both modes. The submit button (only
  // present in edit mode) is rendered through `actionButtons` above
  // and naturally resolves to the surrounding `<form>` when editing
  // because the action bar lives inside that form. In read-only mode
  // the same markup is rendered as a plain footer div.
  const actionBar = (
    <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
      {statusLine ? <div className="mr-auto">{statusLine}</div> : null}
      {actionButtons}
    </div>
  )

  return (
    <SettingGroup title={bucket.label} description={bucket.description}>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <BucketField label="Redis 键数" value={`${bucket.keyCount}`} />
        <BucketField label="当前前缀" value={<code className="font-mono text-xs">{bucket.prefix}</code>} />
        <BucketField label="SCAN 模式" value={<code className="font-mono text-xs">{bucket.pattern}</code>} />
        <BucketField label="当前 TTL" value={formatTtl(bucket.ttlSeconds)} />
      </dl>

      {isEditing ? (
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
            hint={`将以 ${draft.ttlHours * SECONDS_PER_HOUR} 秒写入 Redis（1 小时 ~ 30 天）。`}
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
