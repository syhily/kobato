import { ViewTransition } from 'react'

// Shared-element transition boundary: mounts React's <ViewTransition> only
// when the caller supplies a name, so elements rendered without a transition
// partner never become transition boundaries — and boundary-less renders keep
// SSR output and snapshots byte-identical to an unwrapped tree.
export function NamedTransition({ name, children }: { name?: string; children: React.ReactElement }) {
  if (!name) {
    return children
  }
  return <ViewTransition name={name}>{children}</ViewTransition>
}
