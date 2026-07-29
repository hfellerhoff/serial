import type { ExtensionAuthSession } from "./auth";

type RefreshSessionDependencies = {
  refresh: (session: ExtensionAuthSession) => Promise<ExtensionAuthSession>;
  readStoredSession: () => Promise<ExtensionAuthSession | null>;
  clearStoredSession: () => Promise<void>;
  isInvalidSessionError: (error: unknown) => boolean;
};

export function createRefreshSessionSingleFlight({
  refresh,
  readStoredSession,
  clearStoredSession,
  isInvalidSessionError,
}: RefreshSessionDependencies) {
  const refreshesByToken = new Map<
    string,
    Promise<ExtensionAuthSession | null>
  >();

  return function refreshOrKeepSession(session: ExtensionAuthSession) {
    const existingRefresh = refreshesByToken.get(session.refreshToken);
    if (existingRefresh) return existingRefresh;

    const refreshAttempt = refresh(session).catch(async (error: unknown) => {
      if (!isInvalidSessionError(error)) return session;

      const currentSession = await readStoredSession();
      const failedTokenIsStillCurrent =
        currentSession?.refreshToken === session.refreshToken;
      if (failedTokenIsStillCurrent) {
        await clearStoredSession();
      }
      return null;
    });
    refreshesByToken.set(session.refreshToken, refreshAttempt);
    void refreshAttempt.finally(() => {
      if (refreshesByToken.get(session.refreshToken) === refreshAttempt) {
        refreshesByToken.delete(session.refreshToken);
      }
    });
    return refreshAttempt;
  };
}
