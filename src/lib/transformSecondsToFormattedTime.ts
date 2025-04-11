export function transformSecondsToFormattedTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  const formattedHours =
    hours > 0 ? `${hours.toString().padStart(2, "0")}:` : "";
  const formattedMinutes = `${minutes.toString().padStart(2, "0")}:`;
  let formattedSeconds = remainingSeconds.toString().split(".")?.[0] ?? "";
  formattedSeconds = formattedSeconds.padStart(2, "0");

  return `${formattedHours}${formattedMinutes}${formattedSeconds}`;
}
