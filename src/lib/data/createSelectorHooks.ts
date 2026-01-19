import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { StoreApi, UseBoundStore } from "zustand";

export type ZustandHookSelectors<TState> = {
  [Key in NonNullable<keyof TState> as `use${Capitalize<
    string & Key
  >}`]: () => TState[Key];
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type StoreWithHooks<TState> = (
  | UseBoundStore<StoreApi<TState>>
  | StoreApi<TState>
) &
  Record<string, () => unknown>;

export function createSelectorHooks<TState extends object>(
  store: UseBoundStore<StoreApi<TState>> | StoreApi<TState>,
) {
  const storeIn = store as StoreWithHooks<TState>;

  Object.keys(storeIn.getState()).forEach((key) => {
    const selector = (state: TState) => state[key as keyof TState];
    storeIn[`use${capitalize(key)}`] =
      typeof storeIn === "function"
        ? () =>
            (storeIn as UseBoundStore<StoreApi<TState>>)(useShallow(selector))
        : () => useStore(storeIn as StoreApi<TState>, useShallow(selector));
  });

  return storeIn as UseBoundStore<StoreApi<TState>> &
    ZustandHookSelectors<TState>;
}
