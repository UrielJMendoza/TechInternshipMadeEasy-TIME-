"use client";

import { useEffect } from "react";
import { trackJobOpened, type AnalyticsSurface } from "@/lib/analytics";
import type { Category, RoleType } from "@/lib/types";

export function JobOpenedEvent({
  surface,
  roleType,
  category,
}: {
  surface: AnalyticsSurface;
  roleType: RoleType;
  category: Category;
}) {
  useEffect(() => {
    trackJobOpened({ surface, roleType, category });
  }, [category, roleType, surface]);
  return null;
}
