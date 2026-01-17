import { useMutation } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useTRPC } from "~/trpc/react";

export function useDeleteAccountMutation() {
  const api = useTRPC();
  const router = useRouter();

  return useMutation(
    api.user.delete.mutationOptions({
      onSuccess: () => {
        router.navigate({ to: "/" });
      },
    }),
  );
}
