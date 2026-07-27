import clsx from "clsx";
import { CheckIcon, Edit2Icon, Loader, XIcon } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import type { z } from "zod";

function EditableSavableTextFieldNotEditingActions({
  onEdit,
  isSaving,
}: {
  onEdit: () => void;
  isSaving: boolean;
}) {
  return (
    <Button
      disabled={isSaving}
      className="shrink-0"
      onClick={onEdit}
      variant="outline"
      size="icon"
      type="button"
    >
      {isSaving ? (
        <Loader className="animate-spin" size={16} />
      ) : (
        <Edit2Icon size={16} />
      )}
    </Button>
  );
}

function EditableSavableTextFieldEditingActions({
  onCancel,
}: {
  onCancel: () => void;
}) {
  return (
    <>
      <Button
        className="shrink-0"
        onClick={onCancel}
        variant="outline"
        size="icon"
        type="button"
      >
        <XIcon size={16} />
      </Button>
      <Button className="shrink-0" type="submit" variant="outline" size="icon">
        <CheckIcon size={16} />
      </Button>
    </>
  );
}

interface EditableSavableTextFieldProps {
  initialValue: string;
  label: string;
  helperText?: string;
  showHelperTextOnlyWhenEditing?: boolean;
  placeholder: string;
  onSave: (updatedValue: string) => Promise<"saved" | "pending" | "failed">;
  schema: z.ZodType<string>;
}

export function EditableSavableTextField({
  initialValue,
  label,
  helperText,
  showHelperTextOnlyWhenEditing = false,
  placeholder,
  onSave,
  schema,
}: EditableSavableTextFieldProps) {
  const id = useId();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [inputValue, setInputValue] = useState(initialValue);

  const [errors, setErrors] = useState<string[]>([]);

  const hasErrors = !!errors.length;

  const cancelEditing = () => {
    setIsEditing(false);
    setErrors([]);
    setInputValue(initialValue);
  };

  return (
    <form
      className="grid gap-2"
      action={async (formValues) => {
        const fieldValue = formValues.get(id);

        if (fieldValue === initialValue) {
          cancelEditing();
          return;
        }

        const {
          success,
          data: validatedValue,
          error,
        } = schema.safeParse(fieldValue);

        if (!success) {
          setErrors(error.flatten().formErrors);
          return;
        }
        setErrors([]);

        setIsSaving(true);
        try {
          const result = await onSave(String(validatedValue));
          if (result === "failed") return;

          setInputValue(result === "saved" ? validatedValue : initialValue);
          setIsEditing(false);
        } finally {
          setIsSaving(false);
        }
      }}
    >
      <Label htmlFor={id}>{label}</Label>

      <div className="flex items-start gap-1">
        <div className="grid flex-1">
          <Input
            id={id}
            name={id}
            type="text"
            placeholder={placeholder}
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            disabled={!isEditing || isSaving}
            className={clsx({
              "border-destructive rounded-b-none": hasErrors,
            })}
          />
          {hasErrors && (
            <div className="bg-destructive border-destructive rounded-b-md border border-solid">
              {errors.map((error) => (
                <p
                  key={error}
                  className="text-destructive-foreground px-3 py-0.5 text-xs"
                >
                  {error}
                </p>
              ))}
            </div>
          )}
        </div>
        {!isEditing && (
          <EditableSavableTextFieldNotEditingActions
            onEdit={() => {
              setIsEditing(true);
            }}
            isSaving={isSaving}
          />
        )}
        {isEditing && (
          <EditableSavableTextFieldEditingActions onCancel={cancelEditing} />
        )}
      </div>
      {!!helperText && (!showHelperTextOnlyWhenEditing || isEditing) && (
        <p className="text-foreground/70 text-sm">{helperText}</p>
      )}
    </form>
  );
}
