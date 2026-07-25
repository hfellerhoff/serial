import { GlobeIcon, PlayCircleIcon } from "lucide-react";
import type * as React from "react";
import type { FeedPlatform } from "~/server/db/schema";
import { YoutubeIcon } from "~/components/brand-icons";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "~/components/ui/item";
import { cn } from "~/lib/utils";

function PlatformIcon({ platform }: { platform: FeedPlatform }) {
  switch (platform) {
    case "youtube":
      return <YoutubeIcon size={16} />;
    case "peertube":
      return <PlayCircleIcon size={16} />;
    case "website":
    default:
      return <GlobeIcon size={16} />;
  }
}

function FeedMedia({
  imageUrl,
  title,
  platform,
}: {
  imageUrl?: string;
  title: string;
  platform: FeedPlatform;
}) {
  if (!imageUrl) {
    return (
      <div className="bg-muted text-muted-foreground grid size-7 place-items-center rounded">
        <PlatformIcon platform={platform} />
      </div>
    );
  }

  return (
    <img src={imageUrl} alt={title} className="size-7 rounded object-cover" />
  );
}

export function FeedAvatar({
  imageUrl,
  title,
  platform,
  fallback,
}: {
  imageUrl?: string;
  title: string;
  platform: FeedPlatform;
  fallback?: React.ReactNode;
}) {
  return (
    <Avatar size="sm">
      {imageUrl && <AvatarImage src={imageUrl} alt={title} />}
      <AvatarFallback>
        {fallback ?? <PlatformIcon platform={platform} />}
      </AvatarFallback>
    </Avatar>
  );
}

export function FeedListItem({
  title,
  titleHref,
  description,
  platform,
  imageUrl,
  media,
  leading,
  details,
  actions,
  interactive = false,
  disabled = false,
  selected = false,
  inactive = false,
  variant = "default",
  size = "default",
  className,
  onClick,
}: {
  title: string;
  titleHref?: string;
  description?: React.ReactNode;
  platform: FeedPlatform;
  imageUrl?: string;
  media?: React.ReactNode;
  leading?: React.ReactNode;
  details?: React.ReactNode;
  actions?: React.ReactNode;
  interactive?: boolean;
  disabled?: boolean;
  selected?: boolean;
  inactive?: boolean;
  variant?: "default" | "outline" | "muted";
  size?: "default" | "sm" | "xs";
  className?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <Item
      variant={variant}
      size={size}
      className={cn(
        "relative rounded-lg",
        size === "default" && "gap-3 px-3 py-3",
        interactive && "hover:bg-muted/50 cursor-pointer text-left",
        inactive && "opacity-50",
        className,
      )}
    >
      {interactive && (
        <button
          type="button"
          className="focus-visible:ring-ring/50 absolute inset-0 z-0 rounded-[inherit] outline-none focus-visible:ring-[3px]"
          aria-label={title}
          aria-pressed={selected}
          disabled={disabled}
          onClick={onClick}
        />
      )}
      {leading && <div className="relative z-10">{leading}</div>}
      <ItemMedia className="pointer-events-none">
        {media ?? (
          <FeedMedia imageUrl={imageUrl} title={title} platform={platform} />
        )}
      </ItemMedia>
      <ItemContent className="pointer-events-none min-w-0">
        <ItemTitle className="w-full">
          {titleHref ? (
            <a
              href={titleHref}
              target="_blank"
              rel="noopener noreferrer"
              className="pointer-events-auto relative z-10 line-clamp-1 hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {title}
            </a>
          ) : (
            <span className="line-clamp-1">{title}</span>
          )}
        </ItemTitle>
        {description && (
          <ItemDescription className="line-clamp-1">
            {description}
          </ItemDescription>
        )}
      </ItemContent>
      {(details || actions) && (
        <>
          {details && (
            <div className="pointer-events-none ml-auto flex flex-wrap items-center justify-end gap-3">
              {details}
            </div>
          )}
          {actions && (
            <ItemActions className="relative z-10 flex-wrap justify-end gap-3">
              {actions}
            </ItemActions>
          )}
        </>
      )}
    </Item>
  );
}
