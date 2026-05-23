import { useFontsSettingsOptional } from '@/shared/lib/blog-config-context'

// Emits one `<link rel="stylesheet">` per `fonts.postCss` entry. Both
// post and page detail routes mount this near the top of their body so
// the prose-blog typography (serif, etc.) loads only on long-form
// reading surfaces — the home / archives / admin pages stay free of
// the extra bandwidth.
//
// React 19 hoists `<link>` rendered anywhere in the tree into the
// document `<head>` automatically, so we don't need to thread these
// through the root `<Links />` collector or the meta export.
//
// `useFontsSettingsOptional()` returns `undefined` on a pre-install
// snapshot — in that case the array is empty and nothing renders.
export function PostFontLinks() {
  const fonts = useFontsSettingsOptional()
  const urls = fonts?.postCss ?? []
  return (
    <>
      {urls.map((url) => (
        <link key={url} rel="stylesheet" href={url} />
      ))}
    </>
  )
}
