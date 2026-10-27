// Sign-in behaviour. The screen is finished; connect `signIn` to your auth provider
// (for the hub that is Firebase Auth: signInWithEmailAndPassword) and `sendReset` to its password reset.
const form = document.getElementById('loginForm')
const emailEl = document.getElementById('authEmail')
const passEl = document.getElementById('authPassword')
const errEl = document.getElementById('authErr')
const btn = document.getElementById('signInBtn')

async function signIn(email, password) {
  // Replace with the real call. Throw an Error to show a message under the form.
  throw new Error('Sign-in is not connected yet.')
}

async function sendReset(email) {
  // Replace with the real call.
  throw new Error('Password reset is not connected yet.')
}

function showError(message) {
  errEl.textContent = message
  errEl.classList.add('show')
}

function clearError() {
  errEl.classList.remove('show')
  emailEl.classList.remove('invalid')
  passEl.classList.remove('invalid')
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  clearError()
  const email = emailEl.value.trim()
  const password = passEl.value
  if (!email || !emailEl.checkValidity()) {
    emailEl.classList.add('invalid')
    return showError('Enter a valid email address.')
  }
  if (!password) {
    passEl.classList.add('invalid')
    return showError('Enter your password.')
  }
  btn.disabled = true
  btn.textContent = 'Signing in…'
  try {
    await signIn(email, password)
  } catch (err) {
    showError(err instanceof Error ? err.message : 'Invalid email or password. Please try again.')
  } finally {
    btn.disabled = false
    btn.textContent = 'Sign In →'
  }
})

document.getElementById('forgotLink').addEventListener('click', async (e) => {
  e.preventDefault()
  clearError()
  const email = emailEl.value.trim()
  if (!email || !emailEl.checkValidity()) {
    emailEl.classList.add('invalid')
    emailEl.focus()
    return showError('Enter your email above, then press Forgot password.')
  }
  try {
    await sendReset(email)
  } catch (err) {
    showError(err instanceof Error ? err.message : 'Could not send the reset email.')
  }
})

for (const el of [emailEl, passEl]) el.addEventListener('input', clearError)
