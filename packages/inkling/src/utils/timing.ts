// Small debounce/throttle implementations matching the semantics this package
// previously relied on: trailing-edge debounce by default, leading+trailing
// throttle, and `.cancel()` on both. Replaces the former per-method imports
// from the external utility dependency.

export interface DebounceOptions {
  leading?: boolean
  trailing?: boolean
}

export interface DebouncedFunction<T extends (...args: never[]) => unknown> {
  (...args: Parameters<T>): ReturnType<T> | undefined
  cancel: () => void
}

interface InternalOptions extends DebounceOptions {
  maxWait?: number
}

// Faithful port of the classic debounce core (Date.now based, so it behaves
// identically under fake timers). `maxWait` is internal-only and used to
// implement throttle, exactly as the previous dependency did.
function debounceInternal<T extends (...args: never[]) => unknown>(
  fn: T,
  wait: number,
  { leading = false, trailing = true, maxWait }: InternalOptions,
): DebouncedFunction<T> {
  const invoke = fn as (...args: Parameters<T>) => ReturnType<T>
  const maxing = maxWait !== undefined

  let lastArgs: Parameters<T> | undefined
  let lastCallTime: number | undefined
  let lastInvokeTime = 0
  let timerId: ReturnType<typeof setTimeout> | undefined
  let result: ReturnType<T> | undefined

  const invokeFunc = (time: number): ReturnType<T> | undefined => {
    const args = lastArgs
    lastArgs = undefined
    lastInvokeTime = time
    if (args !== undefined) {
      result = invoke(...args)
    }
    return result
  }

  const shouldInvoke = (time: number): boolean => {
    if (lastCallTime === undefined) {
      return true
    }
    const timeSinceLastCall = time - lastCallTime
    const timeSinceLastInvoke = time - lastInvokeTime
    return timeSinceLastCall >= wait || timeSinceLastCall < 0 || (maxing && timeSinceLastInvoke >= maxWait)
  }

  const remainingWait = (time: number): number => {
    const timeSinceLastCall = time - (lastCallTime ?? time)
    const timeSinceLastInvoke = time - lastInvokeTime
    const timeWaiting = wait - timeSinceLastCall
    return maxing ? Math.min(timeWaiting, maxWait - timeSinceLastInvoke) : timeWaiting
  }

  const trailingEdge = (time: number): ReturnType<T> | undefined => {
    timerId = undefined
    if (trailing && lastArgs !== undefined) {
      return invokeFunc(time)
    }
    lastArgs = undefined
    return result
  }

  const timerExpired = (): void => {
    const time = Date.now()
    if (shouldInvoke(time)) {
      trailingEdge(time)
    } else {
      timerId = setTimeout(timerExpired, remainingWait(time))
    }
  }

  const leadingEdge = (time: number): ReturnType<T> | undefined => {
    lastInvokeTime = time
    timerId = setTimeout(timerExpired, wait)
    return leading ? invokeFunc(time) : result
  }

  const debounced = (...args: Parameters<T>): ReturnType<T> | undefined => {
    const time = Date.now()
    const isInvoking = shouldInvoke(time)

    lastArgs = args
    lastCallTime = time

    if (isInvoking) {
      if (timerId === undefined) {
        return leadingEdge(time)
      }
      if (maxing) {
        // Handle invocations in a tight loop.
        clearTimeout(timerId)
        timerId = setTimeout(timerExpired, wait)
        return invokeFunc(time)
      }
    }
    if (timerId === undefined) {
      timerId = setTimeout(timerExpired, wait)
    }
    return result
  }

  debounced.cancel = () => {
    if (timerId !== undefined) {
      clearTimeout(timerId)
    }
    lastInvokeTime = 0
    lastArgs = lastCallTime = timerId = undefined
  }

  return debounced
}

export function debounce<T extends (...args: never[]) => unknown>(
  fn: T,
  wait: number,
  options: DebounceOptions = {},
): DebouncedFunction<T> {
  return debounceInternal(fn, wait, options)
}

export function throttle<T extends (...args: never[]) => unknown>(
  fn: T,
  wait: number,
  { leading = true, trailing = true }: DebounceOptions = {},
): DebouncedFunction<T> {
  return debounceInternal(fn, wait, { leading, trailing, maxWait: wait })
}
