"use client";

import { useTRPC } from "~/trpc/react";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useSession } from "~/lib/auth-client";
import { orpc } from "~/lib/orpc";

const setVariable = (name: string, value: string) => {
  document.documentElement.style.setProperty(name, value);
};

export function useApplyColorThemeOnClientMount() {
  const api = useTRPC();
  const { data: auth } = useSession();

  const { data } = useQuery(
    orpc.userConfig.getConfig.queryOptions({
      enabled: !!auth?.session.id ? true : false,
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
}
