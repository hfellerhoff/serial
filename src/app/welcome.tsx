import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { DemoColorThemePopoverButton } from "~/components/color-theme/ColorThemePopoverButton";
import { Button } from "~/components/ui/button";
import { DemoCarousel } from "~/components/welcome/DemoCarousel";
import { RecentReleaseBanner } from "~/components/welcome/RecentReleaseBanner";
import { BASE_SIGNED_OUT_URL, IS_MAIN_INSTANCE } from "~/lib/constants";
import { getMostRecentRelease } from "~/lib/markdown/loaders";
import { AUTH_PAGE_URL } from "~/server/auth/constants";

export const Route = createFileRoute("/welcome")({
  beforeLoad: () => {
    if (!IS_MAIN_INSTANCE) {
      throw redirect({ to: BASE_SIGNED_OUT_URL });
    }
  },
  component: RouteComponent,
  loader: () => {
    const mostRecentRelease = getMostRecentRelease();
    return { mostRecentRelease };
  },
  staleTime: 1000 * 60 * 60,
});

function RouteComponent() {
  const { mostRecentRelease } = Route.useLoaderData();

  return (
    <main className="bg-background text-pretty">
      <RecentReleaseBanner mostRecentRelease={mostRecentRelease} />
      <div className="pt-12 pb-16 md:pt-24 md:pb-32">
        <DemoCarousel />
        <section className="mx-auto max-w-2xl px-6 pt-16 text-center">
          <h1 className="text-3xl font-bold text-balance md:text-4xl">
            Serial
          </h1>
          <p className="mt-3 mb-6 text-lg text-pretty md:text-xl">
            A calm, customizable, and non-algorithmic RSS reader. Lots of
            customization options and great support for video content. Fully
            open source and easily self-hostable.
          </p>
          <Link to={AUTH_PAGE_URL} className="hover:bg-transparent">
            <Button size="lg" className="text-base">
              Get Started
            </Button>
          </Link>
        </section>
      </div>
      <div className="bg-foreground text-background dark:text-foreground border-foreground mx-auto border-dashed px-6 py-16 dark:max-w-4xl dark:border-4 dark:border-x-0 dark:bg-transparent dark:md:border-x-4">
        <section className="relative mx-auto max-w-xl space-y-12 text-center text-2xl text-pretty md:py-16 md:text-3xl">
          <p>
            Our digital lives are spread across many platforms, publications,
            and channels.
          </p>
          <p>
            Serial is a way to bring these disparate parts of the internet into
            one place that you control.
          </p>
        </section>
      </div>

      <section className="mx-auto max-w-xl space-y-6 px-6 py-12 text-xl text-pretty md:py-24">
        <p>
          Serial is what is called an{" "}
          <a
            className="underline"
            href="https://en.wikipedia.org/wiki/News_aggregator"
          >
            RSS Reader.
          </a>
        </p>
        <p>
          RSS (or Really Simple Syndication) is an internet standard. It has
          existed for over 25 years, and provides a really simple way for
          websites to let internet users know what content they offer.
        </p>
        <p>
          You may have experienced RSS as the system that powers podcast
          distribution. If you&apos;ve ever heard a podcast host say,{" "}
          <i>&quot;listen wherever you get your podcasts&quot;</i>, it&apos;s
          because RSS gives listeners the power to listen from any app or method
          that they prefer.
        </p>
      </section>
      <div className="flex items-center justify-center gap-4 px-6">
        <div className="bg-foreground size-2 rounded-full" />
        <div className="bg-foreground size-2 rounded-full" />
        <div className="bg-foreground size-2 rounded-full" />
      </div>
      <section className="space-y-6 px-6 py-12 text-xl text-pretty md:py-24">
        <p className="mx-auto max-w-4xl">
          Serial is designed to be a calm, customizable, and non-algorithmic RSS
          reader. It has a few distinct features that sets it apart from other
          RSS readers you may have come across:
        </p>
        <div className="mx-auto grid max-w-4xl gap-6 space-y-4 py-4 md:grid-cols-2 md:space-y-6 md:py-8">
          <div className="flex-1">
            <p className="font-bold">Flexible views</p>
            <p className="mt-2 text-lg">
              If you&apos;ve ever been on social media and felt the
              &quot;content whiplash&quot; of seeing a cute animal right next to
              the most recent global news, you&apos;ll understand the issue with
              having one unified, algorithmic feed. On Serial, you have more
              control over when, where, and how you consume content.
            </p>
          </div>
          <div className="flex-1">
            <p className="font-bold">Great support for video content</p>
            <p className="mt-2 text-lg">
              YouTube channels have RSS feeds built in, and Serial leverages
              these feeds to create an immersive and customized viewing
              experience. Serial&apos;s UI is designed to counteract the
              &quot;algorithmic rabbit hole&quot; of watching videos on YouTube.
            </p>
          </div>
          <div className="flex-1">
            <p className="font-bold">Minimal in all the right ways</p>
            <p className="mt-2 text-lg">
              Serial is clean and uncluttered, putting the focus soley on your
              content. The UI is designed for intentionality above all else.
            </p>
          </div>
          <div className="flex-1">
            <p className="font-bold">
              Customizable to your heart&apos;s content
            </p>
            <p className="mt-2 mb-2 text-lg">
              We believe your RSS reader doesn&apos;t have to feel like an email
              client. As one small example, check out our theming flexibility:
            </p>
            <DemoColorThemePopoverButton />
          </div>
        </div>
      </section>
      <div className="bg-foreground text-background dark:text-foreground border-foreground mx-auto border-dashed px-6 py-16 dark:max-w-4xl dark:border-4 dark:border-x-0 dark:bg-transparent dark:md:border-x-4">
        <section className="relative mx-auto max-w-xl space-y-6 text-center text-2xl text-pretty md:py-16 md:text-3xl">
          <p className="text-base font-black uppercase">Pricing Transparency</p>
          <p>
            Serial is currently free while in beta, and there will be a small
            subscription after that period ends for users over 100 feeds.
          </p>
          {/* <p>
            You can have up to 100 different feeds on Serial for free. After
            that, it&apos;s <b>$2 a month or $20 a year.</b>
          </p>*/}
        </section>
      </div>
      <section className="mx-auto max-w-xl space-y-6 px-6 py-12 text-xl text-pretty md:py-24">
        <p>
          If the cost of Serial is too much for you, anyone can run an instance
          of Serial for themselves. You won&apos;t need to pay us anything, but
          you will need to have a dedicated computer to run it on, which can be
          as cheap as $3-4 a month.
        </p>
        <p>
          This can be a great option for users who are very privacy-conscious,
          or for those looking to provide Serial as a service for their friends
          or family.
        </p>
        <p>
          <a
            className="underline"
            href="https://github.com/hfellerhoff/serial?tab=readme-ov-file#self-hosting"
          >
            Here is the step-by-step guide
          </a>{" "}
          on how to host your own Serial instance.
        </p>
      </section>
      <div className="border-foreground mx-auto max-w-4xl border-4 border-x-0 border-dashed px-6 py-16 md:border-x-4">
        <section className="relative mx-auto max-w-xl space-y-6 text-center text-2xl text-pretty md:py-16 md:text-3xl">
          <p>Ready to take back control of your content?</p>
          <div className="space-x-2">
            <Link to={AUTH_PAGE_URL}>
              <Button size="lg" className="text-base">
                Get Started
              </Button>
            </Link>
            <a
              href="https://github.com/hfellerhoff/serial"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="lg" className="text-base" variant="outline">
                GitHub
              </Button>
            </a>
          </div>
        </section>
      </div>
      <section className="space-y-2 px-6 py-16 text-center">
        <p className="text-lg">
          Have a question? Reach us at{" "}
          <a
            href="mailto:hey@serial.tube?subject=Question%20about%20serial.tube"
            className="underline"
          >
            hey@serial.tube
          </a>
        </p>
      </section>
    </main>
  );
}
