import { Label } from "../ui/label";
import { useExperimentState } from "~/lib/hooks/useExperimentState";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

export const EnableCustomVideoPlayerToggle = () => {
  const [videoPlayer, setVideoPlayer] = useExperimentState(
    "CUSTOM_VIDEO_PLAYER",
  );

  console.log(videoPlayer);

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
          Serial Player
        </ToggleGroupItem>
        <ToggleGroupItem className="w-full" value="youtube">
          YouTube Player
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
};
