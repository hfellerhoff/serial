"use client";

import { atom, useAtom } from "jotai";
import { focusAtom } from "jotai-optics";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";

const LOCAL_STORAGE_EXPERIMENTS = {
  CUSTOM_VIDEO_PLAYER: {
    key: "serial-experiment-custom-video-player",
    schema: z.enum(["serial", "youtube"]),
  },
} as const;
type ExperimentName = keyof typeof LOCAL_STORAGE_EXPERIMENTS;
type ExperimentSchema<T extends ExperimentName> =
  (typeof LOCAL_STORAGE_EXPERIMENTS)[T]["schema"];
type ExperimentValue<T extends ExperimentName> = z.infer<ExperimentSchema<T>>;

type ExperimentsState = {
  [name in keyof typeof LOCAL_STORAGE_EXPERIMENTS]: ExperimentValue<name>;
};

function parseExperimentLocalStorageValue(experimentName: ExperimentName) {
  const experiment = LOCAL_STORAGE_EXPERIMENTS[experimentName];

  const storedValue = localStorage.getItem(experiment.key);
  if (!storedValue) return undefined;

  const parsedValue = experiment.schema.safeParse(JSON.parse(storedValue));

  if (parsedValue.success) {
    return parsedValue.data;
  }
}

const experimentsAtom = atom<ExperimentsState>({
  CUSTOM_VIDEO_PLAYER:
    parseExperimentLocalStorageValue("CUSTOM_VIDEO_PLAYER") ?? "serial",
});

export function useExperimentState<TKey extends ExperimentName>(key: TKey) {
  const experimentAtom = useMemo(() => {
    return focusAtom(experimentsAtom, (optic) => optic.prop(key));
  }, [key]);

  const [value, setStateValue] = useAtom(experimentAtom);

  const setValue = useCallback(
    (newValue: ExperimentValue<TKey>) => {
      localStorage.setItem(key, newValue.toString());
      setStateValue(newValue);
    },
    [setStateValue],
  );

  useEffect(() => {
    const storedValue = localStorage.getItem(key);
    const parsedValue =
      LOCAL_STORAGE_EXPERIMENTS[key].schema.safeParse(storedValue);

    if (parsedValue.success) {
      setValue(parsedValue.data);
    }
  }, [key, value, setValue]);

  return [value, setValue] as const;
}
