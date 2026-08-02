import type { MouseEventHandler, ReactNode } from "react";

interface SelectableManagementRowProps {
  title: string;
  selectionLabel: string;
  selected: boolean;
  leading: ReactNode;
  details?: ReactNode;
  action: ReactNode;
  onSelect: MouseEventHandler<HTMLButtonElement>;
}

export function SelectableManagementRow({
  title,
  selectionLabel,
  selected,
  leading,
  details,
  action,
  onSelect,
}: SelectableManagementRowProps) {
  return (
    <div
      className="hover:bg-muted/50 relative flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left transition-colors"
      data-management-selection-row
    >
      <button
        type="button"
        className="focus-visible:ring-ring/50 absolute inset-0 z-0 cursor-pointer rounded-[inherit] outline-none focus-visible:ring-[3px]"
        aria-label={selectionLabel}
        aria-pressed={selected}
        onClick={onSelect}
      />
      <div className="relative z-10 shrink-0">{leading}</div>
      <span className="pointer-events-none line-clamp-1 flex-1">{title}</span>
      {details && <div className="pointer-events-none">{details}</div>}
      <div className="relative z-10 shrink-0">{action}</div>
    </div>
  );
}
