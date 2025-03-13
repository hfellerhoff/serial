"use client";

import Link from "next/link";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "~/components/ui/carousel";

const STEPS = [
  {
    content: (
      <p>
        Navigate to{" "}
        <Link
          className="font-semibold underline"
          href="https://takeout.google.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          Google Takeout
        </Link>
        . Once, there, hit "Deselect all" to exclude unneeded app data.
      </p>
    ),
  },
  {
    content: (
      <p>
        Next, check "YouTube and YouTube Music", then click on "All YouTube data
        included".
      </p>
    ),
  },
  {
    content: (
      <p>Deselect all options, then check "subscriptions" and hit "OK".</p>
    ),
  },
  {
    content: <p>Hit "Next step", then hit "Create export".</p>,
  },
  {
    content: (
      <p>
        Soon, you will recieve an email from Google with your subscription data.
        Since we deselected data we didn't need, this should be nearly instant.
      </p>
    ),
  },
  {
    content: (
      <p>
        Unzip the file from Google. You will find the "subscriptions.csv" file
        nested a few folders inside.
      </p>
    ),
  },
] as const satisfies {
  content: React.ReactNode;
}[];

export function YouTubeSubscriptionImportCarousel() {
  return (
    <Carousel className="ml-12 w-[calc(100%-96px)] md:ml-0 md:w-auto">
      <CarouselContent>
        {STEPS.map((step, i) => (
          <CarouselItem key={i}>
            <div className="flex w-full flex-col items-center justify-center p-1 text-center">
              <div className="max-w-sm">
                <p className="text-lg font-bold">Step {i + 1}</p>
                {step.content}
              </div>
              <img
                className="mt-4 aspect-video object-contain"
                src={`/walkthroughs/youtube-subscription-import/step_${i + 1}.png`}
              />
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  );
}
