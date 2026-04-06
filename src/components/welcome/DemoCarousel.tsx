const images = [
  {
    alt: "Screenshot of an example video light mode feed in Serial",
    src: "/welcome/feed-light-1-desktop.jpeg",
  },
  {
    alt: "Screenshot of an example video dark mode feed in Serial",
    src: "/welcome/feed-dark-1-mobile.jpeg",
  },
  {
    alt: "Screenshot of an example video light mode feed in Serial",
    src: "/welcome/feed-light-1-mobile.jpeg",
  },
  {
    alt: "Screenshot of an example video dark mode feed in Serial",
    src: "/welcome/feed-dark-1-desktop.jpeg",
  },
  {
    alt: "Screenshot of an example video light mode feed in Serial",
    src: "/welcome/feed-light-2-desktop.jpeg",
  },
  {
    alt: "Screenshot of an example video dark mode feed in Serial",
    src: "/welcome/feed-dark-2-mobile.jpeg",
  },
  {
    alt: "Screenshot of an example video dark mode feed in Serial",
    src: "/welcome/feed-dark-2-desktop.jpeg",
  },
  {
    alt: "Screenshot of an example video light mode feed in Serial",
    src: "/welcome/feed-light-2-mobile.jpeg",
  },
];

export function DemoCarousel() {
  return (
    <div className="overflow-hidden">
      <div className="animate-marquee flex w-max">
        {[...images, ...images].map((img, i) => (
          <img
            key={i}
            className="mx-2 h-40 rounded shadow sm:h-56 md:mx-4 md:h-80"
            alt={img.alt}
            src={img.src}
          />
        ))}
      </div>
    </div>
  );
}
