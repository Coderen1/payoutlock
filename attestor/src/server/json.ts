/** Recursively converts bigint values to strings and byte buffers to hex, so
 * contract records (i128/u64 fields decode to bigint, Bytes fields decode to
 * Buffer/Uint8Array) can be sent as JSON. */
export function toJsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array) return Buffer.from(value).toString("hex");
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = toJsonSafe(v);
    return out;
  }
  return value;
}
