import { z } from "zod";
import type { SnapshotIssue } from "./contracts.ts";

const boundedText = z.string().max(10_000);
const nullableBoundedText = boundedText.nullable().optional();

export const SimplifyJobSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  company_name: boundedText.min(1),
  title: boundedText.min(1),
  url: boundedText.min(1).max(2_048),
  locations: z.array(boundedText).max(100).default([]),
  terms: z.array(boundedText).max(20).optional(),
  category: nullableBoundedText,
  sponsorship: nullableBoundedText,
  active: z.boolean(),
  is_visible: z.boolean(),
  date_posted: z.number().finite().nonnegative().optional().default(0),
  requisition_id: nullableBoundedText,
});

export type SimplifyJobInput = z.infer<typeof SimplifyJobSchema>;

export const ZshahJobSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  company: boundedText.min(1),
  title: boundedText.min(1),
  season: nullableBoundedText,
  category: nullableBoundedText,
  location: nullableBoundedText,
  url: boundedText.min(1).max(2_048),
  posted_at: nullableBoundedText,
  sponsorship: nullableBoundedText,
  salary: nullableBoundedText,
  requisition_id: nullableBoundedText,
});

export type ZshahJobInput = z.infer<typeof ZshahJobSchema>;

export const ZshahEnvelopeSchema = z.object({
  generated_at: nullableBoundedText,
  count: z.number().int().nonnegative().optional(),
  jobs: z.array(z.unknown()),
});

export interface ParsedJsonRows<T> {
  raw_count: number;
  parsed: T[];
  issues: SnapshotIssue[];
}

function issuePath(path: PropertyKey[]): string {
  return path.map(String).join(".");
}

export function parseJson(text: string):
  | { success: true; data: unknown }
  | { success: false; issue: SnapshotIssue } {
  try {
    return { success: true, data: JSON.parse(text) as unknown };
  } catch (error) {
    return {
      success: false,
      issue: {
        code: "invalid_json",
        message: error instanceof Error ? error.message : "Invalid JSON",
      },
    };
  }
}

export function parseJsonRows<T>(
  rows: unknown,
  schema: z.ZodType<T>,
): ParsedJsonRows<T> {
  if (!Array.isArray(rows)) {
    return {
      raw_count: 0,
      parsed: [],
      issues: [
        {
          code: "invalid_schema",
          message: "Expected a top-level array of feed rows",
        },
      ],
    };
  }

  const parsed: T[] = [];
  const issues: SnapshotIssue[] = [];
  rows.forEach((row, index) => {
    const result = schema.safeParse(row);
    if (result.success) {
      parsed.push(result.data);
      return;
    }
    for (const issue of result.error.issues.slice(0, 3)) {
      issues.push({
        code: "invalid_row",
        message: issue.message,
        row: index + 1,
        path: issuePath(issue.path),
      });
    }
  });

  return { raw_count: rows.length, parsed, issues };
}

export function validateRequiredMarkers(
  text: string,
  markers: readonly string[],
): SnapshotIssue[] {
  return markers.flatMap((marker) =>
    text.includes(marker)
      ? []
      : [
          {
            code: "missing_marker" as const,
            message: `Expected source marker ${JSON.stringify(marker)}`,
          },
        ],
  );
}

export function markdownCandidateRows(
  markdown: string,
  minimumCells: number,
): string[] {
  return markdown.split("\n").filter((line) => {
    if (!line.startsWith("|")) return false;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < minimumCells) return false;
    if (cells.every((cell) => /^:?-+:?$/.test(cell.replace(/\s/g, "")))) {
      return false;
    }
    return !/^(company|role|position)$/i.test(cells[0]);
  });
}
