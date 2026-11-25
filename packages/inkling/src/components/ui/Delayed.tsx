import { type ReactNode, useEffect, useState } from 'react'
export function Delayed({ children, waitBeforeShow = 500 }: { children?: ReactNode; waitBeforeShow?: number }) {
  const [show, setShow] = useState(waitBeforeShow === 0)

  useEffect(() => {
    if (show) {
      return
    }

    const timeout = setTimeout(() => {
      setShow(true)
    }, waitBeforeShow)

    return () => {
      clearTimeout(timeout)
    }
  }, [show, waitBeforeShow])

  return show ? children : null
}
