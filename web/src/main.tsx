import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MathJaxContext } from 'better-react-mathjax'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { mathJaxBundleUrl, mathJaxConfig } from './lib/math.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MathJaxContext
      version={3}
      config={mathJaxConfig}
      src={mathJaxBundleUrl}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </MathJaxContext>
  </StrictMode>,
)
