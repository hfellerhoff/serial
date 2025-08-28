"use client";

import clsx from "clsx";
import { use } from "react";

import { useFeedItemGlobalState } from "~/lib/data/atoms";
import { useZoom } from "../../watch/[videoID]/useZoom";

import classes from "./article.module.css";
import { useFeeds } from "~/lib/data/feeds";
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { useFlagState } from "~/lib/hooks/useFlagState";
import { ContentActions } from "../../watch/[videoID]/ContentActions";

const parser = unified()
  .use(rehypeParse, { fragment: true })
  .use(rehypeSanitize)
  .use(rehypeStringify);

export default function WatchVideoPage(props: {
  params: Promise<{ contentID: string }>;
}) {
  const [articleStyle] = useFlagState("ARTICLE_STYLE");
  const params = use(props.params);

  const [feedItem] = useFeedItemGlobalState(params?.contentID ?? "");
  const { feeds } = useFeeds();

  const feed = feeds.find((f) => f.id === feedItem.feedId);

  const { zoom } = useZoom();

  let content = feedItem.content;

  if (articleStyle === "simplified") {
    content = String(parser.processSync(feedItem.content ?? ""));
  }

  return (
    <div
      className={clsx("mx-auto grid h-full w-full place-items-center", {
        "max-w-xl": zoom === 0,
        "max-w-2xl": zoom === 1,
        "max-w-3xl": zoom === 2,
        "max-w-4xl": zoom === 3,
        "max-w-5xl": zoom === 4,
        "max-w-6xl": zoom === 5,
        "max-w-7xl": zoom === 6,
      })}
    >
      <div className="mb-4 flex w-full items-center gap-2 px-6 sm:pt-6">
        <img
          src={feed?.imageUrl}
          alt={feedItem.title}
          className="aspect-square h-6 rounded object-cover"
        />
        <span className="font-mono text-sm">{feed?.name}</span>
      </div>
      <div className={`h-full w-full px-6 sm:pb-6 ${classes["article"]}`}>
        <h1>{feedItem.title}</h1>
        <h6>{feedItem.author || feed?.name || ""}</h6>
        <div
          dangerouslySetInnerHTML={{
            __html: content,
          }}
        />
      </div>
      <div className="sticky inset-x-0 bottom-0 left-0 grid place-items-center">
        <ContentActions contentID={params.contentID ?? ""} />
      </div>
    </div>
  );
}
