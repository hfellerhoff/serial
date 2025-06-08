import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTRPC } from "~/trpc/react";

export function useDeleteAccountMutation() {
  const api = useTRPC();
  const router = useRouter();

  return useMutation(
    api.user.delete.mutationOptions({
      onSuccess: () => {
        router.push("/");
      },
    }),
  );
}
