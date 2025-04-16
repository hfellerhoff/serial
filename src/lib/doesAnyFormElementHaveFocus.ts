export function doesAnyFormElementHaveFocus() {
  const elements = document.querySelectorAll("input, textarea, select");
  for (const element of elements) {
    if (element === document.activeElement) {
      return true;
    }
  }
  return false;
}
