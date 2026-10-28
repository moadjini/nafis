"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="top-center"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "!rounded-2xl !border !border-border !bg-surface !text-foreground !shadow-float !font-sans !text-sm !leading-relaxed",
          description: "!text-muted-foreground",
          closeButton: "!bg-surface !border-border !text-muted-foreground",
          success: "!border-l-4 !border-l-primary [&_[data-icon]]:!text-primary",
          error: "!border-l-4 !border-l-destructive [&_[data-icon]]:!text-destructive",
        },
      }}
    />
  );
}
