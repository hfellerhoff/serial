import { useEffect, useRef, useState } from "react";
import {
  Alert,
  AlertDescription,
  Button,
  Input,
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@serial/ui";
import { Check, Info, Loader2, LogIn, LogOut, Server } from "lucide-react";
import {
  DEFAULT_SERIAL_INSTANCE,
  getThemeCssVariables,
  LAST_INSTANCE_STORAGE_KEY,
  normalizeInstanceUrl,
  originPermission,
  resolveInitialInstance,
  SELECTED_INSTANCE_STORAGE_KEY,
} from "../../lib/auth";
import type {
  AuthMessage,
  AuthMessageResponse,
  ExtensionAuthSession,
} from "../../lib/auth";
import { ExtensionHeader } from "./ExtensionHeader";

async function sendAuthMessage(message: AuthMessage) {
  const response = (await browser.runtime.sendMessage(
    message,
  )) as AuthMessageResponse;
  if (!response || typeof response.ok !== "boolean") {
    throw new Error("Unable to contact the Serial extension background");
  }
  return response;
}

type DetectedSerialInstance = {
  instance: string;
  hasActiveWebSession: boolean;
};

async function detectSerialInstance(): Promise<DetectedSerialInstance | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith("http")) return null;

  try {
    const [{ result }] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        const marker = document.querySelector<HTMLMetaElement>(
          'meta[name="serial-instance"]',
        );
        if (marker?.content !== "1") return null;

        let hasActiveWebSession = false;
        try {
          const response = await fetch("/api/auth/get-session", {
            cache: "no-store",
            credentials: "include",
          });
          if (response.ok) {
            const payload = (await response.json()) as {
              session?: unknown;
              user?: unknown;
            } | null;
            hasActiveWebSession = Boolean(payload?.session && payload.user);
          }
        } catch {
          // The instance is still a useful manual candidate when unavailable.
        }

        return {
          instance: window.location.origin,
          hasActiveWebSession,
        };
      },
    });
    return result &&
      typeof result === "object" &&
      typeof result.instance === "string" &&
      typeof result.hasActiveWebSession === "boolean"
      ? result
      : null;
  } catch {
    return null;
  }
}

function displayHost(instance: string) {
  return new URL(instance).host;
}

const SERIAL_THEME_CSS_VARIABLES = [
  "--light-hue",
  "--light-sat",
  "--light-lgt",
  "--dark-hue",
  "--dark-sat",
  "--dark-lgt",
] as const;

function applySerialTheme(session: ExtensionAuthSession | null) {
  for (const variable of SERIAL_THEME_CSS_VARIABLES) {
    document.documentElement.style.removeProperty(variable);
  }
  for (const [variable, value] of Object.entries(
    getThemeCssVariables(session?.user.theme),
  )) {
    document.documentElement.style.setProperty(variable, value);
  }
}

const INSTANCE_DESCRIPTIONS = {
  detected: "Current tab",
  lastUsed: "Last used",
  serialDefault: "Serial default",
} as const;

type InstanceChoiceItemProps = {
  candidate: string;
  detectedInstance: string | null;
  lastInstance: string | null;
  selectedInstance: string;
  onSelect: (instance: string) => void;
};

function InstanceChoiceItem({
  candidate,
  detectedInstance,
  lastInstance,
  selectedInstance,
  onSelect,
}: InstanceChoiceItemProps) {
  const isSelected = candidate === selectedInstance;
  let description: string = INSTANCE_DESCRIPTIONS.serialDefault;
  if (candidate === lastInstance) description = INSTANCE_DESCRIPTIONS.lastUsed;
  if (candidate === detectedInstance)
    description = INSTANCE_DESCRIPTIONS.detected;

  return (
    <Item
      render={<button type="button" />}
      variant={isSelected ? "muted" : "outline"}
      size="xs"
      className="hover:bg-muted/50 cursor-pointer flex-nowrap text-left"
      aria-pressed={isSelected}
      onClick={() => onSelect(candidate)}
    >
      <ItemMedia variant="icon">
        <Server className="size-4" />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>{displayHost(candidate)}</ItemTitle>
        <ItemDescription>{description}</ItemDescription>
      </ItemContent>
      {isSelected && <Check className="size-4 shrink-0" />}
    </Item>
  );
}

type InstanceChooserProps = {
  detectedInstance: string | null;
  instance: string;
  lastInstance: string | null;
  onSelect: (instance: string) => Promise<void>;
};

