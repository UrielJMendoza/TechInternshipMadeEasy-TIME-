"use client";

import type { ReactNode } from "react";
import { trackApplyClicked, type AnalyticsSurface } from "@/lib/analytics";
import type { Category, RoleType } from "@/lib/types";

export function TrackedApplyLink({
  href,
  surface,
  roleType,
  category,
  className,
  children,
}: {
  href: string;
  surface: AnalyticsSurface;
  roleType: RoleType;
  category: Category;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() =>
        trackApplyClicked({ surface, roleType, category })
      }
    >
      {children}
    </a>
  );
}
