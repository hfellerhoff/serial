import { useMutation } from "@tanstack/react-query";
import { orpc } from "~/lib/orpc";

export function useUpdateNameMutation() {
  return useMutation(orpc.user.updateName.mutationOptions());
}
