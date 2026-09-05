import { useEffect } from 'react'
import { useNavigate, type NavigateFunction } from 'react-router-dom'

declare global {
  interface Window {
    navigate?: NavigateFunction
  }
}

const Navigator = () => {
  const navigate = useNavigate()

  // Hack, used to allow Playwright to navigate without triggering a full page reload.
  useEffect(() => {
    window.navigate = navigate
  }, [navigate])

  return null
}

export default Navigator
