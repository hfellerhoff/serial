import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AtprotoActorSuggestion } from "~/server/auth/atproto/typeahead";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { authClient } from "~/lib/auth-client";

/**
 * The Atmosphere handle entry step, shared by the auth pages
 * (AtprotoAuthButton) and the connections dialog (AtprotoConnectionForm):
 * a labelled input with typeahead suggestions and a submit button. Typed
 * input is always authoritative and submittable; suggestions are a
 * convenience fetched exclusively through Serial's proxy, and a selected
 * suggestion threads its DID to the submit handler to skip one resolution.
 *
 * The suggestion list is a hand-wired combobox rather than the ui/command
 * (cmdk) kit: cmdk is shaped for overlay search surfaces, while this is a
 * small inline list whose input must stay an ordinary form field.
 */

const TYPEAHEAD_PATH = "/atproto/typeahead";
const TYPEAHEAD_MIN_CHARS = 2;
const TYPEAHEAD_DEBOUNCE_MS = 300;

export interface AtprotoHandleSubmission {
  identifier: string;
  /** Present when the submitted value is a suggestion the user selected. */
  did?: string;
}

interface AtprotoHandleFieldProps {
  id: string;
  label: string;
  submitLabel: string;
  submitVariant?: "outline" | "default";
  /** The caller's submission state; disables and shows the spinner. */
  busy: boolean;
  disabled?: boolean;
  focusOnMount?: boolean;
  onSubmit: (submission: AtprotoHandleSubmission) => void;
  /**
   * Escape with nothing left to dismiss. When omitted the keystroke is
   * left to the surroundings (a dialog's own close handling, say).
   */
  onCollapse?: () => void;
}

export function AtprotoHandleField({
  id,
  label,
  submitLabel,
  submitVariant = "default",
  busy,
  disabled = false,
  focusOnMount = false,
  onSubmit,
  onCollapse,
}: AtprotoHandleFieldProps) {
  const [identifier, setIdentifier] = useState("");
  const [selected, setSelected] = useState<AtprotoActorSuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<AtprotoActorSuggestion[]>([]);
  /** The query the current suggestions answer; stale results never render. */
  const [suggestionsFor, setSuggestionsFor] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

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
    if (focusOnMount) inputRef.current?.focus();
  }, [focusOnMount]);

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

  const submit = () => {
    if (!query || busy || disabled) return;
    onSubmit({
      identifier: query,
      ...(selected?.handle === query ? { did: selected.did } : {}),
    });
  };

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
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        ref={inputRef}
        placeholder="name.bsky.social"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={visibleSuggestions.length > 0}
        aria-controls={`${id}-suggestions`}
        aria-activedescendant={
          activeSuggestion ? `${id}-option-${activeSuggestion.did}` : undefined
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
            // Gate on intent, not list presence: a query that is (or is
            // about to be) searching dismisses first even if results are
            // still in flight, so the same keystroke can't tear the step
            // down just because the network was slow.
            if (searchable && !dismissed) {
              e.preventDefault();
              setDismissed(true);
              setActiveIndex(-1);
            } else if (onCollapse) {
              // Second escape (or nothing to dismiss): back to the caller.
              e.preventDefault();
              onCollapse();
            }
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            if (activeSuggestion) {
              selectSuggestion(activeSuggestion);
              return;
            }
            submit();
          }
        }}
      />
      {visibleSuggestions.length > 0 && (
        <div
          id={`${id}-suggestions`}
          role="listbox"
          className="overflow-hidden rounded-md border"
          aria-label="Suggested accounts"
        >
          {visibleSuggestions.map((suggestion, index) => (
            <AtprotoSuggestionOption
              key={suggestion.did}
              fieldId={id}
              suggestion={suggestion}
              active={index === activeIndex}
              onSelect={selectSuggestion}
            />
          ))}
        </div>
      )}
      <Button
        variant={submitVariant}
        className="w-full"
        disabled={disabled || busy || !query}
        onClick={submit}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : submitLabel}
      </Button>
    </div>
  );
}

function AtprotoSuggestionOption({
  fieldId,
  suggestion,
  active,
  onSelect,
}: {
  fieldId: string;
  suggestion: AtprotoActorSuggestion;
  active: boolean;
  onSelect: (suggestion: AtprotoActorSuggestion) => void;
}) {
  return (
    <button
      id={`${fieldId}-option-${suggestion.did}`}
      type="button"
      role="option"
      aria-selected={active}
      // DOM focus stays on the input (aria-activedescendant pattern):
      // options leave the tab order, and mousedown is swallowed so a
      // click can't blur the input first.
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      className={`hover:bg-accent flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm ${
        active ? "bg-accent" : ""
      }`}
      onClick={() => onSelect(suggestion)}
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
  );
}
