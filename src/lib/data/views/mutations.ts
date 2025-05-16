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

export function useEditViewMutation() {
  const api = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    api.views.edit.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: api.views.getAll.queryKey(),
        });
      },
    }),
  );
}

export function useDeleteViewMutation() {
  const api = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    api.views.delete.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: api.views.getAll.queryKey(),
        });
      },
    }),
  );
}
