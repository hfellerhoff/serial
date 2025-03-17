import Marquee from "react-fast-marquee";

export function DemoCarousel() {
  return (
    <>
      <div className="absolute inset-x-0 top-12 md:top-16">
        <Marquee>
          <img
            className="mx-2 h-40 rounded shadow sm:h-56 md:mx-4 md:h-80"
            alt="Screenshot of an example video light mode feed in Serial"
            src="/welcome/feed-light-1-desktop.jpeg"
          />
          <img
            className="mx-2 h-40 rounded shadow sm:h-56 md:mx-4 md:h-80"
            alt="Screenshot of an example video dark mode feed in Serial"
            src="/welcome/feed-dark-1-mobile.jpeg"
          />
          <img
            className="mx-2 h-40 rounded shadow sm:h-56 md:mx-4 md:h-80"
            alt="Screenshot of an example video light mode feed in Serial"
            src="/welcome/feed-light-1-mobile.jpeg"
          />
          <img
            className="mx-2 h-40 rounded shadow sm:h-56 md:mx-4 md:h-80"
            alt="Screenshot of an example video dark mode feed in Serial"
            src="/welcome/feed-dark-1-desktop.jpeg"
          />
          <img
            className="mx-2 h-40 rounded shadow sm:h-56 md:mx-4 md:h-80"
            alt="Screenshot of an example video light mode feed in Serial"
            src="/welcome/feed-light-2-desktop.jpeg"
          />
          <img
            className="mx-2 h-40 rounded shadow sm:h-56 md:mx-4 md:h-80"
            alt="Screenshot of an example video dark mode feed in Serial"
            src="/welcome/feed-dark-2-mobile.jpeg"
          />
          <img
            className="mx-2 h-40 rounded shadow sm:h-56 md:mx-4 md:h-80"
            alt="Screenshot of an example video dark mode feed in Serial"
            src="/welcome/feed-dark-2-desktop.jpeg"
          />
          <img
            className="mx-2 h-40 rounded shadow sm:h-56 md:mx-4 md:h-80"
            alt="Screenshot of an example video light mode feed in Serial"
            src="/welcome/feed-light-2-mobile.jpeg"
          />
        </Marquee>
      </div>
      <div className="h-48 sm:h-68 md:h-96" />
    </>
  );
}
