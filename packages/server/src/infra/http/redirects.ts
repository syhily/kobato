import { redirect } from 'react-router'

export function redirectPermanent(location: string): never {
  throw redirect(location, { status: 301 })
}
