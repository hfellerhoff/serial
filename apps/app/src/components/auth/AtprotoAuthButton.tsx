import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { authClient } from "~/lib/auth-client";

/**
 * The Atmosphere (AT Protocol) entry point on the auth pages: a provider
 * button that expands in place into the handle step. Typed input is always
 * authoritative and submittable; typeahead suggestions are a convenience
 * fetched exclusively through Serial's proxy, and a selected suggestion
 * threads its DID to the authorize endpoint to skip one resolution.
 */

const TYPEAHEAD_PATH = "/atproto/typeahead";
const AUTHORIZE_PATH = "/atproto/authorize";
const TYPEAHEAD_MIN_CHARS = 2;
const TYPEAHEAD_DEBOUNCE_MS = 300;

const GENERIC_ERROR_MESSAGE =
  "Could not start Atmosphere sign in. Please try again.";

interface ActorSuggestion {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

interface AtprotoAuthButtonProps {
  intent: "sign-in" | "sign-up";
  variant: "outline" | "default";
  disabled: boolean;
  /** Mirrors the in-flight authorize call into the page's loading state. */
  onBusyChange: (busy: boolean) => void;
}

export function AtprotoAuthButton({
  intent,
  variant,
  disabled,
  onBusyChange,
}: AtprotoAuthButtonProps) {
  const [open, setOpen] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [selected, setSelected] = useState<ActorSuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<ActorSuggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const query = identifier.trim();
  const searchable =
    query.length >= TYPEAHEAD_MIN_CHARS && selected?.handle !== query;
  const visibleSuggestions = searchable ? suggestions : [];

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!searchable) return;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void authClient
        .$fetch<{ actors: ActorSuggestion[] }>(
          `${TYPEAHEAD_PATH}?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        )
        .then(({ data }) => {
          setSuggestions(data?.actors ?? []);
        })
        .catch(() => {
          // Aborted or failed: degrade silently to plain entry.
        });
    }, TYPEAHEAD_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [query, searchable]);

  const submit = async () => {
    if (!query || busy) return;
    setBusy(true);
    onBusyChange(true);

    const { data, error } = await authClient.$fetch<{ url: string }>(
      AUTHORIZE_PATH,
      {
        method: "POST",
        body: {
          identifier: query,
          ...(selected?.handle === query ? { did: selected.did } : {}),
        },
      },
    );

    if (error || !data?.url) {
      toast.error(error?.message ?? GENERIC_ERROR_MESSAGE);
      setBusy(false);
      onBusyChange(false);
      return;
    }
    window.location.assign(data.url);
  };

  if (!open) {
    return (
      <Button
        variant={variant}
        className="w-full"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {intent === "sign-in"
          ? "Sign in with Atmosphere"
          : "Sign up with Atmosphere"}
      </Button>
    );
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor="atproto-identifier">Atmosphere handle</Label>
      <Input
        id="atproto-identifier"
        ref={inputRef}
        placeholder="name.bsky.social"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={identifier}
        onChange={(e) => {
          setIdentifier(e.target.value);
          setSelected(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
      />
      {visibleSuggestions.length > 0 && (
        <div className="overflow-hidden rounded-md border">
          {visibleSuggestions.map((suggestion) => (
            <button
              key={suggestion.did}
              type="button"
              className="hover:bg-accent flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm"
              onClick={() => {
                setSelected(suggestion);
                setIdentifier(suggestion.handle);
                setSuggestions([]);
              }}
            >
              <Avatar>
                {suggestion.avatar && (
                  <AvatarImage src={suggestion.avatar} alt="" />
                )}
                <AvatarFallback>
                  {suggestion.handle.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate">
                  {suggestion.displayName ?? suggestion.handle}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {suggestion.handle}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
      <Button
        variant={variant}
        className="w-full"
        disabled={disabled || busy || !query}
        onClick={() => void submit()}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : "Continue"}
      </Button>
    </div>
  );
}
