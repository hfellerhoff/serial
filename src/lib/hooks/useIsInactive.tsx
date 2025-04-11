import { useEffect, useState } from "react";

import dayjs from "dayjs";

export default function useIsInactive() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [isInactive, setIsInactive] = useState(false);
  const [inactivityTimeout, setInactivityTimeout] = useState<NodeJS.Timeout>();
  const [lastInteract, setLastInteract] = useState(dayjs().valueOf());

  useEffect(() => {
    if (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
      )
    ) {
      // true for mobile device
    } else {
      // false for not mobile device
      setIsDesktop(true);
    }
  }, []);

  useEffect(() => {
    if (!window) return;

    const onInteract = () => {
      // "Rate limit" the number of renders to keep performance high
      const now = dayjs().valueOf();
      if (now - lastInteract < 250) return;

      if (inactivityTimeout) clearTimeout(inactivityTimeout);

      setLastInteract(now);

      setInactivityTimeout(
        setTimeout(() => {
          if (!isInactive) setIsInactive(true);
        }, 3000),
      );

      if (!isInactive) return;
      setIsInactive(false);
    };

    window.addEventListener("mousemove", onInteract);
    window.addEventListener("keydown", onInteract);

    return () => {
      window.removeEventListener("mousemove", onInteract);
      window.removeEventListener("keydown", onInteract);
    };
  }, [
    isInactive,
    setIsInactive,
    inactivityTimeout,
    setInactivityTimeout,
    lastInteract,
  ]);

  return isInactive && isDesktop;
}
