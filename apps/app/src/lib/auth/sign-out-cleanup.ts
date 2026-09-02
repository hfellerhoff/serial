type SignOutCleanupOptions = {
  clearQueryCache: () => void;
  clearPersistedUserData: () => void;
  localStorage: Pick<Storage, "clear">;
};

export function clearUserDataAfterSignOut({
  clearQueryCache,
  clearPersistedUserData,
  localStorage,
}: SignOutCleanupOptions) {
  clearQueryCache();
  clearPersistedUserData();
  localStorage.clear();
}
