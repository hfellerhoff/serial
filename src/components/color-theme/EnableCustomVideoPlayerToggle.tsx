import { Label } from "../ui/label";
import { useFlagState } from "~/lib/hooks/useFlagState";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

export const EnableCustomVideoPlayerToggle = () => {
  const [videoPlayer, setVideoPlayer] = useFlagState("CUSTOM_VIDEO_PLAYER");

  return (
    <div className="mt-2">
      <Label htmlFor="video-player-select" className="mb-2 block font-semibold">
        Video Player
      </Label>
      <ToggleGroup
        id="video-player-select"
        type="single"
        size="sm"
        value={videoPlayer}
        onValueChange={setVideoPlayer}
      >
        <ToggleGroupItem className="w-full" value="serial">
          Custom
        </ToggleGroupItem>
        <ToggleGroupItem className="w-full" value="youtube">
          YouTube
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
};
