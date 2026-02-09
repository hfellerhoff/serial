"use client";

import { atom, useAtom } from "jotai";
import { focusAtom } from "jotai-optics";
import { useCallback, useEffect, useMemo } from "react";
import { z } from "zod";

const LOCAL_STORAGE_FLAGS = {
  CUSTOM_VIDEO_PLAYER: {
    key: "serial-flag-custom-video-player",
    schema: z.enum(["serial", "youtube"]),
  },
  INLINE_SHORTCUTS: {
    key: "serial-flag-display-inline-shortcuts",
    schema: z.enum(["show-shortcuts", "hide-shortcuts"]),
  },
  ARTICLE_STYLE: {
    key: "serial-flag-article-style",
    schema: z.enum(["simplified", "full"]),
  },
} as const;
type FlagName = keyof typeof LOCAL_STORAGE_FLAGS;
type FlagSchema<T extends FlagName> = (typeof LOCAL_STORAGE_FLAGS)[T]["schema"];
type FlagValue<T extends FlagName> = z.infer<FlagSchema<T>>;

type FlagsState = {
  [name in keyof typeof LOCAL_STORAGE_FLAGS]: FlagValue<name>;
};

function parseFlagLocalStorageValue(experimentName: FlagName) {
  if (typeof window === "undefined") return undefined;

  const experiment = LOCAL_STORAGE_FLAGS[experimentName];

  const storedValue = window.localStorage.getItem(experiment.key);
  if (!storedValue) return undefined;

  const parsedValue = experiment.schema.safeParse(JSON.parse(storedValue));

  if (parsedValue.success) {
    return parsedValue.data;
  }
}

const flagsAtom = atom({
  CUSTOM_VIDEO_PLAYER:
    parseFlagLocalStorageValue("CUSTOM_VIDEO_PLAYER") ?? "serial",
  INLINE_SHORTCUTS:
    parseFlagLocalStorageValue("INLINE_SHORTCUTS") ?? "show-shortcuts",
  ARTICLE_STYLE: parseFlagLocalStorageValue("ARTICLE_STYLE") ?? "full",
} as FlagsState);

export function useFlagState<TKey extends FlagName>(key: TKey) {
  const experimentAtom = useMemo(() => {
    return focusAtom(flagsAtom, (optic) => optic.prop(key));
  }, [key]);

  const [value, setStateValue] = useAtom(experimentAtom);

  const setValue = useCallback(
    (newValue: FlagValue<TKey>) => {
      localStorage.setItem(key, newValue.toString());
      // @ts-expect-error leave me alone
      setStateValue(newValue);
    },
    [key, setStateValue],
  );

  useEffect(() => {
    const storedValue = localStorage.getItem(key);
    const parsedValue = LOCAL_STORAGE_FLAGS[key].schema.safeParse(storedValue);

    if (parsedValue.success) {
      // @ts-expect-error don't worry about this
      setValue(parsedValue.data);
    }
  }, [key, value, setValue]);

  return [value, setValue] as const;
}
