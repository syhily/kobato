import { FileImageIcon, FileTextIcon, NotebookPenIcon } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '@/ui/components/button'
import { useI18n } from '@/ui/lib/I18nProvider'

export function QuickActions() {
  const { t } = useI18n()
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" render={<Link to="/editor/post/new" />}>
        <NotebookPenIcon data-icon /> {t('admin.dashboard.quick.post')}
      </Button>
      <Button type="button" variant="outline" size="sm" render={<Link to="/editor/page/new" />}>
        <FileTextIcon data-icon /> {t('admin.dashboard.quick.page')}
      </Button>
      <Button type="button" variant="outline" size="sm" render={<Link to="/admin/library/images" />}>
        <FileImageIcon data-icon /> {t('admin.dashboard.quick.image')}
      </Button>
    </div>
  )
}
