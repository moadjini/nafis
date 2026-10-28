import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

const fieldBase =
  "w-full rounded-xl border border-border bg-surface px-4 text-[0.95rem] text-foreground placeholder:text-muted-foreground/80 transition-[border-color,box-shadow] hover:border-primary/40 focus-visible:border-primary focus-visible:shadow-[0_0_0_4px_rgb(22_163_74/0.15)] focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-muted aria-invalid:border-destructive aria-invalid:focus-visible:shadow-[0_0_0_4px_rgb(180_35_24/0.12)]";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldBase, "h-12", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "min-h-28 resize-y py-3 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        fieldBase,
        "h-11 appearance-none bg-[length:1rem] bg-[right_0.9rem_center] bg-no-repeat pr-10",
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23647067' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-sm font-medium text-foreground", className)} {...props} />;
}

type FieldProps = {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null;
  optional?: string;
  className?: string;
  children: ReactNode;
};

/** Label + control + hint/error with correct ARIA wiring (ids: `${htmlFor}-hint|error`). */
export function Field({ label, htmlFor, hint, error, optional, className, children }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={htmlFor}>{label}</Label>
        {optional ? <span className="text-xs text-muted-foreground">{optional}</span> : null}
      </div>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function describedBy(id: string, { hint, error }: { hint?: unknown; error?: unknown }) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

/** Toggleable pill used for topic / language multi-selects. */
export function Chip({
  selected,
  className,
  children,
  ...props
}: ComponentProps<"button"> & { selected: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors",
        selected
          ? "border-primary bg-primary-soft font-medium text-primary-text"
          : "border-border bg-surface text-foreground hover:border-primary/50 hover:bg-primary-faint/60",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
