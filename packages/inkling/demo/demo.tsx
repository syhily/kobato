import './styles/demo.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { Route, HashRouter as Router, Routes } from 'react-router-dom'

import DesignSandbox from './components/DesignSandbox'
import Navigator from './components/Navigator'
import DemoApp from './DemoApp'
import HtmlOutputDemo from './HtmlOutputDemo'
import RestrictedContentDemo from './RestrictedContentDemo'

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
        <Route element={<DemoApp />} path="/" />
        <Route element={<DemoApp editorType="basic" />} path="/basic" />
        <Route element={<DemoApp editorType="minimal" />} path="/minimal" />
        <Route element={<DemoApp isMultiplayer={true} />} path="/multiplayer" />
      </Routes>
    </Router>
  </React.StrictMode>,
)
