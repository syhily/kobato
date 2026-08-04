// Single owner of the React Router client-manifest → route-tree
// construction used by the warmup readers in both apps
// (`@kobato/server/render/warmup/manifest` and
// `apps/public/src/lib/warmup-manifest`). The tree shape drives the
// request-time critical-path modulepreload matching, so both apps must
// build it identically.
//
// Server-only module: `react-router` runtime import — never imported by
// browser bundles.

import type { RouteManifest, RouteManifestRoute } from '@kobato/shared/constants/route-warmup'
import type { RouteObject } from 'react-router'

import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'

export function buildRouteTree(manifest: RouteManifest): RouteObject[] {
  const childrenByParent = new Map<string, RouteManifestRoute[]>()
  for (const route of Object.values(manifest.routes)) {
    const parentId = route.parentId ?? ''
    const siblings = childrenByParent.get(parentId)
    if (siblings) {
      siblings.push(route)
    } else {
      childrenByParent.set(parentId, [route])
    }
  }

  function build(id: string): RouteObject {
    const route = manifest.routes[id]
    const children = (childrenByParent.get(id) ?? []).map((r) => build(r.id))
    // The React Router `RouteObject` union types `index` as a discriminant,
    // so constructing it with optional fields requires an assertion.
    return unsafeCast<RouteObject>({
      id,
      path: route?.path,
      index: route?.index,
      children: children.length > 0 ? children : undefined,
    })
  }

  return [build('root')]
}
