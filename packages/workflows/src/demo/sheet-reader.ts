/**
 * Sheet Reader — reads application rows from JSON or CSV files.
 *
 * Simulates a Google Sheets integration by loading job application data
 * from a local file. Supports both JSON arrays and simple CSV format.
 */

import { readFileSync } from "node:fs";
import { extname } from "node:path";

export interface ApplicationRow {
  jobUrl: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  resumePath: string;
}

const REQUIRED_FIELDS: ReadonlyArray<keyof ApplicationRow> = [
  "jobUrl",
  "firstName",
  "lastName",
  "email",
  "phone",
  "resumePath",
];

function parseCSV(content: string): ApplicationRow[] {
  const lines = content.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());

  return lines.slice(1).map((line, idx) => {
    const values = line.split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = values[i] ?? "";
    }
    validateRow(row, idx + 2);
    return row as unknown as ApplicationRow;
  });
}

function parseJSON(content: string): ApplicationRow[] {
  const parsed = JSON.parse(content);
  const rows: unknown[] = Array.isArray(parsed) ? parsed : [parsed];

  return rows.map((row, idx) => {
    if (typeof row !== "object" || row === null) {
      throw new Error(`Row ${idx + 1}: expected an object, got ${typeof row}`);
    }
    validateRow(row as Record<string, unknown>, idx + 1);
    return row as ApplicationRow;
  });
}

function validateRow(row: Record<string, unknown>, rowNum: number): void {
  const missing = REQUIRED_FIELDS.filter(
    (f) => !row[f] || (typeof row[f] === "string" && !(row[f] as string).trim()),
  );
  if (missing.length > 0) {
    throw new Error(
      `Row ${rowNum}: missing required fields: ${missing.join(", ")}`,
    );
  }
}

/**
 * Read application rows from a JSON or CSV file.
 */
export function readApplicationSheet(filePath: string): ApplicationRow[] {
  const content = readFileSync(filePath, "utf-8");
  const ext = extname(filePath).toLowerCase();

  if (ext === ".csv") {
    return parseCSV(content);
  }
  return parseJSON(content);
}
