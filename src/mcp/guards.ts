export type McpRecord = Record<string, unknown>;

export function isMcpRecord(value: unknown): value is McpRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
