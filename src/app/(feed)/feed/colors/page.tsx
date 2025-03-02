"use client";;
import { useTheme } from "next-themes";
import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import { Input } from "~/components/ui/input";
import { Slider } from "~/components/ui/slider";
import { useTRPC } from "~/trpc/react";

import { useMutation } from "@tanstack/react-query";

function getCssVariable(name: string) {
  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(name);

  const numberValue = parseInt(value.replace("%", ""), 10);

  if (isNaN(numberValue)) {
    return 0;
  }

  return numberValue;
}

function FormSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 space-y-2">
      <h3 className="font-mono">{label}</h3>
      {children}
    </div>
  );
}

export default function EditColorsPage() {
  const api = useTRPC();
  const { mutate } = useMutation(api.userConfig.setThemeHSL.mutationOptions());

  const { resolvedTheme } = useTheme();

  const [hue, setHue] = useState(0);
  const [saturation, setSaturation] = useState(0);
  const [lightness, setLightness] = useState(0);

  useEffect(() => {
    setTimeout(() => {
      setHue(getCssVariable(`--${resolvedTheme}-hue`));
      setSaturation(getCssVariable(`--${resolvedTheme}-sat`));
      setLightness(getCssVariable(`--${resolvedTheme}-lgt`));
    }, 0);
  }, [resolvedTheme]);

  const updateCssVariable =
    (
      name: string,
      setter: Dispatch<SetStateAction<number>>,
      kind: "number" | "percentage",
    ) =>
    (values: number[]) => {
      const value = values[0];
      if (value === undefined) return;

      setter(value);

      const formattedValue = kind === "number" ? value.toString() : `${value}%`;
      document.documentElement.style.setProperty(name, formattedValue);
    };

  const saveValuesToDatabase = () => {
    mutate({
      theme: (resolvedTheme as "light" | "dark") ?? "light",
      hsl: [hue, saturation, lightness],
    });
  };

  const brightnessMin = resolvedTheme === "dark" ? 0 : 70;
  const brightnessMax = resolvedTheme === "dark" ? 30 : 100;

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-6">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-lg">Colors</h2>
      </div>
      <FormSection label="Hue">
        <div className="flex">
          <Slider
            value={[hue]}
            min={0}
            max={360}
            step={1}
            onValueChange={updateCssVariable(
              `--${resolvedTheme}-hue`,
              setHue,
              "number",
            )}
            onValueCommit={saveValuesToDatabase}
          />
        </div>
      </FormSection>
      <FormSection label="Saturation">
        <Slider
          value={[saturation]}
          min={0}
          max={100}
          step={1}
          onValueChange={updateCssVariable(
            `--${resolvedTheme}-sat`,
            setSaturation,
            "percentage",
          )}
          onValueCommit={saveValuesToDatabase}
        />
      </FormSection>
      <FormSection label="Lightness">
        <Slider
          value={[lightness]}
          min={brightnessMin}
          max={brightnessMax}
          step={1}
          onValueChange={updateCssVariable(
            `--${resolvedTheme}-lgt`,
            setLightness,
            "percentage",
          )}
          onValueCommit={saveValuesToDatabase}
        />
      </FormSection>
    </div>
  );
}
