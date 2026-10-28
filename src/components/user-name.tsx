import Link from "next/link";
import { cn } from "@/lib/utils";
import { VerifiedBadge } from "@/components/verified-badge";

/**
 * The one place a member's display name is rendered, so the verified badge is
 * consistent everywhere and never duplicated. The badge sits outside the link
 * so it is not read as part of the link text.
 */
export function UserName({
  name,
  verified,
  href,
  className,
  nameClassName,
}: {
  name: string;
  verified?: boolean;
  href?: string;
  className?: string;
  nameClassName?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 max-w-full items-center gap-1", className)}>
      {href ? (
        <Link href={href} className={cn("truncate hover:underline", nameClassName)}>
          {name}
        </Link>
      ) : (
        <span className={cn("truncate", nameClassName)}>{name}</span>
      )}
      {verified ? <VerifiedBadge /> : null}
    </span>
  );
}
