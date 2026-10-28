import { createRoot } from 'react-dom/client'
import App from './App'
import { validDb, validHub } from './model'
import css from './hub.css?inline'
import { ensureFont } from './font'

/**
 * Embed: <div data-bluespot-hub="hub-id" data-db="https://…firebaseio.com" data-classic-url="https://…"></div>
 * plus one <script src=".../bluespot-hub.js" defer>. Each matching element gets its own isolated app
 * (shadow DOM), so the GoHighLevel page's styles cannot change it and it cannot change the page.
 */
function mount(el: HTMLElement) {
  if (el.dataset.mounted) return
  const hubId = el.dataset.bluespotHub ?? null
  const dbUrl = validDb(el.dataset.db ?? null)
  if (!validHub(hubId) || !dbUrl) {
    el.textContent = 'This hub is not set up correctly (missing hub id or database address).'
    return
  }
  const classic = el.dataset.classicUrl ?? ''
  const classicUrl = /^https:\/\//i.test(classic) ? classic : ''
  el.dataset.mounted = '1'
  ensureFont()
  const root = el.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = css
  const host = document.createElement('div')
  // The app fills this box and scrolls inside it. data-height (e.g. "760px") overrides the default of the full window height.
  const h = el.dataset.height ?? ''
  host.style.height = /^\d{3,4}px$/.test(h) ? h : '100dvh'
  root.append(style, host)
  createRoot(host).render(<App config={{ hubId, dbUrl, classicUrl }} />)
}

const start = () => document.querySelectorAll<HTMLElement>('[data-bluespot-hub]').forEach(mount)
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
else start()
