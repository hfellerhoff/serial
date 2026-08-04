import { extractPageObservation } from "@serial/bookmark-capture/extract";

export default defineContentScript({
  registration: "runtime",
  main() {
    return extractPageObservation(document);
  },
});
