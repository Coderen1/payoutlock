/** Middle-truncates a long identifier (hash, address): `GBBD47…LFLA5`. Short values are returned whole. */
export function shortenMiddle(value: string, head = 6, tail = 6): string {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}
