"use client";

import { useMutation } from "@tanstack/react-query";
import clsx from "clsx";
import { LaptopIcon, MoonIcon, PaletteIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { ResponsiveButton } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { ResponsiveDropdown } from "../ui/responsive-dropdown";
import { Slider } from "../ui/slider";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { Input } from "../ui/input";
import { EnableCustomVideoPlayerToggle } from "./EnableCustomVideoPlayerToggle";
import { ShowShortcutsToggle } from "./ShowShortcutsToggle";
import { ShowArticleStyleToggle } from "./ShowArticleStyleToggle";
import type React from "react";
import { authClient } from "~/lib/auth-client";
import { orpc } from "~/lib/orpc";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

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

const themes = ["light", "dark"] as const;
type Theme = (typeof themes)[number];
function getThemeOrDefault(theme: string | undefined): Theme {
  if (themes.includes(theme as Theme)) {
    return theme as Theme;
  }
  return themes[0];
}

function useDebouncedCssValue(options: {
  cssVariable: string;
  initialValue: number;
  clamp: (value: number) => number;
  format: (value: number) => string;
  onCommit: (value: number) => void;
}) {
  const [committed, setCommitted] = useState(options.initialValue);
  const [local, setLocal] = useState<number | null>(null);
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onChange = (value: number) => {
    const clamped = options.clamp(value);
    setLocal(clamped);
    if (flushTimeoutRef.current) clearTimeout(flushTimeoutRef.current);
    flushTimeoutRef.current = setTimeout(() => {
      document.documentElement.style.setProperty(
        options.cssVariable,
        options.format(clamped),
      );
    }, 50);
  };

  const commit = (value: number) => {
    if (flushTimeoutRef.current) clearTimeout(flushTimeoutRef.current);
    const clamped = options.clamp(value);
    setCommitted(clamped);
    setLocal(null);
    document.documentElement.style.setProperty(
      options.cssVariable,
      options.format(clamped),
    );
    options.onCommit(clamped);
  };

  return {
    value: local ?? committed,
    committed,
    setCommitted,
    onChange,
    onCommit: commit,
  };
}

function EditColorsForm() {
  const { data } = authClient.useSession();

  const { mutate: saveThemeHSLToDatabase } = useMutation(
    orpc.userConfig.setThemeHSL.mutationOptions(),
  );

  const { resolvedTheme } = useTheme();

  const brightnessMin = resolvedTheme === "dark" ? 0 : 70;
  const brightnessMax = resolvedTheme === "dark" ? 30 : 100;

  const saveValuesToDatabase = (hsl: [number, number, number]) => {
    if (!data?.session.id) return;
    saveThemeHSLToDatabase({
      theme: getThemeOrDefault(resolvedTheme),
      hsl,
    });
  };

  const hue = useDebouncedCssValue({
    cssVariable: `--${resolvedTheme}-hue`,
    initialValue: 0,
    clamp: (v) => clamp(v, 0, 360),
    format: (v) => v.toString(),
    onCommit: (v) =>
      saveValuesToDatabase([v, saturation.committed, lightness.committed]),
  });

  const saturation = useDebouncedCssValue({
    cssVariable: `--${resolvedTheme}-sat`,
    initialValue: 0,
    clamp: (v) => clamp(v, 0, 100),
    format: (v) => `${v}%`,
    onCommit: (v) =>
      saveValuesToDatabase([hue.committed, v, lightness.committed]),
  });

  const lightness = useDebouncedCssValue({
    cssVariable: `--${resolvedTheme}-lgt`,
    initialValue: 0,
    clamp: (v) => clamp(v, brightnessMin, brightnessMax),
    format: (v) => `${v}%`,
    onCommit: (v) =>
      saveValuesToDatabase([hue.committed, saturation.committed, v]),
  });

  useEffect(() => {
    setTimeout(() => {
      hue.setCommitted(getCssVariable(`--${resolvedTheme}-hue`));
      saturation.setCommitted(getCssVariable(`--${resolvedTheme}-sat`));
      lightness.setCommitted(getCssVariable(`--${resolvedTheme}-lgt`));
    }, 0);
  }, [hue, lightness, resolvedTheme, saturation]);

  return (
    <div className="space-y-4">
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-mono">Hue</h3>
          <Input
            className="w-18 font-mono"
            type="number"
            value={hue.value}
            onChange={(e) => hue.onChange(parseInt(e.target.value) || 0)}
            onBlur={(e) => hue.onCommit(parseInt(e.target.value) || 0)}
          />
        </div>
        <Slider
          value={[hue.value]}
          min={0}
          max={360}
          step={1}
          onValueChange={(values) => hue.onChange(values[0] ?? hue.committed)}
          onValueCommit={(values) => hue.onCommit(values[0] ?? hue.committed)}
        />
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-mono">Saturation</h3>
          <Input
            className="w-18 font-mono"
            type="number"
            value={saturation.value}
            onChange={(e) => saturation.onChange(parseInt(e.target.value) || 0)}
            onBlur={(e) => saturation.onCommit(parseInt(e.target.value) || 0)}
          />
        </div>
        <Slider
          value={[saturation.value]}
          min={0}
          max={100}
          step={1}
          onValueChange={(values) =>
            saturation.onChange(values[0] ?? saturation.committed)
          }
          onValueCommit={(values) =>
            saturation.onCommit(values[0] ?? saturation.committed)
          }
        />
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-mono">Lightness</h3>
          <Input
            className="w-18 font-mono"
            type="number"
            value={lightness.value}
            onChange={(e) => lightness.onChange(parseInt(e.target.value) || 0)}
            onBlur={(e) => lightness.onCommit(parseInt(e.target.value) || 0)}
          />
        </div>
        <Slider
          value={[lightness.value]}
          min={brightnessMin}
          max={brightnessMax}
          step={1}
          onValueChange={(values) =>
            lightness.onChange(values[0] ?? lightness.committed)
          }
          onValueCommit={(values) =>
            lightness.onCommit(values[0] ?? lightness.committed)
          }
        />
      </div>
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
