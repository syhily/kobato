import type { FontsSettings } from '@kobato/settings/types'

import { orpc } from '@kobato/api/browser/client'
import { CANVAS_FONT_MAX_BYTES } from '@kobato/api/contracts/admin/fonts'
import { Button } from '@kobato/ui/components/button'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { SettingsRow } from '@kobato/web-admin/ui/settings/SettingsSection'
import { SettingGroup } from '@kobato/web-admin/ui/settings/shell/SettingGroup'
import { SettingGroupContent } from '@kobato/web-admin/ui/settings/shell/SettingGroupContent'
import { SettingsInput } from '@kobato/web-admin/ui/settings/shell/SettingsInput'
import { useSettingsCard } from '@kobato/web-admin/ui/settings/shell/use-settings-card'
import { useFileUpload } from '@kobato/web-admin/ui/shared/use-file-upload'
import { UploadIcon } from 'lucide-react'
import { useRef } from 'react'
import { Link } from 'react-router'

interface FontsFormProps {
  fonts: FontsSettings
}

function FontUploadRow({ slot, label, family }: { slot: 'og' | 'calendar'; label: string; family: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { t } = useI18n()
  const { upload, pending } = useFileUpload({
    submit: (file) => orpc.admin.fonts.uploadCanvas({ file, slot }),
    t,
    fields: { slot },
    accept: ['.ttf', '.otf'],
    maxBytes: CANVAS_FONT_MAX_BYTES,
    messages: {
      invalidType: {
        title: t('admin.settings.fonts.upload.invalidTypeTitle'),
        description: t('admin.settings.fonts.upload.invalidTypeDescription'),
      },
      tooLarge: () => ({
        title: t('admin.settings.fonts.upload.tooLargeTitle'),
        description: t('admin.settings.fonts.upload.tooLargeDescription'),
      }),
      success: t('admin.settings.fonts.upload.success', { label }),
    },
  })

  return (
    <div className="flex items-center gap-3">
      <input
        ref={fileInputRef}
        type="file"
        accept=".ttf,.otf"
        hidden
        aria-label={t('admin.settings.fonts.upload.chooseAria', { label })}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) {
            void upload(f)
          }
          e.target.value = ''
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => fileInputRef.current?.click()}
      >
        <UploadIcon data-icon="sm" />
        {pending ? t('admin.settings.fonts.upload.uploading') : t('admin.settings.fonts.upload.upload')}
      </Button>
      <span className="text-sm text-muted-foreground">
        {family
          ? t('admin.settings.fonts.upload.configuredFamily', { family })
          : t('admin.settings.fonts.upload.noFamily')}
      </span>
    </div>
  )
}

function FontsCanvasCard({ fonts }: { fonts: FontsSettings }) {
  const { t } = useI18n()
  const { form, settingGroupProps, display, flushOnBlur } = useSettingsCard<
    FontsSettings,
    { ogFamily: string; calendarFamily: string }
  >({
    section: 'fonts',
    source: fonts,
    toState: (source) => ({
      ogFamily: source.og.family,
      calendarFamily: source.calendar.family,
    }),
    fromState: (state) => ({
      og: { family: state.ogFamily.trim() },
      calendar: { family: state.calendarFamily.trim() },
    }),
  })

  return (
    <SettingGroup
      title={t('admin.settings.fonts.canvas.title')}
      description={t('admin.settings.fonts.canvas.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label={t('admin.settings.fonts.canvas.og')} htmlFor="fonts-og-family">
          <div className="flex flex-col gap-2">
            <FontUploadRow slot="og" label={t('admin.settings.fonts.canvas.og')} family={display.og.family} />
            <SettingsInput
              id="fonts-og-family"
              type="text"
              placeholder={t('admin.settings.fonts.canvas.ogPlaceholder')}
              maxLength={100}
              flushOnBlur={flushOnBlur}
              {...form.register('ogFamily')}
            />
          </div>
        </SettingsRow>
        <SettingsRow label={t('admin.settings.fonts.canvas.calendar')} htmlFor="fonts-calendar-family">
          <div className="flex flex-col gap-2">
            <FontUploadRow
              slot="calendar"
              label={t('admin.settings.fonts.canvas.calendar')}
              family={display.calendar.family}
            />
            <SettingsInput
              id="fonts-calendar-family"
              type="text"
              placeholder={t('admin.settings.fonts.canvas.calendarPlaceholder')}
              maxLength={100}
              flushOnBlur={flushOnBlur}
              {...form.register('calendarFamily')}
            />
          </div>
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

function FontsWebFontNoticeCard() {
  const { t } = useI18n()
  return (
    <SettingGroup
      title={t('admin.settings.fonts.webFont.title')}
      description={t('admin.settings.fonts.webFont.description')}
    >
      <SettingGroupContent>
        <Link
          to="/admin/library/fonts"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {t('admin.settings.fonts.webFont.open')}
        </Link>
      </SettingGroupContent>
    </SettingGroup>
  )
}

export function FontsForm({ fonts }: FontsFormProps) {
  return (
    <div className="flex flex-col gap-5">
      <FontsWebFontNoticeCard />
      <FontsCanvasCard fonts={fonts} />
    </div>
  )
}
