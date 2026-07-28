"use client";

import type { Ref } from "react";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

export function CategoryNameInput({
  name,
  setName,
  inputRef,
}: {
  name: string;
  setName: (name: string) => void;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="name">Name</Label>
      <Input
        ref={inputRef}
        id="name"
        type="text"
        value={name}
        placeholder="My Tag"
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
    </div>
  );
}
