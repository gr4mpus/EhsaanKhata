const KEY = "ehsaan.pendingInvite";

/** Accepts a bare code ("753602c6") or a full invite link (".../join/753602C6") and returns the code. */
export function parseInviteCode(input: string): string {
  const trimmed = input.trim();
  const fromLink = trimmed.match(/\/join\/([A-Za-z0-9]+)/);
  return (fromLink ? fromLink[1] : trimmed).toUpperCase();
}

/**
 * Remembers an invite while the person signs in or creates an account, including across the
 * email-verification link, which opens in a new tab and loses the URL's query string.
 */
export function savePendingInvite(code: string) {
  try {
    localStorage.setItem(KEY, code);
  } catch {}
}

export function peekPendingInvite(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearPendingInvite() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
