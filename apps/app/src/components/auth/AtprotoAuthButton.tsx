import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { AtprotoActorSuggestion } from "~/server/auth/atproto/typeahead";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
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
 *
 * The suggestion list is a hand-wired combobox rather than the ui/command
 * (cmdk) kit: cmdk is shaped for overlay search surfaces, while this is a
 * small inline list inside the auth card whose input must stay an ordinary
 * form field.
 *
 * Deliberately deferred: the page's ?callbackURL= is not threaded through
 * the OAuth round trip — the callback's success redirect is fixed at "/"
 * in the plugin. Carrying it through the encrypted state payload is a
 * follow-up once a flow (extension connect) actually needs it.
 */

const TYPEAHEAD_PATH = "/atproto/typeahead";
const AUTHORIZE_PATH = "/atproto/authorize";
const TYPEAHEAD_MIN_CHARS = 2;
const TYPEAHEAD_DEBOUNCE_MS = 300;

const GENERIC_ERROR_MESSAGE =
  "Could not start Atmosphere sign in. Please try again.";

interface AtprotoAuthButtonProps {
  intent: "sign-in" | "sign-up";
  variant: "outline" | "default";
  /** The page's own submission state; busy-ness here stays internal. */
  disabled: boolean;
}

export function AtprotoAuthButton({
  intent,
  variant,
  disabled,
}: AtprotoAuthButtonProps) {
  const [open, setOpen] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [selected, setSelected] = useState<AtprotoActorSuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<AtprotoActorSuggestion[]>([]);
  /** The query the current suggestions answer; stale results never render. */
  const [suggestionsFor, setSuggestionsFor] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  /** Escape-collapse should hand keyboard focus back to the trigger. */
  const returnFocus = useRef(false);

  const query = identifier.trim();
  const searchable =
    query.length >= TYPEAHEAD_MIN_CHARS && selected?.handle !== query;
  const suggestionsCurrent = searchable && suggestionsFor === query;
  const visibleSuggestions =
    suggestionsCurrent && !dismissed ? suggestions : [];
  const activeSuggestion =
    activeIndex >= 0 && activeIndex < visibleSuggestions.length
      ? visibleSuggestions[activeIndex]
      : undefined;

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!searchable) return;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void authClient
        .$fetch<{ actors: AtprotoActorSuggestion[] }>(
          `${TYPEAHEAD_PATH}?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        )
        .then(({ data }) => {
          setSuggestions(data?.actors ?? []);
          setSuggestionsFor(query);
          setActiveIndex(-1);
        })
        .catch(() => {
          // A real failure degrades to plain entry; an abort just means a
          // newer query superseded this one, so its results stay.
          if (!controller.signal.aborted) {
            setSuggestions([]);
            setSuggestionsFor(query);
          }
        });
    }, TYPEAHEAD_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [query, searchable]);

  const selectSuggestion = (suggestion: AtprotoActorSuggestion) => {
    setSelected(suggestion);
    setIdentifier(suggestion.handle);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const submit = async () => {
    if (!query || busy || disabled) return;
    setBusy(true);

    // An HTTP error resolves to { error }; a transport failure (offline,
    // DNS) rejects. Both degrade to a toast, and busy stays set only when
    // the redirect is actually underway.
    try {
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
        return;
      }
      window.location.assign(data.url);
    } catch {
      toast.error(GENERIC_ERROR_MESSAGE);
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button
        ref={triggerRef}
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
    <div
      className="grid gap-2"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setDismissed(true);
          setActiveIndex(-1);
        }
      }}
    >
      <Label htmlFor="atproto-identifier">Atmosphere handle</Label>
      <Input
        id="atproto-identifier"
        ref={inputRef}
        placeholder="name.bsky.social"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={visibleSuggestions.length > 0}
        aria-controls="atproto-suggestions"
        aria-activedescendant={
          activeSuggestion
            ? `atproto-option-${activeSuggestion.did}`
            : undefined
        }
        value={identifier}
        onFocus={() => setDismissed(false)}
        onChange={(e) => {
          setIdentifier(e.target.value);
          setSelected(null);
          setDismissed(false);
          setActiveIndex(-1);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            if (dismissed && suggestionsCurrent && suggestions.length > 0) {
              e.preventDefault();
              setDismissed(false);
              setActiveIndex(0);
            } else if (visibleSuggestions.length > 0) {
              e.preventDefault();
              setActiveIndex((i) =>
                Math.min(i + 1, visibleSuggestions.length - 1),
              );
            }
            return;
          }
          if (e.key === "ArrowUp" && visibleSuggestions.length > 0) {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, -1));
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            // Gate on intent, not list presence: a query that is (or is
            // about to be) searching dismisses first even if results are
            // still in flight, so the same keystroke can't tear the step
            // down just because the network was slow.
            if (searchable && !dismissed) {
              setDismissed(true);
              setActiveIndex(-1);
            } else {
              // Second escape (or nothing to dismiss): back to the
              // provider button, focus included.
              returnFocus.current = true;
              setOpen(false);
            }
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            if (activeSuggestion) {
              selectSuggestion(activeSuggestion);
              return;
            }
            void submit();
          }
        }}
      />
      {visibleSuggestions.length > 0 && (
        <div
          id="atproto-suggestions"
          role="listbox"
          className="overflow-hidden rounded-md border"
          aria-label="Suggested accounts"
        >
          {visibleSuggestions.map((suggestion, index) => (
            <button
              key={suggestion.did}
              id={`atproto-option-${suggestion.did}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              // DOM focus stays on the input (aria-activedescendant
              // pattern): options leave the tab order, and mousedown is
              // swallowed so a click can't blur the input first.
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              className={`hover:bg-accent flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm ${
                index === activeIndex ? "bg-accent" : ""
              }`}
              onClick={() => selectSuggestion(suggestion)}
            >
              <Avatar>
                {suggestion.avatar && (
                  <AvatarImage
                    src={suggestion.avatar}
                    alt=""
                    referrerPolicy="no-referrer"
                  />
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
