import { useState } from "react";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";
import { useExperimentState } from "~/lib/hooks/useExperimentState";

export const EnableCustomVideoPlayerToggle = () => {
  const [shouldShowCustomVideoPlayer, setShouldShowCustomVideoPlayer] =
    useExperimentState("CUSTOM_VIDEO_PLAYER");

  return (
    <div className="flex items-center">
      <Checkbox
        id="enable-custom-video-player"
        checked={shouldShowCustomVideoPlayer}
        onCheckedChange={(v) => setShouldShowCustomVideoPlayer(v as boolean)}
        className="mr-2"
      />
      <Label htmlFor="enable-custom-video-player">
        Enable Experimental Video Player
      </Label>
    </div>
  );
};
