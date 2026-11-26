import { useCallback } from 'react'
import { useNavigate, useOutletContext } from 'react-router'

import type { SettingsOutletContext } from '@/routes/admin/settings/layout'

import { guardLoader } from '@/lib/guard-loader'
import { titleMeta } from '@/seo/title-meta'
import { SettingsWorkspace } from '@/ui/settings/shell/SettingsWorkspace'

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
