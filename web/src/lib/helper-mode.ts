/** Persisted helper mode toggle (survives refresh). Same key used by Nav and product page. */
const HELPER_MODE_KEY = "sellinseconds-helper-mode";

export function getStoredHelperMode(userId: string | undefined): boolean {
  if (typeof window === "undefined" || !userId) return false;
  try {
    return localStorage.getItem(`${HELPER_MODE_KEY}-${userId}`) === "true";
  } catch {
    return false;
  }
}

export function setStoredHelperMode(userId: string | undefined, on: boolean): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    localStorage.setItem(`${HELPER_MODE_KEY}-${userId}`, on ? "true" : "false");
  } catch {
    // ignore
  }
}