function InstanceChooser({
  detectedInstance,
  instance,
  lastInstance,
  onSelect,
}: InstanceChooserProps) {
  const automaticCandidates = [
    detectedInstance,
    lastInstance,
    DEFAULT_SERIAL_INSTANCE,
  ].filter(
    (value, index, values): value is string =>
      Boolean(value) && values.indexOf(value) === index,
  );
  const initialSelectionMode = automaticCandidates.includes(instance)
    ? "automatic"
    : "manual";
  const [selectionMode, setSelectionMode] = useState<"automatic" | "manual">(
    initialSelectionMode,
  );
  const [selectedInstance, setSelectedInstance] = useState(instance);
  const [manualInstance, setManualInstance] = useState(instance);
  const [instanceError, setInstanceError] = useState<string | null>(null);

  async function handleDone() {
    try {
      const nextInstance =
        selectionMode === "manual"
          ? normalizeInstanceUrl(manualInstance)
          : selectedInstance;
      setInstanceError(null);
      await onSelect(nextInstance);
    } catch (manualError) {
      setInstanceError(
        manualError instanceof Error
          ? manualError.message
          : "Enter a valid Serial instance",
      );
    }
  }

  return (
    <main className="flex h-full flex-col gap-4 overflow-y-auto p-5">
      <header>
        <h1 className="text-lg font-semibold">Choose your Serial instance</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Use a detected Serial site or enter another instance.
        </p>
      </header>

      <Tabs
        value={selectionMode}
        onValueChange={(value) => {
          setSelectionMode(value as "automatic" | "manual");
          setInstanceError(null);
        }}
        className="min-h-0"
      >
        <TabsList className="w-full">
          <TabsTrigger value="automatic">Automatic</TabsTrigger>
          <TabsTrigger value="manual">Manual</TabsTrigger>
        </TabsList>
        <TabsContent value="automatic" className="mt-3 grid gap-2">
          <p className="text-muted-foreground text-xs">
            {detectedInstance
              ? `Detected ${displayHost(detectedInstance)} in the current tab.`
              : "No Serial instance was detected in the current tab."}
          </p>
          {automaticCandidates.map((candidate) => (
            <InstanceChoiceItem
              key={candidate}
              candidate={candidate}
              detectedInstance={detectedInstance}
              lastInstance={lastInstance}
              selectedInstance={selectedInstance}
              onSelect={setSelectedInstance}
            />
          ))}
        </TabsContent>
        <TabsContent value="manual" className="mt-3 grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="manual-instance">Server address</Label>
            <Input
              id="manual-instance"
              type="url"
              placeholder="serial.example.com"
              value={manualInstance}
              onChange={(event) => {
                setManualInstance(event.target.value);
                setInstanceError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleDone();
              }}
            />
          </div>
          {instanceError && (
            <Alert variant="destructive">
              <Info />
              <AlertDescription>{instanceError}</AlertDescription>
            </Alert>
          )}
        </TabsContent>
      </Tabs>

      <div className="mt-auto">
        <Button
          type="button"
          className="w-full"
          onClick={() => void handleDone()}
        >
          Done
        </Button>
      </div>
    </main>
  );
}

