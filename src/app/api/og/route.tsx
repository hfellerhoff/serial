import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hasTitle = searchParams.has("title");
  const title = hasTitle ? searchParams.get("title") : "Serial";

  const hasDescription = searchParams.has("description");
  const description = hasDescription
    ? searchParams.get("description")
    : "Your personal content newsletter";

  const GeistRegular = await fetch(
    new URL("../../../../public/fonts/Geist-Regular.otf", import.meta.url),
  ).then((res) => res.arrayBuffer());

  const GeistBold = await fetch(
    new URL("../../../../public/fonts/Geist-Bold.otf", import.meta.url),
  ).then((res) => res.arrayBuffer());

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          backgroundColor: "white",
          width: "100%",
          height: "100%",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "45%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "black",
            fontSize: 60,
            lineHeight: 1.6,
            textAlign: "center",
            justifyContent: "center",
            alignItems: "center",
            fontFamily: '"Geist Bold"',
          }}
        >
          {title}
        </div>
        <div
          style={{
            position: "absolute",
            top: "55%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "black",
            fontSize: 30,
            lineHeight: 1.6,
            textAlign: "center",
            justifyContent: "center",
            alignItems: "center",
            fontFamily: '"Geist Regular"',
          }}
        >
          {description}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "Geist Regular",
          data: GeistRegular,
          style: "normal",
        },
        {
          name: "Geist Bold",
          data: GeistBold,
          style: "normal",
        },
      ],
    },
  );
}
