import { createFileRoute, Link } from "@tanstack/react-router";
import { DemoCarousel } from "~/components/welcome/DemoCarousel";
import { GetStartedButton } from "~/components/welcome/GetStartedButton";
import { GitHubButton } from "~/components/welcome/GitHubButton";
import { ColorThemePopoverButton } from "~/components/color-theme/ColorThemePopoverButton";
import { getMostRecentRelease } from "~/lib/markdown/loaders";
import { RecentReleaseBanner } from "~/components/welcome/RecentReleaseBanner";

export const Route = createFileRoute("/_web/welcome")({
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
    <>
      <RecentReleaseBanner mostRecentRelease={mostRecentRelease} />
      <DemoCarousel />
      <h1>Serial</h1>
      <p>
        A snappy, customizable video feed. Designed to show you exactly the
        content you want to see and nothing else.
      </p>
      <GetStartedButton />
      <h2>Appearance</h2>
      <p>
        Serial features a fully customizable appearance, with flexible light and
        dark mode styles.
      </p>
      <p>Check out the customization for yourself below!</p>
      <div className="mt-4 mb-8 md:mb-12">
        <ColorThemePopoverButton isDemo={true} />
      </div>
      <h2>Features</h2>
      <ul>
        <li>View a chronological feed of your subscriptions</li>
        <li>View videos in a daily digest format</li>
        <li>Sort by a combination of date and read status</li>
        <li>Filter out shorts from the rest of your videos</li>
        <li>Organize feeds with categories</li>
        <li>Import feeds from either:</li>
        <ul>
          <li>
            An <code>.opml</code> file
          </li>
          <li>
            A Google Takeout export (<code>subscriptions.csv</code>)
          </li>
        </ul>
        <li>PWA support for watching on mobile devices</li>
      </ul>
      <p>
        For more features, check out the{" "}
        <Link to="/releases">release log →</Link>
      </p>
      <h2>Open Source</h2>
      <p>Serial is open source! You can checkout the project on GitHub.</p>
      <GitHubButton />
      <h3>Shortcuts</h3>
      <ul>
        <li>
          <kbd>a</kbd> → Add a new feed
        </li>
        <li>
          <kbd>[</kbd> → Go to previous video
        </li>
        <li>
          <kbd>]</kbd> → Go to next video
        </li>
        <li>
          <kbd>w</kbd> → Add video to watch later
        </li>
        <li>
          <kbd>e</kbd> → Mark video as watched
        </li>
        <li>
          <kbd>`</kbd> → Toggle windowed fullscreen
        </li>
      </ul>
      <p>
        Have a question? Send me an email at{" "}
        <a href="mailto:hey@serial.tube?subject=Question%20about%20serial.tube">
          hey@serial.tube
        </a>
        !
      </p>
    </>
  );
}
