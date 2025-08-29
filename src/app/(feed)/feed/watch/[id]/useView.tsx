import { useAtom } from "jotai";
import { viewAtom } from "~/lib/data/atoms";

export function useView() {
  const [view, setView] = useAtom(viewAtom);

  const toggleView = () => {
    setView((prev) => {
      return prev === "windowed" ? "fullscreen" : "windowed";
    });
  };

  return {
    view,
    setView,
    toggleView,
  };
}
