/** The hub uses the Inter font. Fonts only load from the page itself (not from inside a shadow root), so add it once to the page head. */
export function ensureFont(): void {
  if (typeof document === 'undefined' || document.getElementById('bs-inter-font')) return
  const l = document.createElement('link')
  l.id = 'bs-inter-font'
  l.rel = 'stylesheet'
  l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap'
  document.head.appendChild(l)
}
