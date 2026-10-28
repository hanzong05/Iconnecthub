import 'server-only'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The guest app's stylesheet, so the admin preview is drawn with exactly the styles guests get. Empty (unstyled preview) if it cannot be read. */
export function guestCss(): string {
  try {
    return readFileSync(join(process.cwd(), 'guest-app', 'src', 'hub.css'), 'utf8')
  } catch {
    return ''
  }
}
