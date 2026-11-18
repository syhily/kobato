import type { SiteIdentitySettings } from '@kobato/settings/types.ts'

import { LOCALE_DISPLAY_NAMES, SUPPORTED_LOCALES, type AppLocale } from '@kobato/i18n/locales.ts'
import { ComboboxContent, ComboboxItem, ComboboxTrigger, ComboboxValue } from '@kobato/ui/components/combobox.tsx'
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from '@kobato/ui/components/select.tsx'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { I18N_SETTINGS_ENABLED } from '@kobato/web-admin/ui/settings/feature-flags.ts'
import {
  DEFAULT_TIME_FORMAT_PATTERN,
  generalFormSchema,
  TIME_FORMAT_AUTO,
  TIME_FORMAT_CUSTOM,
  toFormValues,
  type GeneralFormValues,
  type TimeZoneItem,
} from '@kobato/web-admin/ui/settings/general/form-schema.ts'
import { SettingsRow } from '@kobato/web-admin/ui/settings/SettingsSection.tsx'
import { SettingGroup } from '@kobato/web-admin/ui/settings/shell/SettingGroup.tsx'
import { SettingGroupContent } from '@kobato/web-admin/ui/settings/shell/SettingGroupContent.tsx'
import { SettingsCombobox } from '@kobato/web-admin/ui/settings/shell/SettingsCombobox.tsx'
import { useSettingsFlushContext } from '@kobato/web-admin/ui/settings/shell/SettingsFlushProvider.tsx'
import { SettingsInput } from '@kobato/web-admin/ui/settings/shell/SettingsInput.tsx'
import { SettingsSelect } from '@kobato/web-admin/ui/settings/shell/SettingsSelect.tsx'
import { useSettingsCard } from '@kobato/web-admin/ui/settings/shell/use-settings-card.tsx'
import { useLocaleSwitch } from '@kobato/web-admin/ui/settings/use-locale-switch.ts'
import { useLocaleSyncPublish } from '@kobato/web-public/ui/lib/LocaleSyncProvider.tsx'
import { useEffect, useMemo, useRef } from 'react'
import { Controller, useWatch } from 'react-hook-form'

