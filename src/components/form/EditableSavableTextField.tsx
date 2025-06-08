import { CheckIcon, Edit2Icon, Loader, XIcon } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { z } from "zod";
import clsx from "clsx";

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
  placeholder: string;
  onSave: (updatedValue: string) => Promise<void>;
  schema: z.ZodString;
}

export function EditableSavableTextField({
  initialValue,
  label,
  helperText,
  placeholder,
  onSave,
  schema,
}: EditableSavableTextFieldProps) {
  const id = useId();

  const inputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [errors, setErrors] = useState<string[]>([]);

  const hasErrors = !!errors.length;

  const cancelEditing = () => {
    setIsEditing(false);
    setErrors([]);
    formRef.current?.reset();
  };

  return (
    <form
      ref={formRef}
      className="grid gap-2"
      onSubmit={async (e) => {
        e.preventDefault();

        const formValues = new FormData(e.currentTarget);
        const fieldValue = formValues.get(id);

        if (String(fieldValue) === initialValue) {
          cancelEditing();
          return;
        }

        const {
          success,
          data: validatedValue,
          error,
        } = schema.safeParse(fieldValue);

        console.log(validatedValue);

        if (!success) {
          setErrors(error.flatten().formErrors);
          return;
        }
        setErrors([]);

        e.currentTarget.reset();

        setIsSaving(true);
        setIsEditing(false);

        await onSave(String(validatedValue));

        setIsSaving(false);
      }}
    >
      <Label htmlFor={id}>{label}</Label>

      <div className="flex items-start gap-1">
        <div className="grid flex-1">
          <Input
            ref={inputRef}
            id={id}
            name={id}
            type="text"
            placeholder={placeholder}
            defaultValue={initialValue}
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
              console.log(inputRef.current);
              inputRef.current?.focus();
            }}
            isSaving={isSaving}
          />
        )}
        {isEditing && (
          <EditableSavableTextFieldEditingActions onCancel={cancelEditing} />
        )}
      </div>
      {!!helperText && (
        <p className="text-foreground/70 text-sm">{helperText}</p>
      )}
    </form>
  );
}
