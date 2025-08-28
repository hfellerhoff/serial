import { Label } from "../ui/label";
import { useFlagState } from "~/lib/hooks/useFlagState";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

export const ShowArticleStyleToggle = () => {
  const [articleStyle, setArticleStyle] = useFlagState("ARTICLE_STYLE");

  return (
    <div className="mt-2">
      <Label
        htmlFor="show-article-style-select"
        className="mb-2 block font-semibold"
      >
        Article Style
      </Label>
      <ToggleGroup
        id="show-article-style-select"
        type="single"
        size="sm"
        value={articleStyle}
        onValueChange={setArticleStyle}
      >
        <ToggleGroupItem className="w-full" value="simplified">
          Simplified
        </ToggleGroupItem>
        <ToggleGroupItem className="w-full" value="full">
          Full
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
};
