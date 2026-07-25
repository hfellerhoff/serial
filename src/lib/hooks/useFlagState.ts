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
  ARTICLE_FOOTNOTES: {
    key: "serial-article-footnotes",
    schema: z.enum(["show", "hide"]),
  },
  ARTICLE_TABLE_OF_CONTENTS: {
    key: "serial-article-table-of-contents",
    schema: z.enum(["show", "hover"]),
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

  let value: unknown = storedValue;
  try {
    value = JSON.parse(storedValue);
  } catch {
    // Support values written by older versions without JSON encoding.
  }

  const parsedValue = experiment.schema.safeParse(value);

  if (parsedValue.success) {
    return parsedValue.data;
  }
}

const flagsAtom = atom({
  CUSTOM_VIDEO_PLAYER:
    parseFlagLocalStorageValue("CUSTOM_VIDEO_PLAYER") ?? "serial",
  INLINE_SHORTCUTS:
    parseFlagLocalStorageValue("INLINE_SHORTCUTS") ?? "hide-shortcuts",
  ARTICLE_STYLE: parseFlagLocalStorageValue("ARTICLE_STYLE") ?? "full",
  ARTICLE_FOOTNOTES: parseFlagLocalStorageValue("ARTICLE_FOOTNOTES") ?? "show",
  ARTICLE_TABLE_OF_CONTENTS:
    parseFlagLocalStorageValue("ARTICLE_TABLE_OF_CONTENTS") ?? "show",
} as FlagsState);

export function useFlagState<TKey extends FlagName>(key: TKey) {
  const experimentAtom = useMemo(() => {
    return focusAtom(flagsAtom, (optic) => optic.prop(key));
  }, [key]);

  const [value, setStateValue] = useAtom(experimentAtom);

  const setValue = useCallback(
    (newValue: FlagValue<TKey>) => {
      localStorage.setItem(
        LOCAL_STORAGE_FLAGS[key].key,
        JSON.stringify(newValue),
      );
      // @ts-expect-error leave me alone
      setStateValue(newValue);
    },
    [key, setStateValue],
  );

  useEffect(() => {
    const storedValue = parseFlagLocalStorageValue(key);
    if (storedValue !== undefined) {
      // @ts-expect-error don't worry about this
      setStateValue(storedValue);
    }
  }, [key, setStateValue]);

  return [value, setValue] as const;
}
