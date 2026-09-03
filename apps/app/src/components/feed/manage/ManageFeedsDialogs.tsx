import { toast } from "sonner";
import { feedCountLabel } from "./useBulkFeedEditing";
import type { Dispatch, SetStateAction } from "react";
import { ViewCategoriesInput } from "~/components/view-dialog";
import { Button } from "~/components/ui/button";
import { ChipCombobox } from "~/components/ui/chip-combobox";
import { ControlledResponsiveDialog } from "~/components/ui/responsive-dropdown";
import { Switch } from "~/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { useQuickCreateViewMutation } from "~/lib/data/views/mutations";

export function DeleteFeedsDialog({
  open,
  onOpenChange,
  selectedCount,
  canMutate,
  isDeletingFeeds,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  canMutate: boolean;
  isDeletingFeeds: boolean;
  onDelete: () => void;
}) {
  return (
    <ControlledResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete Feeds"
      description={`Are you sure you want to delete ${feedCountLabel(selectedCount)}? This action cannot be undone.`}
    >
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </Button>
        <Button
          variant="destructive"
          className="flex-1"
          onClick={onDelete}
          disabled={!canMutate || isDeletingFeeds}
        >
          {isDeletingFeeds ? "Deleting..." : "Delete"}
        </Button>
      </div>
    </ControlledResponsiveDialog>
  );
}

export function EditFeedsDialog({
  open,
  onOpenChange,
  selectedCount,
  bulkActiveState,
  setBulkActiveState,
  canMutate,
  isSaving,
  onSave,
  customViewOptions,
  selectedViewIds,
  setSelectedViewIds,
  selectedCategoryIds,
  setSelectedCategoryIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  bulkActiveState: boolean;
  setBulkActiveState: (active: boolean) => void;
  canMutate: boolean;
  isSaving: boolean;
  onSave: () => void;
  customViewOptions: Array<{ id: number; label: string }>;
  selectedViewIds: number[];
  setSelectedViewIds: (ids: number[]) => void;
  selectedCategoryIds: number[];
  setSelectedCategoryIds: Dispatch<SetStateAction<number[]>>;
}) {
  const { mutateAsync: quickCreateView } = useQuickCreateViewMutation();

  return (
    <ControlledResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Feeds"
      description={`Edit ${feedCountLabel(selectedCount)}.`}
      headerRight={
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center">
              <Switch
                checked={bulkActiveState}
                onCheckedChange={setBulkActiveState}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {bulkActiveState ? "Feeds active" : "Feeds inactive"}
          </TooltipContent>
        </Tooltip>
      }
      footer={
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={onSave}
            disabled={!canMutate || isSaving}
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <ChipCombobox
          label="Views"
          placeholder="Search views..."
          options={customViewOptions}
          selectedIds={selectedViewIds}
          onAdd={(id) => setSelectedViewIds([...selectedViewIds, id])}
          onRemove={(id) =>
            setSelectedViewIds(selectedViewIds.filter((v) => v !== id))
          }
          onCreate={async (name) => {
            try {
              const created = await quickCreateView({ name });
              if (created) {
                setSelectedViewIds([...selectedViewIds, created.id]);
              }
            } catch {
              toast.error("Failed to create view.");
            }
          }}
          createLabel="Create view"
        />
        <ViewCategoriesInput
          selectedCategories={selectedCategoryIds}
          setSelectedCategories={setSelectedCategoryIds}
        />
      </div>
    </ControlledResponsiveDialog>
  );
}
