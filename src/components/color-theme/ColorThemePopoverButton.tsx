"use client";

import { useMutation } from "@tanstack/react-query";
import clsx from "clsx";
import { LaptopIcon, MoonIcon, PaletteIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { authClient } from "~/lib/auth-client";
import { useTRPC } from "~/trpc/react";
import { ResponsiveButton } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { ResponsiveDropdown } from "../ui/responsive-dropdown";
import { Slider } from "../ui/slider";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { EnableCustomVideoPlayerToggle } from "./EnableCustomVideoPlayerToggle";
import { ShowShortcutsToggle } from "./ShowShortcutsToggle";
import { ShowArticleStyleToggle } from "./ShowArticleStyleToggle";

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

function EditColorsForm() {
  const { data } = authClient.useSession();
  const api = useTRPC();
  const { mutate: saveThemeHSLToDatabase } = useMutation(
    api.userConfig.setThemeHSL.mutationOptions(),
  );

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
      setter: React.Dispatch<React.SetStateAction<number>>,
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
    if (!data?.session.id) return;
    saveThemeHSLToDatabase({
      theme: (resolvedTheme as "light" | "dark") ?? "light",
      hsl: [hue, saturation, lightness],
    });
  };

  const brightnessMin = resolvedTheme === "dark" ? 0 : 70;
  const brightnessMax = resolvedTheme === "dark" ? 30 : 100;

  return (
    <div className="space-y-4">
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

function ColorModeToggleGroup() {
  const { theme, setTheme } = useTheme();

  return (
    <ToggleGroup
      type="single"
      value={theme ?? "light"}
      onValueChange={setTheme}
    >
      <ToggleGroupItem
        className="w-full"
        value="light"
        aria-label="Toggle light mode"
      >
        <SunIcon className="h-4 w-4" />
      </ToggleGroupItem>
      <ToggleGroupItem
        className="w-full"
        value="dark"
        aria-label="Toggle dark mode"
      >
        <MoonIcon className="h-4 w-4" />
      </ToggleGroupItem>
      <ToggleGroupItem
        className="w-full"
        value="system"
        aria-label="Toggle system color theme"
      >
        <LaptopIcon className="h-4 w-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export function ColorThemePopoverButton({
  isDemo = false,
  children = "Appearance",
}: {
  isDemo?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <ResponsiveButton size={!isDemo ? "icon" : "default"} variant="outline">
          <PaletteIcon size={16} />
          <span
            className={clsx({
              "hidden md:inline-block": !isDemo,
              "pl-1.5": isDemo,
            })}
          >
            {children}
          </span>
        </ResponsiveButton>
      </PopoverTrigger>
      <PopoverContent>
        <ColorModeToggleGroup />
        <div className="h-4" />
        <EditColorsForm />
        {!isDemo && (
          <>
            <div className="h-6" />
            <EnableCustomVideoPlayerToggle />
            <div className="h-4" />
            <ShowShortcutsToggle />
            <div className="h-4" />
            <ShowArticleStyleToggle />
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function ColorThemeDropdownSidebar({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ResponsiveDropdown trigger={children} side="right">
      <ColorModeToggleGroup />
      <div className="h-4" />
      <EditColorsForm />
      <div className="h-6" />
      <EnableCustomVideoPlayerToggle />
      <div className="h-4" />
      <ShowShortcutsToggle />
      <div className="h-4" />
      <ShowArticleStyleToggle />
    </ResponsiveDropdown>
  );
}
