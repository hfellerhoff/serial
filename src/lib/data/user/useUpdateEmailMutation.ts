import { useMutation } from "@tanstack/react-query";
import { orpc } from "~/lib/orpc";

export function useUpdateEmailMutation() {
  return useMutation(orpc.user.updateEmail.mutationOptions());
}
