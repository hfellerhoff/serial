import { useAtom } from "jotai";
import { useCallback } from "react";
import { zoomAtom } from "~/lib/data/atoms";

export const MIN_ZOOM = 0;
export const MAX_ZOOM = 6;

export function useZoom() {
  const [zoom, setZoom] = useAtom(zoomAtom);

  const zoomIn = useCallback(() => {
    setZoom((z) => {
      if (z >= MAX_ZOOM) {
        return z;
      }
      return z + 1;
    });
  }, [setZoom]);

  const zoomOut = useCallback(() => {
    setZoom((z) => {
      if (z <= MIN_ZOOM) {
        return z;
      }
      return z - 1;
    });
  }, [setZoom]);

  return {
    zoom,
    zoomIn,
    zoomOut,
  };
}
