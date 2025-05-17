import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "~/trpc/react";

export function useCreateContentCategoryMutation() {
  const api = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    api.contentCategories.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: api.contentCategories.getAll.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: api.feedCategories.getAll.queryKey(),
        });
      },
    }),
  );
}

export function useUpdateContentCategoryMutation() {
  const api = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    api.contentCategories.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: api.contentCategories.getAll.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: api.feedCategories.getAll.queryKey(),
        });
      },
    }),
  );
}

export function useDeleteContentCategoryMutation() {
  const api = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    api.contentCategories.delete.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: api.contentCategories.getAll.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: api.views.getAll.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: api.feedCategories.getAll.queryKey(),
        });
      },
    }),
  );
}
