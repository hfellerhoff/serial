"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useDialogStore } from "~/app/(feed)/feed/dialogStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

function getYouTubeVideoIdFromUrl(url: string) {
  const match = url.match(
    // eslint-disable-next-line no-useless-escape
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(.+)/,
  );

  if (!match) {
    return null;
  }

  return match[1];
}

export function CustomVideoDialog() {
  const [videoUrl, setVideoUrl] = useState("");

  const dialog = useDialogStore((store) => store.dialog);
  const onOpenChange = useDialogStore((store) => store.onOpenChange);

  return (
    <Dialog open={dialog === "custom-video"} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Watch a YouTube Video</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="url">YouTube URL</Label>
            <Input
              id="url"
              type="url"
              placeholder="https://www.youtube.com/watch?v=XXXXXXXXXXX"
              onChange={(e) => {
                setVideoUrl(e.target.value);
              }}
            />
          </div>
          <Link
            className="w-full"
            href={`/feed/watch/${getYouTubeVideoIdFromUrl(videoUrl)}`}
          >
            <Button
              className="w-full"
              onClick={() => {
                setVideoUrl("");
                onOpenChange(false);
              }}
            >
              Watch
            </Button>
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
