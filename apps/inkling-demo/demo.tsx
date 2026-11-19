import '@kobato/inkling-demo/styles/demo.css'
import '@kobato/inkling/styles/variants.css'
import '@kobato/inkling/styles/index.css'
import DesignSandbox from '@kobato/inkling-demo/components/DesignSandbox'
import Navigator from '@kobato/inkling-demo/components/Navigator'
import DemoApp from '@kobato/inkling-demo/DemoApp'
import HtmlOutputDemo from '@kobato/inkling-demo/HtmlOutputDemo'
import RestrictedContentDemo from '@kobato/inkling-demo/RestrictedContentDemo'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { Route, HashRouter as Router, Routes } from 'react-router'

const MusicPlayerDemo = React.lazy(() => import('@kobato/inkling-demo/MusicPlayerDemo'))

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <Router>
      <Navigator />
      <Routes>
        <Route element={<DesignSandbox />} path="/designsandbox" />
        <Route element={<RestrictedContentDemo />} path="/contentrestricted" />
        <Route element={<HtmlOutputDemo />} path="/html-output" />
        <Route
          element={
            <React.Suspense fallback={null}>
              <MusicPlayerDemo />
            </React.Suspense>
          }
          path="/music-player"
        />
        <Route element={<DemoApp />} path="/" />
        <Route element={<DemoApp editorType="basic" />} path="/basic" />
        <Route element={<DemoApp editorType="minimal" />} path="/minimal" />
        <Route element={<DemoApp isMultiplayer={true} />} path="/multiplayer" />
      </Routes>
    </Router>
  </React.StrictMode>,
)
