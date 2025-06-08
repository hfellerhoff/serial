import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "~/trpc/react";

export function useUpdateNameMutation() {
  const api = useTRPC();

  return useMutation(api.user.updateName.mutationOptions());
}
