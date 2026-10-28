import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-4">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-72" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-3xl border border-border p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="mt-4 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-5/6" />
          <Skeleton className="mt-2 h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}
