import { tagsRedirectResponse } from '@sayaka/server/site-files'

export async function loader(): Promise<Response> {
  return tagsRedirectResponse()
}