export function GeneralTimeZoneCard({
  siteIdentity,
  timeZones,
}: {
  siteIdentity: SiteIdentitySettings
  timeZones: readonly string[]
}) {
  const { t } = useI18n()
  const { flushAllAndWait, runTransaction } = useSettingsFlushContext()
  const localeTriggerRef = useRef<HTMLButtonElement | null>(null)
  const { form, settingGroupProps, flushOnBlur, save } = useSettingsCard<SiteIdentitySettings, GeneralFormValues>({
    section: 'general',
    source: siteIdentity,
    schema: generalFormSchema,
    toState: toFormValues,
    fromState: (values) => ({
      locale: values.locale,
      timeZone: values.timeZone.trim(),
      // `null` is the "follow the locale" state, never a blank override.
      timeFormat: values.timeFormat === null ? null : values.timeFormat.trim(),
    }),
  })

  // Cross-tab half of the switch: the announcement is handled once at the root
  // (`LocaleSyncProvider`), so every open document — settings, editor,
  // analytics — follows it. This card only publishes; it never subscribes.
  const publishLocaleChange = useLocaleSyncPublish()

  // The locale switch owns the commit, so its guard returns
  // `SETTINGS_SKIP_COMMIT`; the trigger ref is the focus anchor because the
  // picked option lives in a portal and unmounts when the popup closes.
  const { isSwitching, requestChange } = useLocaleSwitch<AppLocale>({
    loadedLocale: siteIdentity.locale,
    runTransaction,
    focusAnchor: () => localeTriggerRef.current,
    flushAll: flushAllAndWait,
    change: (locale) => {
      form.setValue('locale', locale, { shouldDirty: true, shouldValidate: true })
    },
    commit: () => save('locale'),
    broadcast: publishLocaleChange,
    reload: () => window.location.reload(),
  })

  const timeZoneItems = useMemo<TimeZoneItem[]>(
    () => timeZones.map((zone) => ({ value: zone, label: zone })),
    [timeZones],
  )
  const { formState } = form

  // Switching to "custom" restores the last pattern the admin typed, so the
  // round-trip through "follow the locale" never silently loses it.
  // `useWatch` (never `form.watch`) — the React Compiler would freeze a
  // render-time `watch()` value at its initial state.
  const timeFormat = useWatch({ control: form.control, name: 'timeFormat' })
  const lastPatternRef = useRef(siteIdentity.timeFormat ?? DEFAULT_TIME_FORMAT_PATTERN)
  useEffect(() => {
    if (typeof timeFormat === 'string' && timeFormat.trim() !== '') {
      lastPatternRef.current = timeFormat
    }
  }, [timeFormat])

  return (
    <SettingGroup
      title={t('admin.settings.general.timezone.title')}
      description={t('admin.settings.general.timezone.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        {I18N_SETTINGS_ENABLED ? (
          <SettingsRow
            label={t('admin.settings.general.timezone.locale')}
            htmlFor="general-locale"
            hint={t('admin.settings.general.timezone.localeHint')}
            error={formState.errors.locale?.message}
          >
            <Controller
              control={form.control}
              name="locale"
              render={({ field }) => (
                <SettingsSelect<AppLocale>
                  name={field.name}
                  value={field.value}
                  save={save}
                  disabled={isSwitching}
                  onValueChange={requestChange}
                >
                  <SelectTrigger
                    ref={localeTriggerRef}
                    id="general-locale"
                    className="w-full"
                    aria-busy={isSwitching ? true : undefined}
                    aria-disabled={isSwitching ? true : undefined}
                  >
                    <SelectValue>{(value: AppLocale | null) => (value ? LOCALE_DISPLAY_NAMES[value] : '')}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_LOCALES.map((locale) => (
                      <SelectItem key={locale} value={locale}>
                        {LOCALE_DISPLAY_NAMES[locale]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SettingsSelect>
              )}
            />
          </SettingsRow>
        ) : null}
        <SettingsRow
          label={t('admin.settings.general.timezone.timeZone')}
          htmlFor="general-timezone"
          hint={t('admin.settings.general.timezone.timeZoneHint')}
          error={formState.errors.timeZone?.message}
        >
          <Controller
            control={form.control}
            name="timeZone"
            render={({ field }) => {
              const selected = timeZoneItems.find((item) => item.value === field.value) ?? null
              return (
                <SettingsCombobox<TimeZoneItem>
                  name={field.name}
                  items={timeZoneItems}
                  value={selected}
                  save={save}
                  onValueChange={(item) => {
                    if (item) {
                      field.onChange(item.value)
                    }
                  }}
                >
                  <ComboboxTrigger id="general-timezone" className="w-full">
                    <ComboboxValue placeholder={t('admin.settings.general.timezone.search')} />
                  </ComboboxTrigger>
                  <ComboboxContent<TimeZoneItem>
                    inputPlaceholder={t('admin.settings.general.timezone.search')}
                    emptyMessage={t('admin.settings.general.timezone.empty')}
                  >
                    {(item) => (
                      <ComboboxItem key={item.value} value={item}>
                        {item.label}
                      </ComboboxItem>
                    )}
                  </ComboboxContent>
                </SettingsCombobox>
              )
            }}
          />
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.general.timezone.timeFormat')}
          htmlFor="general-time-format-mode"
          hint={t('admin.settings.general.timezone.timeFormatHint')}
          error={formState.errors.timeFormat?.message}
        >
          <div className="flex flex-col gap-2">
            <SettingsSelect<string>
              name="timeFormat"
              value={timeFormat === null ? TIME_FORMAT_AUTO : TIME_FORMAT_CUSTOM}
              save={save}
              onValueChange={(value) => {
                form.setValue('timeFormat', value === TIME_FORMAT_AUTO ? null : lastPatternRef.current, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }}
            >
              <SelectTrigger id="general-time-format-mode" className="w-full">
                <SelectValue>
                  {(value: string | null) =>
                    value === TIME_FORMAT_CUSTOM
                      ? t('admin.settings.general.timezone.custom')
                      : t('admin.settings.general.timezone.followLocale')
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TIME_FORMAT_AUTO}>{t('admin.settings.general.timezone.followLocale')}</SelectItem>
                <SelectItem value={TIME_FORMAT_CUSTOM}>{t('admin.settings.general.timezone.custom')}</SelectItem>
              </SelectContent>
            </SettingsSelect>
            {timeFormat !== null ? (
              <SettingsInput
                flushOnBlur={flushOnBlur}
                id="general-time-format"
                maxLength={40}
                placeholder={DEFAULT_TIME_FORMAT_PATTERN}
                {...form.register('timeFormat')}
              />
            ) : null}
          </div>
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}
