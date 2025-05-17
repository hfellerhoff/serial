import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type Dispatch,
  type SetStateAction,
  useState,
  useEffect,
  useCallback,
} from "react";
import { type z, type ZodType } from "zod";

export function useSearchParamState<T extends ZodType>(
  key: string,
  defaultValue: z.infer<T>,
  schema: T,
) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const updateUrl = (newValue: string) => {
    const newSearchParams = new URLSearchParams(searchParams);
    if (newValue === defaultValue) {
      newSearchParams.delete(key);
    } else {
      newSearchParams.set(key, newValue);
    }
    const url = `${pathname}?${newSearchParams.toString()}`;
    router.push(url);
  };

  const getValue = useCallback(() => {
    const value = searchParams.get(key);
    if (value === null) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return defaultValue;
    }

    const res = schema.safeParse(value);
    if (res.success) {
      return value;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return defaultValue;
  }, [defaultValue, key, schema, searchParams]);

  const [value, setStateValue] = useState<z.infer<T>>(() => getValue());

  useEffect(() => {
    const value = getValue();
    setStateValue(value);
  }, [getValue]);

  const setValue: Dispatch<SetStateAction<z.infer<T>>> = (
    newValueOrCallback,
  ) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const newValue =
      typeof newValueOrCallback === "function"
        ? // @ts-expect-error I don't know, can't be bothered
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          newValueOrCallback(value)
        : newValueOrCallback;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    setStateValue(newValue);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    updateUrl(newValue);
  };

  return [value, setValue] as const;
}
