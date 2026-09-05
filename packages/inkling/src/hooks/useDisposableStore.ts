import React from 'react'

/**
 * The React adapter skeleton for the headless disposable machines
 * (src/utils/services, the coordinators): one home of the create-on-deps +
 * dispose-on-recreate/unmount pairing every adapter used to hand-wire from
 * a `useMemo` plus a cleanup `useEffect` — the pairing most likely to grow
 * a stale-closure or leaked-request bug when re-typed per site. Deps arrive
 * as data: each adapter names its real inputs (function identities, config
 * fields) at the call site, and that naming stays the adapter's policy.
 * Machines that also need a start kickoff keep a one-line effect beside
 * this hook; create-once machines (the gallery mirror, the menu navigator)
 * keep `useState` construction — the guaranteed-stable primitive.
 */
export function useDisposableStore<T extends { dispose(): void }>(create: () => T, deps: readonly unknown[]): T {
  // oxlint-disable-next-line react-hooks/exhaustive-deps, react/react-compiler -- deps are the hook's declared inputs
  const instance = React.useMemo(create, deps)

  React.useEffect(() => {
    return () => {
      instance.dispose()
    }
  }, [instance])

  return instance
}
