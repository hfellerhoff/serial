export function transformSecondsToFormattedTime(seconds: number): string {
  const days = Math.floor(seconds / (3600 * 24));
  const hours = Math.floor((seconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  const formattedDays = days > 0 ? `${days.toString().padStart(2, "0")}:` : "";
  const formattedHours =
    hours > 0 ? `${hours.toString().padStart(2, "0")}:` : "";
  const formattedMinutes = `${minutes.toString().padStart(2, "0")}:`;
  let formattedSeconds = remainingSeconds.toString().split(".")[0] ?? "";
  formattedSeconds = formattedSeconds.padStart(2, "0");

  return `${formattedDays}${formattedHours}${formattedMinutes}${formattedSeconds}`;
}
