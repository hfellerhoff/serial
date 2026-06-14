const STORAGE_KEY_PREFIX = "serial-truncation-alert";

function getStorageKey(feedId: number): string {
  return `${STORAGE_KEY_PREFIX}-${feedId}`;
}

export function hasRespondedToTruncationAlert(feedId: number): boolean {
  try {
    const value = localStorage.getItem(getStorageKey(feedId));
    return value === "responded";
  } catch {
    return false;
  }
}

export function setTruncationAlertResponded(feedId: number): void {
  try {
    localStorage.setItem(getStorageKey(feedId), "responded");
  } catch {
    // Best-effort — don't crash if localStorage is unavailable
  }
}

export function clearTruncationAlertResponse(feedId: number): void {
  try {
    localStorage.removeItem(getStorageKey(feedId));
  } catch {
    // Best-effort
  }
}
