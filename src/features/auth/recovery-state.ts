const storageKey = 'jotopa:recovery:v1'

export function recoveryUser(): string | null {
  try { return sessionStorage.getItem(storageKey) } catch { return null }
}

export function rememberRecovery(userId: string | null) {
  try {
    if (userId) sessionStorage.setItem(storageKey, userId)
    else sessionStorage.removeItem(storageKey)
  } catch { /* Recovery still works without browser storage until reload. */ }
}
