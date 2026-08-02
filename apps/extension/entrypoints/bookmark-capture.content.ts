import { extractPageObservation } from "@serial/bookmark-capture";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  registration: "runtime",
  main() {
    return extractPageObservation(document);
  },
});
