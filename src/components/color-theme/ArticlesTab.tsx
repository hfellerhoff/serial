"use client";

import { useMutation } from "@tanstack/react-query";
import { MinusIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { ShowArticleStyleToggle } from "./ShowArticleStyleToggle";
import type { ArticleFontFamily } from "~/lib/constants/article-fonts";
import { orpc } from "~/lib/orpc";
import {
  CSS_TO_FONT_FAMILY,
  FONT_FAMILY_CSS,
} from "~/lib/constants/article-fonts";

const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 24;
const DEFAULT_FONT_SIZE = 18;
const DEFAULT_FONT_FAMILY: ArticleFontFamily = "sans-serif";

function getCssVariable(name: string): string {
  return window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

function setCssVariable(name: string, value: string) {
  document.documentElement.style.setProperty(name, value);
}

function getInitialFontSize(): number {
  if (typeof window === "undefined") return DEFAULT_FONT_SIZE;
  const raw = getCssVariable("--article-font-size");
  const parsed = parseInt(raw, 10);
  return !isNaN(parsed) ? parsed : DEFAULT_FONT_SIZE;
}

function FontSizeControl() {
  const [fontSize, setFontSize] = useState(getInitialFontSize);
  const { mutate: saveArticleFont } = useMutation(
    orpc.userConfig.setArticleFont.mutationOptions(),
  );

  const update = (newSize: number) => {
    const clamped = Math.min(Math.max(newSize, MIN_FONT_SIZE), MAX_FONT_SIZE);
    setFontSize(clamped);
    setCssVariable("--article-font-size", `${clamped}`);
    saveArticleFont({ fontSize: clamped });
  };

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <Label className="font-semibold">Font Size</Label>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => update(fontSize - 1)}
            disabled={fontSize <= MIN_FONT_SIZE}
          >
            <MinusIcon className="h-3 w-3" />
          </Button>
          <span className="w-8 text-center text-sm tabular-nums">
            {fontSize}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => update(fontSize + 1)}
            disabled={fontSize >= MAX_FONT_SIZE}
          >
            <PlusIcon className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function getInitialFontFamily(): string {
  if (typeof window === "undefined") return DEFAULT_FONT_FAMILY;
  const raw = getCssVariable("--article-font-family");
  if (raw && CSS_TO_FONT_FAMILY[raw]) return CSS_TO_FONT_FAMILY[raw];
  return DEFAULT_FONT_FAMILY;
}

function FontFamilyControl() {
  const [fontFamily, setFontFamily] = useState(getInitialFontFamily);
  const { mutate: saveArticleFont } = useMutation(
    orpc.userConfig.setArticleFont.mutationOptions(),
  );

  const update = (value: string) => {
    if (!value) return;
    setFontFamily(value);
    const key = value as ArticleFontFamily;
    setCssVariable("--article-font-family", FONT_FAMILY_CSS[key] ?? value);
    saveArticleFont({ fontFamily: key });
  };

  return (
    <div className="mt-4">
      <Label className="mb-2 block font-semibold">Font Family</Label>
      <ToggleGroup
        type="single"
        size="sm"
        value={fontFamily}
        onValueChange={update}
      >
        <ToggleGroupItem className="w-full" value="sans-serif">
          Sans-serif
        </ToggleGroupItem>
        <ToggleGroupItem className="w-full" value="serif">
          Serif
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

export function ArticlesTab() {
  return (
    <>
      <ShowArticleStyleToggle />
      <FontFamilyControl />
      <FontSizeControl />
    </>
  );
}
