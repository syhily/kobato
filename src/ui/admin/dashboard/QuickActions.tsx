import { FileImageIcon, FileTextIcon, NotebookPenIcon } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '@/ui/components/button'

export function QuickActions() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" render={<Link to="/editor/post/new" />}>
        <NotebookPenIcon data-icon /> 新建文章
      </Button>
      <Button type="button" variant="outline" size="sm" render={<Link to="/editor/page/new" />}>
        <FileTextIcon data-icon /> 新建页面
      </Button>
      <Button type="button" variant="outline" size="sm" render={<Link to="/admin/library/images" />}>
        <FileImageIcon data-icon /> 上传图片
      </Button>
    </div>
  )
}
