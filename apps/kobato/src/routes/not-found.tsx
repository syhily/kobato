import { notFound } from '@/lib/route-status'

export function clientLoader() {
  notFound()
}

export default function NotFoundRoute() {
  return null
}
