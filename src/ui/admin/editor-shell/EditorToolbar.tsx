import {
  ArrowLeftIcon,
  ChartLineIcon,
  ExternalLinkIcon,
  EyeOffIcon,
  Loader2Icon,
  SaveIcon,
  SlidersHorizontalIcon,
  UploadIcon,
} from 'lucide-react'
import { Link } from 'react-router'

import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'
import type { EditorToolbarState } from '@/ui/admin/editor-shell/editor-shell-types'

import { Button } from '@/ui/components/button'
import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'

export interface EditorToolbarProps {
  mode: 'create' | 'edit'
  /** Display-noun message id woven into button copy (`admin.editor.entity.*`). */
  entityLabelId: UiMessageId
  /** Admin list route for the back button. */
  listPath: string
  /** Public detail URL for the entity being edited; `null` in create mode. */
  publicPath: string | null
  /** Analytics dashboard URL; `null` when the entity has none (pages). */
  analyticsPath: string | null
  state: EditorToolbarState
}

export function EditorToolbar({ mode, entityLabelId, listPath, publicPath, analyticsPath, state }: EditorToolbarProps) {
  const { t } = useI18n()
  const entity = t(entityLabelId)
  return (
    <header className="flex flex-wrap items-center gap-2 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          render={
            <Link to={listPath}>
              <ArrowLeftIcon />
              <span className="sr-only lg:not-sr-only">{t('admin.editor.toolbar.back')}</span>
            </Link>
          }
        />
        {publicPath !== null ? (
          <Button
            variant="ghost"
            size="sm"
            render={
              <Link to={publicPath} target="_blank" rel="noreferrer">
                <ExternalLinkIcon />
                <span className="sr-only lg:not-sr-only">{t('admin.editor.toolbar.preview')}</span>
              </Link>
            }
          />
        ) : null}
        {analyticsPath !== null ? (
          <Button
            variant="ghost"
            size="sm"
            render={
              <Link to={analyticsPath}>
                <ChartLineIcon />
                <span className="sr-only lg:not-sr-only">{t('admin.editor.toolbar.analytics')}</span>
              </Link>
            }
          />
        ) : null}
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        {mode === 'create' ? (
          <Button
            size="sm"
            onClick={() => {
              void state.persistCreate()
            }}
            disabled={state.isPending || !state.canPersistMeta}
            title={t('admin.editor.toolbar.createHint', { entity })}
          >
            {state.isCreating ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
            <span className="sr-only sm:not-sr-only">
              {state.isCreating
                ? t('admin.editor.toolbar.createInProgress')
                : t('admin.editor.toolbar.create', { entity })}
            </span>
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={state.persistSave}
              disabled={state.isPending || !state.canPersistMeta}
              title={t('admin.editor.toolbar.saveMetaHint', { entity })}
            >
              {state.isSavingDraft ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
              <span className="sr-only sm:not-sr-only">
                {state.isSavingDraft ? t('admin.editor.toolbar.savingDraft') : t('admin.editor.toolbar.saveDraft')}
              </span>
            </Button>
            <Button
              size="sm"
              onClick={state.persistPublish}
              disabled={state.isPending || !state.canPublish}
              title={
                state.canPublish
                  ? state.publishStatus === 'scheduled'
                    ? t('admin.editor.toolbar.publishScheduledHint')
                    : t('admin.editor.toolbar.publishHint')
                  : t('admin.editor.toolbar.publishDisabledHint')
              }
            >
              {state.isPublishing ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
              <span className="sr-only sm:not-sr-only">
                {state.isPublishing
                  ? t('admin.editor.toolbar.publishing')
                  : state.publishStatus === 'scheduled'
                    ? t('admin.editor.toolbar.publishScheduled')
                    : t('admin.editor.toolbar.publish')}
              </span>
            </Button>
            {state.published ? (
              <Button
                variant="destructive-soft"
                size="sm"
                onClick={state.persistUnpublish}
                disabled={state.isPending}
                title={t('admin.editor.toolbar.unpublishHint', { entity })}
              >
                {state.isUnpublishing ? <Loader2Icon className="animate-spin" /> : <EyeOffIcon />}
                <span className="sr-only sm:not-sr-only">
                  {state.isUnpublishing ? t('admin.editor.toolbar.unpublishing') : t('admin.editor.toolbar.unpublish')}
                </span>
              </Button>
            ) : null}
          </>
        )}
        <Button
          variant={state.metaOpen ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => state.setMetaOpen((open) => !open)}
          title={
            state.metaOpen
              ? t('admin.editor.toolbar.metaHideHint', { entity })
              : t('admin.editor.toolbar.metaShowHint', { entity })
          }
          aria-pressed={state.metaOpen}
          aria-label={t('admin.editor.toolbar.metaToggleAria', { entity })}
          className={cn(state.metaOpen && 'border border-transparent')}
        >
          <SlidersHorizontalIcon />
          <span className="sr-only sm:not-sr-only">{t('admin.editor.toolbar.metadata')}</span>
        </Button>
      </div>
    </header>
  )
}
