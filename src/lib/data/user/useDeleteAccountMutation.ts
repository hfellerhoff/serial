import { useMutation } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { orpc } from "~/lib/orpc";

export function useDeleteAccountMutation() {
  const router = useRouter();

  return useMutation(
    orpc.user.deleteUser.mutationOptions({
      onSuccess: () => {
        router.navigate({ to: "/" });
      },
    }),
  );
}
