import { extractPageObservation } from "@serial/bookmark-capture/extract";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  registration: "runtime",
  main() {
    return extractPageObservation(document);
  },
});
