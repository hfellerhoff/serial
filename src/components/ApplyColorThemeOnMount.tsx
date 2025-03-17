"use client";

import { useTRPC } from "~/trpc/react";
import { useUser } from "@clerk/nextjs";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

const setVariable = (name: string, value: string) => {
  document.documentElement.style.setProperty(name, value);
};

export function ApplyColorThemeOnMount() {
  const api = useTRPC();
  const user = useUser();

  const { data } = useQuery(
    api.userConfig.getConfig.queryOptions(undefined, {
      enabled: user.isSignedIn ?? false,
    }),
  );

  useEffect(() => {
    if (!data) return;

    if (data.lightHSL) {
      const [hue, sat, lgt] = data.lightHSL;

      setVariable("--light-hue", `${hue}`);
      setVariable("--light-sat", `${sat}%`);
      setVariable("--light-lgt", `${lgt}%`);
    }

    if (data.darkHSL) {
      const [hue, sat, lgt] = data.darkHSL;
      setVariable("--dark-hue", `${hue}`);
      setVariable("--dark-sat", `${sat}%`);
      setVariable("--dark-lgt", `${lgt}%`);
    }
  }, [data]);

  return null;
}
