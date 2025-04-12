import { Label } from "../ui/label";
import { useFlagState } from "~/lib/hooks/useFlagState";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

export const ShowShortcutsToggle = () => {
  const [inlineShortcuts, setInlineShortcuts] =
    useFlagState("INLINE_SHORTCUTS");

  return (
    <div className="mt-2">
      <Label htmlFor="video-player-select" className="mb-2 block font-semibold">
        Inline Shortcuts
      </Label>
      <ToggleGroup
        id="show-shortcuts-select"
        type="single"
        size="sm"
        value={inlineShortcuts}
        onValueChange={setInlineShortcuts}
      >
        <ToggleGroupItem className="w-full" value="show-shortcuts">
          Show
        </ToggleGroupItem>
        <ToggleGroupItem className="w-full" value="hide-shortcuts">
          Hide
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
};
