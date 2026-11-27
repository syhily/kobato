import type { SettingsOutletContext } from '@kobato/web-admin/routes/admin/settings/layout'

import { guardLoader } from '@kobato/web-admin/lib/guard-loader'
import { titleMeta } from '@kobato/web-admin/seo/title-meta'
import { SettingsWorkspace } from '@kobato/web-admin/ui/settings/shell/SettingsWorkspace'
import { useCallback } from 'react'
import { useNavigate, useOutletContext } from 'react-router'

export const meta = titleMeta('meta.title.admin.settings')

export const clientLoader = guardLoader('admin')

export default function SettingsPage() {
  const navigate = useNavigate()
  const { bundle, timeZones, masks } = useOutletContext<SettingsOutletContext>()
  const onClose = useCallback(() => {
    void navigate(-1)
  }, [navigate])

  return <SettingsWorkspace bundle={bundle} timeZones={timeZones} masks={masks} onClose={onClose} />
}