function App() {
  const initialized = useRef(false);
  const [session, setSession] = useState<ExtensionAuthSession | null>(null);
  const [detectedInstance, setDetectedInstance] = useState<string | null>(null);
  const [lastInstance, setLastInstance] = useState<string | null>(null);
  const [instance, setInstance] = useState(DEFAULT_SERIAL_INSTANCE);
  const [choosingInstance, setChoosingInstance] = useState(false);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<"sign-in" | "sign-out" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    applySerialTheme(session);
  }, [session]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    void (async () => {
      try {
        const [authResponse, detected, stored] = await Promise.all([
          sendAuthMessage({ type: "auth.get-session" }),
          detectSerialInstance(),
          browser.storage.local.get([
            LAST_INSTANCE_STORAGE_KEY,
            SELECTED_INSTANCE_STORAGE_KEY,
          ]),
        ]);
        const previous =
          typeof stored[LAST_INSTANCE_STORAGE_KEY] === "string"
            ? (stored[LAST_INSTANCE_STORAGE_KEY] as string)
            : null;
        const selected =
          typeof stored[SELECTED_INSTANCE_STORAGE_KEY] === "string"
            ? (stored[SELECTED_INSTANCE_STORAGE_KEY] as string)
            : null;

        const detectedOrigin = detected?.instance ?? null;
        if (authResponse.ok && authResponse.session) {
          setSession(authResponse.session);
          setInstance(authResponse.session.instance);
          return;
        }

        setDetectedInstance(detectedOrigin);
        setLastInstance(previous);
        if (!authResponse.ok) setError(authResponse.error);

        const initialInstance = resolveInitialInstance({
          detectedInstance: detectedOrigin,
          hasActiveWebSession: detected?.hasActiveWebSession ?? false,
          selectedInstance: selected,
          lastInstance: previous,
        });
        if (!initialInstance) {
          setInstance(
            detectedOrigin ?? selected ?? previous ?? DEFAULT_SERIAL_INSTANCE,
          );
          setChoosingInstance(true);
          return;
        }

        setInstance(initialInstance);
        if (detected?.hasActiveWebSession) {
          const permission = originPermission(initialInstance);
          const canSignInSilently = await browser.permissions.contains({
            origins: [permission],
          });
          if (canSignInSilently) {
            const response = await sendAuthMessage({
              type: "auth.sign-in",
              instance: initialInstance,
              interactive: false,
            });
            if (response.ok && response.session) {
              setSession(response.session);
            } else {
              setChoosingInstance(true);
              if (!response.ok) setError(response.error);
            }
          }
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load the Serial extension",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSignIn(targetInstance = instance) {
    setAction("sign-in");
    setError(null);
    try {
      const normalized = normalizeInstanceUrl(targetInstance);
      await browser.storage.local.set({
        [SELECTED_INSTANCE_STORAGE_KEY]: normalized,
      });
      const permission = originPermission(normalized);
      const alreadyGranted = await browser.permissions.contains({
        origins: [permission],
      });
      const granted =
        alreadyGranted ||
        (await browser.permissions.request({ origins: [permission] }));
      if (!granted) {
        throw new Error(
          `Serial needs permission to connect to ${displayHost(normalized)}`,
        );
      }

      const response = await sendAuthMessage({
        type: "auth.sign-in",
        instance: normalized,
        interactive: true,
      });
      if (!response.ok) throw new Error(response.error);
      setInstance(normalized);
      setSession(response.session);
    } catch (signInError) {
      setError(
        signInError instanceof Error
          ? signInError.message
          : "Unable to sign in to Serial",
      );
    } finally {
      setAction(null);
    }
  }

  async function handleSignOut() {
    setAction("sign-out");
    setError(null);
    try {
      const response = await sendAuthMessage({ type: "auth.sign-out" });
      if (response.ok) {
        setSession(null);
        setInstance(session?.instance ?? instance);
      } else {
        setError(response.error);
      }
    } catch (signOutError) {
      setError(
        signOutError instanceof Error
          ? signOutError.message
          : "Unable to sign out of the Serial extension",
      );
    } finally {
      setAction(null);
    }
  }

  if (loading) {
    return (
      <main className="grid h-full place-items-center">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </main>
    );
  }

  if (session) {
    return (
      <main className="flex h-full flex-col p-5">
        <ExtensionHeader
          title="Serial"
          description={displayHost(session.instance)}
        />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Check className="size-4" />
            Signed in
          </div>
        </div>
        {error && (
          <Alert variant="destructive" className="mb-3">
            <Info />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button
          variant="outline"
          size="icon md:default"
          className="w-full"
          disabled={action !== null}
          onClick={() => void handleSignOut()}
        >
          {action === "sign-out" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <LogOut className="size-4" />
          )}
          <span className="pl-1.5 md:pl-0">Sign out of extension</span>
        </Button>
      </main>
    );
  }

  if (choosingInstance) {
    return (
      <InstanceChooser
        detectedInstance={detectedInstance}
        instance={instance}
        lastInstance={lastInstance}
        onSelect={async (nextInstance) => {
          await browser.storage.local.set({
            [SELECTED_INSTANCE_STORAGE_KEY]: nextInstance,
          });
          setInstance(nextInstance);
          setChoosingInstance(false);
          await handleSignIn(nextInstance);
        }}
      />
    );
  }

  return (
    <main className="flex h-full flex-col gap-5 p-5">
      <ExtensionHeader
        title="Sign in to Serial"
        description={`Continue with ${displayHost(instance)}.`}
      />

      {error && (
        <Alert variant="destructive">
          <Info />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="mt-auto grid gap-2">
        <Button
          size="icon md:default"
          className="w-full"
          disabled={action !== null}
          onClick={() => void handleSignIn()}
        >
          {action === "sign-in" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <LogIn className="size-4" />
          )}
          <span className="pl-1.5 md:pl-0">Continue with Serial</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={action !== null}
          onClick={() => setChoosingInstance(true)}
        >
          Choose another instance
        </Button>
      </div>
    </main>
  );
}

export default App;
