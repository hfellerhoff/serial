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
      },
    }),
  );
}
