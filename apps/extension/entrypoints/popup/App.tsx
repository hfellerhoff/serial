import { useEffect, useState } from "react";
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
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

function App() {
  const [session, setSession] = useState<ExtensionAuthSession | null>(null);
  const [detectedInstance, setDetectedInstance] = useState<string | null>(null);
  const [lastInstance, setLastInstance] = useState<string | null>(null);
  const [instance, setInstance] = useState(DEFAULT_SERIAL_INSTANCE);
  const [manualInstance, setManualInstance] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<"sign-in" | "sign-out" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [instanceError, setInstanceError] = useState<string | null>(null);

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

  async function selectManualInstance() {
    try {
      const normalized = normalizeInstanceUrl(manualInstance);
      setInstance(normalized);
      setInstanceError(null);
      setDialogOpen(false);
    } catch (manualError) {
      setInstanceError(
        manualError instanceof Error
          ? manualError.message
          : "Enter a valid Serial instance",
      );
    }
  }

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
      <main className="grid min-h-[300px] place-items-center">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </main>
    );
  }

  if (session) {
    return (
      <main className="flex min-h-[300px] flex-col p-5">
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

  return (
    <main className="grid gap-5 p-5">
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
          onClick={() => setDialogOpen(true)}
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
        className="w-full"
        disabled={action !== null}
        onClick={() => void handleSignIn()}
      >
        {action === "sign-in" && <Loader2 className="size-4 animate-spin" />}
        Continue with Serial
      </Button>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setInstanceError(null);
        }}
      >
        <DialogContent className="w-[348px] p-5">
          <DialogHeader>
            <DialogTitle>Choose your Serial instance</DialogTitle>
            <DialogDescription>
              Use the current Serial site automatically or enter another
              instance.
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="automatic">
            <TabsList className="w-full">
              <TabsTrigger value="automatic">Automatic</TabsTrigger>
              <TabsTrigger value="manual">Manual</TabsTrigger>
            </TabsList>
            <TabsContent value="automatic" className="grid gap-3 pt-2">
              {detectedInstance ? (
                <Alert>
                  <Info />
                  <AlertDescription>
                    Serial was detected at{" "}
                    <strong>{displayHost(detectedInstance)}</strong>.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <Info />
                  <AlertDescription>
                    No Serial instance was detected in the current tab.
                  </AlertDescription>
                </Alert>
              )}
              {[detectedInstance, lastInstance, DEFAULT_SERIAL_INSTANCE]
                .filter(
                  (value, index, values): value is string =>
                    Boolean(value) && values.indexOf(value) === index,
                )
                .map((candidate) => (
                  <Button
                    key={candidate}
                    variant={candidate === instance ? "default" : "outline"}
                    onClick={() => {
                      setInstance(candidate);
                      setDialogOpen(false);
                    }}
                  >
                    {displayHost(candidate)}
                  </Button>
                ))}
            </TabsContent>
            <TabsContent value="manual" className="grid gap-3 pt-2">
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
                    if (event.key === "Enter") {
                      void selectManualInstance();
                    }
                  }}
                />
              </div>
              {instanceError && (
                <Alert variant="destructive">
                  <Info />
                  <AlertDescription>{instanceError}</AlertDescription>
                </Alert>
              )}
              <Button onClick={() => void selectManualInstance()}>Done</Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </main>
  );
}

export default App;
