import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@serial/ui";
import clsx from "clsx";
import { AtSignIcon, Loader2, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AtprotoActorSuggestion } from "~/server/auth/atproto/typeahead";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "~/components/ui/combobox";
import { Label } from "~/components/ui/label";
import { authClient } from "~/lib/auth-client";
import { identifierSchema } from "~/server/auth/atproto/schemas";

/**
 * The Atmosphere handle entry step, shared by the auth pages
 * (AtprotoAuthForm) and the connections dialog (AtprotoConnectionForm):
 * a labelled account picker with a submit button. Picking from the
 * typeahead dropdown (fetched exclusively through Serial's proxy) swaps
 * the input for the chosen account's Item card and threads its DID through
 * the submission to skip one resolution; Enter only confirms a highlighted
 * suggestion, never submits. The typed value remains submittable via the
 * button once it parses as a handle or DID, as a fallback for accounts the
 * typeahead can't see.
 *
 * Built on the ui/combobox (Base UI) kit: results are server-filtered, so
 * the root gets `filter={null}` and a controlled `open`, and the popup
 * floats over the layout so an arriving list never shifts the field.
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
  /** "lg" on the auth pages; the connections dialog keeps the default. */
  size?: "default" | "lg";
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
  size = "default",
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
  /** Enter only confirms a suggestion the combobox has highlighted. */
  const highlightedRef = useRef<AtprotoActorSuggestion | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  const query = identifier.trim();
  const searchable = query.length >= TYPEAHEAD_MIN_CHARS;
  const suggestionsCurrent = searchable && suggestionsFor === query;
  const visibleSuggestions =
    suggestionsCurrent && !dismissed ? suggestions : [];
  const open = visibleSuggestions.length > 0;

  useEffect(() => {
    if (focusOnMount) inputRef.current?.focus();
  }, [focusOnMount]);

  useEffect(() => {
    if (!searchable || selected !== null) return;

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
        })
        .catch(() => {
          // A real failure degrades silently; an abort just means a newer
          // query superseded this one, so its results stay.
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
  }, [query, searchable, selected]);

  // The typed value stays submittable so a handle the typeahead doesn't
  // return (unindexed PDS, proxy outage) — or a raw DID — can't lock the
  // user out; the same schema gates the authorize endpoint server-side.
  const typedIdentifierValid = identifierSchema.safeParse(query).success;

  const submit = () => {
    if (busy || disabled) return;
    if (selected) {
      onSubmit({ identifier: selected.handle, did: selected.did });
      return;
    }
    if (!typedIdentifierValid) return;
    onSubmit({ identifier: query });
  };

  const clearSelection = () => {
    if (busy || disabled) return;
    setSelected(null);
    setDismissed(false);
    // The input remounts holding the cleared account's handle, ready to
    // edit; focus lands after the swap.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  if (selected) {
    return (
      <div className="grid gap-2">
        <Label htmlFor={id}>{label}</Label>
        <Item variant="outline" render={<div />}>
          <ItemMedia>
            <AtprotoSuggestionAvatar suggestion={selected} />
          </ItemMedia>
          <ItemContent className="gap-0">
            <ItemTitle>{selected.displayName ?? selected.handle}</ItemTitle>
            <ItemDescription>{selected.handle}</ItemDescription>
          </ItemContent>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Choose a different account"
            disabled={busy || disabled}
            onClick={clearSelection}
          >
            <XIcon size={16} />
          </Button>
        </Item>
        <Button
          variant={submitVariant}
          size={size}
          className="w-full"
          disabled={disabled || busy}
          onClick={submit}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : submitLabel}
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Combobox<AtprotoActorSuggestion>
        items={visibleSuggestions}
        filter={null}
        autoHighlight
        open={open}
        onOpenChange={(nextOpen) => {
          setDismissed(!nextOpen);
          if (!nextOpen) highlightedRef.current = undefined;
        }}
        inputValue={identifier}
        onInputValueChange={(value, eventDetails) => {
          // Base UI resets its transient input state whenever the popup
          // closes: once on close (reason "none") and again after the exit
          // animation unmounts it (reason "input-clear" when nothing is
          // selected). The debounce-driven controlled `open` closes
          // mid-typing, so those programmatic resets must not clobber the
          // typed value. Real typing always arrives as "input-change".
          if (
            eventDetails.reason === "none" ||
            eventDetails.reason === "input-clear"
          ) {
            return;
          }
          setIdentifier(value);
          setDismissed(false);
        }}
        value={selected}
        onValueChange={(next) => setSelected(next)}
        itemToStringLabel={(suggestion) => suggestion.handle}
        isItemEqualToValue={(a, b) => a?.did === b?.did}
        onItemHighlighted={(item) => {
          highlightedRef.current = item ?? undefined;
        }}
      >
        <div className="relative">
          <AtSignIcon
            size={16}
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          />
          <ComboboxInput
            id={id}
            ref={inputRef}
            className={clsx("pl-9", size === "lg" && "h-10")}
            placeholder="name.bsky.social"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={disabled}
            onFocus={() => setDismissed(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                // Selection is required: Enter confirms the highlighted
                // suggestion (handled by the combobox) and otherwise does
                // nothing.
                if (!(open && highlightedRef.current)) e.preventDefault();
                return;
              }
              if (e.key === "Escape") {
                if (open) return; // The combobox dismisses its own popup.
                // Gate on intent, not list presence: a query that is (or is
                // about to be) searching dismisses first even if results are
                // still in flight, so the same keystroke can't tear the step
                // down just because the network was slow.
                if (searchable && !dismissed) {
                  e.preventDefault();
                  setDismissed(true);
                } else if (onCollapse) {
                  // Second escape (or nothing to dismiss): back to the caller.
                  e.preventDefault();
                  onCollapse();
                }
              }
            }}
          />
        </div>
        <ComboboxContent aria-label="Suggested accounts">
          <ComboboxList>
            {(suggestion: AtprotoActorSuggestion) => (
              <AtprotoSuggestionOption
                key={suggestion.did}
                suggestion={suggestion}
              />
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <Button
        variant={submitVariant}
        size={size}
        className="w-full"
        disabled={disabled || busy || !typedIdentifierValid}
        onClick={submit}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : submitLabel}
      </Button>
    </div>
  );
}

function AtprotoSuggestionAvatar({
  suggestion,
}: {
  suggestion: AtprotoActorSuggestion;
}) {
  return (
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
  );
}

function AtprotoSuggestionOption({
  suggestion,
}: {
  suggestion: AtprotoActorSuggestion;
}) {
  return (
    <ComboboxItem value={suggestion}>
      <AtprotoSuggestionAvatar suggestion={suggestion} />
      <div className="min-w-0">
        <p className="truncate">
          {suggestion.displayName ?? suggestion.handle}
        </p>
        <p className="text-muted-foreground truncate text-xs">
          {suggestion.handle}
        </p>
      </div>
    </ComboboxItem>
  );
}
