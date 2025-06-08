import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "~/trpc/react";

export function useUpdateEmailMutation() {
  const api = useTRPC();

  return useMutation(api.user.updateEmail.mutationOptions());
}
