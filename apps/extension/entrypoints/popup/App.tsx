import { useEffect, useState } from "react";
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
import { Check, Info, Loader2, Server } from "lucide-react";
import {
  DEFAULT_SERIAL_INSTANCE,
  LAST_INSTANCE_STORAGE_KEY,
  normalizeInstanceUrl,
  originPermission,
} from "../../lib/auth";
import type {
  AuthMessage,
  AuthMessageResponse,
  ExtensionAuthSession,
} from "../../lib/auth";

async function sendAuthMessage(message: AuthMessage) {
  const response = (await browser.runtime.sendMessage(
    message,
  )) as AuthMessageResponse;
  if (!response || typeof response.ok !== "boolean") {
    throw new Error("Unable to contact the Serial extension background");
  }
  return response;
}

async function detectSerialInstance() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith("http")) return null;

  try {
    const [{ result }] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const marker = document.querySelector<HTMLMetaElement>(
          'meta[name="serial-instance"]',
        );
        return marker?.content === "1" ? window.location.origin : null;
      },
    });
    return typeof result === "string" ? result : null;
  } catch {
    return null;
  }
}

function displayHost(instance: string) {
  return new URL(instance).host;
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
  onCancel: () => void;
  onSelect: (instance: string) => void;
};

function InstanceChooser({
  detectedInstance,
  instance,
  lastInstance,
  onCancel,
  onSelect,
}: InstanceChooserProps) {
  const [selectionMode, setSelectionMode] = useState<"automatic" | "manual">(
    "automatic",
  );
  const [selectedInstance, setSelectedInstance] = useState(instance);
  const [manualInstance, setManualInstance] = useState(instance);
  const [instanceError, setInstanceError] = useState<string | null>(null);
  const automaticCandidates = [
    detectedInstance,
    lastInstance,
    DEFAULT_SERIAL_INSTANCE,
  ].filter(
    (value, index, values): value is string =>
      Boolean(value) && values.indexOf(value) === index,
  );

  function handleDone() {
    try {
      const nextInstance =
        selectionMode === "manual"
          ? normalizeInstanceUrl(manualInstance)
          : selectedInstance;
      setInstanceError(null);
      onSelect(nextInstance);
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
                if (event.key === "Enter") handleDone();
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

      <div className="mt-auto grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Back
        </Button>
        <Button type="button" onClick={handleDone}>
          Done
        </Button>
      </div>
    </main>
  );
}

function App() {
  const [session, setSession] = useState<ExtensionAuthSession | null>(null);
  const [detectedInstance, setDetectedInstance] = useState<string | null>(null);
  const [lastInstance, setLastInstance] = useState<string | null>(null);
  const [instance, setInstance] = useState(DEFAULT_SERIAL_INSTANCE);
  const [choosingInstance, setChoosingInstance] = useState(false);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<"sign-in" | "sign-out" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [authResponse, detected, stored] = await Promise.all([
          sendAuthMessage({ type: "auth.get-session" }),
          detectSerialInstance(),
          browser.storage.local.get(LAST_INSTANCE_STORAGE_KEY),
        ]);
        const previous =
          typeof stored[LAST_INSTANCE_STORAGE_KEY] === "string"
            ? (stored[LAST_INSTANCE_STORAGE_KEY] as string)
            : null;

        if (authResponse.ok) setSession(authResponse.session);
        setDetectedInstance(detected);
        setLastInstance(previous);
        setInstance(
          authResponse.ok && authResponse.session
            ? authResponse.session.instance
            : (detected ?? previous ?? DEFAULT_SERIAL_INSTANCE),
        );
        if (!authResponse.ok) setError(authResponse.error);
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

  async function handleSignIn() {
    setAction("sign-in");
    setError(null);
    try {
      const normalized = normalizeInstanceUrl(instance);
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
      });
      if (!response.ok) throw new Error(response.error);
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
        <header className="flex items-center gap-3">
          <img className="size-10 rounded-lg" src="/icon/128.png" alt="" />
          <div className="min-w-0">
            <div className="font-semibold">Serial</div>
            <div className="text-muted-foreground truncate text-xs">
              {displayHost(session.instance)}
            </div>
          </div>
        </header>
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
          disabled={action !== null}
          onClick={() => void handleSignOut()}
        >
          {action === "sign-out" && <Loader2 className="size-4 animate-spin" />}
          Sign out of extension
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
        onCancel={() => setChoosingInstance(false)}
        onSelect={(nextInstance) => {
          setInstance(nextInstance);
          setChoosingInstance(false);
        }}
      />
    );
  }

  return (
    <main className="flex h-full flex-col gap-5 p-5">
      <header className="flex items-center gap-3">
        <img className="size-12 rounded-xl" src="/icon/128.png" alt="" />
        <div>
          <h1 className="text-lg font-semibold">Sign in to Serial</h1>
          <p className="text-muted-foreground text-sm">
            Continue in your browser with your Serial account.
          </p>
        </div>
      </header>

      <div className="grid gap-2">
        <Label>Serial instance</Label>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full justify-start px-3 font-normal"
          onClick={() => setChoosingInstance(true)}
        >
          <Server className="text-muted-foreground size-4" />
          <span className="min-w-0 flex-1 truncate text-sm">
            {displayHost(instance)}
          </span>
          <span className="text-muted-foreground text-xs">Change</span>
        </Button>
        {detectedInstance === instance && (
          <p className="text-muted-foreground text-xs">
            Detected from the current tab
          </p>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <Info />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        className="mt-auto w-full"
        disabled={action !== null}
        onClick={() => void handleSignIn()}
      >
        {action === "sign-in" && <Loader2 className="size-4 animate-spin" />}
        Continue with Serial
      </Button>
    </main>
  );
}

export default App;
