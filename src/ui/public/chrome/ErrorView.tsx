import { isRouteErrorResponse } from 'react-router'

import { NotWordPressView } from '@/ui/public/chrome/NotWordPressView'

const NOT_WORDPRESS_STATUS_TEXT = 'Not WordPress'

export interface ErrorViewProps {
  error: unknown
  isDev?: boolean
}

export function ErrorView({ error, isDev }: ErrorViewProps) {
  if (isRouteErrorResponse(error) && error.status === 404 && error.statusText === NOT_WORDPRESS_STATUS_TEXT) {
    return <NotWordPressView />
  }

  let title = '内部错误'
  let description = '抱歉，网站系统出现内部错误。请刷新页面重试，或者返回上一页。'

  if (isRouteErrorResponse(error) && error.status === 404) {
    title = '未找到页面'
    description = '抱歉，没有你要找的内容...'
  } else if (isDev && error instanceof Error) {
    description = error.message
  }

  return (
    <div className="flex h-(--size-empty-state) flex-auto flex-col text-center">
      <div className="my-auto">
        <h1 className="font-number text-empty-state-hero">{title === '未找到页面' ? '404' : '500'}</h1>
        <div>{description}</div>
      </div>
    </div>
  )
}
