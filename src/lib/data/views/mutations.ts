import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "~/trpc/react";

export function useCreateViewMutation() {
  const api = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    api.views.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: api.views.getAll.queryKey(),
        });
      },
    }),
  );
}
