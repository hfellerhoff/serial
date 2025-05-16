import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApplicationView } from "~/server/db/schema";
import { useTRPC } from "~/trpc/react";
import { INBOX_VIEW_ID, INBOX_VIEW_PLACEMENT } from ".";

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
    api.views.update.mutationOptions({
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

export function calculateViewsPlacement(views: ApplicationView[]) {
  const inboxIndex = views.findIndex((view) => view.id === INBOX_VIEW_ID);
  if (inboxIndex === -1) return views;

  return views.map((view, viewIndex) => ({
    ...view,
    placement: inboxIndex - viewIndex + INBOX_VIEW_PLACEMENT,
  }));
}

export function useUpdateViewsPlacementMutation() {
  const api = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    api.views.updatePlacement.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: api.views.getAll.queryKey(),
        });
      },
    }),
  );
}
