"use client";

import { atom, useAtom } from "jotai";
import { focusAtom } from "jotai-optics";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

const LOCAL_STORAGE_EXPERIMENTS = {
  CUSTOM_VIDEO_PLAYER: "serial-experiment-custom-video-player",
} as const;

type ExperimentName = keyof typeof LOCAL_STORAGE_EXPERIMENTS;

function parseExperimentLocalStorageValue(
  key: ExperimentName,
): boolean | undefined {
  const storedValue = localStorage.getItem(key);
  if (!storedValue) return;
  const parsedValue = z.boolean().safeParse(JSON.parse(storedValue));

  if (parsedValue.success) {
    return parsedValue.data;
  }
}

const experimentsAtom = atom<Record<ExperimentName, boolean>>({
  CUSTOM_VIDEO_PLAYER:
    parseExperimentLocalStorageValue("CUSTOM_VIDEO_PLAYER") ?? false,
});

export function useExperimentState(
  key: keyof typeof LOCAL_STORAGE_EXPERIMENTS,
) {
  const experimentAtom = useMemo(() => {
    return focusAtom(experimentsAtom, (optic) => optic.prop(key));
  }, [key]);

  const [value, setStateValue] = useAtom(experimentAtom);

  const setValue = (newValue: boolean) => {
    localStorage.setItem(key, newValue.toString());
    setStateValue(newValue);
  };

  useEffect(() => {
    const storedValue = localStorage.getItem(key);
    const parsedValue = z.boolean().safeParse(storedValue);

    if (parsedValue.success) {
      setValue(parsedValue.data);
    }
  }, [key, value]);

  return [value, setValue] as const;
}
