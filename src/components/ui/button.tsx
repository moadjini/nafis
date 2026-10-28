import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-colors duration-150 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-primary-strong text-primary-foreground shadow-[0_1px_2px_rgb(21_128_61/0.25)] hover:bg-primary-hover active:bg-primary-hover",
        secondary:
          "border border-primary/50 bg-surface text-primary-text hover:border-primary hover:bg-primary-faint active:bg-primary-soft",
        soft: "bg-primary-soft text-primary-text hover:bg-primary-soft/70",
        ghost: "text-foreground hover:bg-primary-faint hover:text-primary-text",
        outline: "border border-border bg-surface text-foreground hover:border-primary/40 hover:bg-primary-faint",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive-hover",
        "destructive-ghost": "text-destructive hover:bg-destructive-soft",
        link: "h-auto rounded-sm px-0 text-primary-text underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-3.5 text-sm [&_svg]:size-4",
        md: "h-11 px-5 text-[0.95rem] [&_svg]:size-[1.1rem]",
        lg: "h-12 px-6 text-base [&_svg]:size-5",
        icon: "size-11 [&_svg]:size-5",
        "icon-sm": "size-9 [&_svg]:size-[1.05rem]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
  };

export function Button({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {children}
        </>
      )}
    </Comp>
  );
}
