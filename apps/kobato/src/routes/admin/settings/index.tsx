import { guardOnlyLoader } from '@kobato/server/http/request-context.ts'
import { SettingsWorkspace } from '@kobato/web-admin/ui/settings/shell/SettingsWorkspace.tsx'
import { useCallback } from 'react'
import { useNavigate, useOutletContext } from 'react-router'

import type { SettingsOutletContext } from '@/routes/admin/settings/layout.tsx'

import { titleMeta } from '@/seo/title-meta.ts'

export const meta = titleMeta('meta.title.admin.settings')

export const loader = guardOnlyLoader('admin')

export default function SettingsPage() {
  const navigate = useNavigate()
  const { bundle, timeZones, masks } = useOutletContext<SettingsOutletContext>()
  const onClose = useCallback(() => {
    void navigate(-1)
  }, [navigate])

  return <SettingsWorkspace bundle={bundle} timeZones={timeZones} masks={masks} onClose={onClose} />
}
