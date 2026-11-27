import { notFound } from '@kobato/web-admin/lib/route-status'

export function clientLoader() {
  notFound()
}

export default function NotFoundRoute() {
  return null
}
