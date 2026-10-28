import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "neutral",
  ...props
}: ComponentProps<"span"> & { tone?: "neutral" | "green" | "warning" | "danger" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-muted text-muted-foreground",
        tone === "green" && "bg-primary-soft text-primary-text",
        tone === "warning" && "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
        tone === "danger" && "bg-destructive-soft text-destructive",
        className,
      )}
      {...props}
    />
  );
}

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div aria-hidden className={cn("animate-pulse rounded-xl bg-primary-faint dark:bg-muted", className)} {...props} />;
}

export function Notice({
  icon: Icon,
  tone = "green",
  title,
  children,
  className,
}: {
  icon?: LucideIcon;
  tone?: "green" | "neutral" | "danger";
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-2xl px-4 py-3.5 text-sm leading-relaxed",
        tone === "green" && "bg-primary-faint text-foreground",
        tone === "neutral" && "bg-muted text-foreground",
        tone === "danger" && "border border-destructive/30 bg-destructive-soft text-foreground",
        className,
      )}
    >
      {Icon ? (
        <Icon
          className={cn("mt-0.5 size-[1.1rem] shrink-0", tone === "danger" ? "text-destructive" : "text-primary-text")}
          aria-hidden
        />
      ) : null}
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="text-muted-foreground [&_a]:font-medium [&_a]:text-primary-text">{children}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon: LucideIcon;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-primary-soft">
        <Icon className="size-6 text-primary" strokeWidth={1.6} aria-hidden />
      </div>
      <p className="text-base font-medium text-foreground">{title}</p>
      {body ? <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <span aria-hidden className="mb-3 block h-1 w-8 rounded-full bg-primary" />
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.7rem]">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-[0.95rem] text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function Section({ title, description, children, className, id }: { title: ReactNode; description?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("border-t border-border py-8 first:border-t-0 first:pt-0", className)}>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {description ? <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}
