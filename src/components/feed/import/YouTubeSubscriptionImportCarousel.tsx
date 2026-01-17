"use client";

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
        <a
          className="font-semibold underline"
          href="https://takeout.google.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          Google Takeout
        </a>
        . Once, there, hit &quot;Deselect all&quot; to exclude unneeded app
        data.
      </p>
    ),
  },
  {
    content: (
      <p>
        Next, check &quot;YouTube and YouTube Music&quot;, then click on
        &quot;All YouTube data included&quot;.
      </p>
    ),
  },
  {
    content: (
      <p>
        Deselect all options, then check &quot;subscriptions&quot; and hit
        &quot;OK&quot;.
      </p>
    ),
  },
  {
    content: (
      <p>Hit &quot;Next step&quot;, then hit &quot;Create export&quot;.</p>
    ),
  },
  {
    content: (
      <p>
        Soon, you will recieve an email from Google with your subscription data.
        Since we deselected data we didn&apos;t need, this should be nearly
        instant.
      </p>
    ),
  },
  {
    content: (
      <p>
        Unzip the file from Google. You will find the
        &quot;subscriptions.csv&quot; file nested a few folders inside.
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
                alt={`YouTube subscription import walkthrough step ${i + 1}`}
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
