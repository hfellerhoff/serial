"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { useDialogStore } from "~/components/feed/dialogStore";
import { Link } from "@tanstack/react-router";

function getYouTubeVideoIdFromUrl(url: string) {
  const match = new RegExp(
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(.+)/,
  ).exec(url);

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
            to="/watch/$id"
            params={{
              id: getYouTubeVideoIdFromUrl(videoUrl) ?? "",
            }}
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
