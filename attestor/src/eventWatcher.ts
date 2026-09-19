// Discovers `ProtectionOpened` events via Stellar RPC. The event is only a
// discovery signal — get_protection() is always the source of truth (Bölüm 8).
// Minimum local checkpoint persistence for idempotency across restarts; not
// production infrastructure.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rpc, contract } from "@stellar/stellar-sdk";
import { config } from "./config.ts";
import { loadSpec } from "./contractSpec.ts";
import { getProtection } from "./contractClient.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CURSOR_FILE = path.resolve(__dirname, "..", ".watcher-cursor.json");

interface CursorState {
  lastLedger: number;
  processedWithdrawalIds: string[]; // hex-encoded, for idempotency
}

function loadCursor(): CursorState {
  if (existsSync(CURSOR_FILE)) {
    return JSON.parse(readFileSync(CURSOR_FILE, "utf8"));
  }
  return { lastLedger: 0, processedWithdrawalIds: [] };
}

function saveCursor(state: CursorState) {
  writeFileSync(CURSOR_FILE, JSON.stringify(state, null, 2));
}

export interface DiscoveredProtection {
  anchorWithdrawalId: Uint8Array;
  anchorWithdrawalIdHex: string;
  verifiedRecord: unknown;
}

/**
 * Polls for `ProtectionOpened` events since the last saved cursor (or
 * `sinceLedger` on first run), and for each NOT already processed (by hex id,
 * idempotent across restarts/duplicate events), confirms it via
 * `get_protection` (source of truth, Bölüm 8) before returning it.
 */
export async function pollNewProtections(sinceLedger: number): Promise<DiscoveredProtection[]> {
  const server = new rpc.Server(config.rpcUrl);
  const spec = loadSpec();
  const cursor = loadCursor();
  const startLedger = cursor.lastLedger > 0 ? cursor.lastLedger + 1 : sinceLedger;

  const topicFilter = spec.eventTopicFilter("ProtectionOpened");

  const response = await server.getEvents({
    startLedger,
    filters: [{ type: "contract", contractIds: [config.contractId], topics: [topicFilter] }],
    limit: 100,
  });

  const discovered: DiscoveredProtection[] = [];
  let maxLedgerSeen = cursor.lastLedger;

  for (const event of response.events) {
    maxLedgerSeen = Math.max(maxLedgerSeen, event.ledger);

    const parsed = spec.parseEvent(event.topic, event.value);
    if (!parsed || parsed.name !== "ProtectionOpened") continue;

    const withdrawalIdBuf = Buffer.from(parsed.data.anchor_withdrawal_id as Uint8Array);
    const hex = withdrawalIdBuf.toString("hex");

    if (cursor.processedWithdrawalIds.includes(hex)) {
      continue; // already handled — idempotent, whether duplicate event or restart replay
    }

    // Event is a discovery signal only — always re-confirm against the
    // contract's own storage before treating it as real (Bölüm 8).
    const record = await getProtection(withdrawalIdBuf);

    discovered.push({
      anchorWithdrawalId: withdrawalIdBuf,
      anchorWithdrawalIdHex: hex,
      verifiedRecord: record,
    });

    cursor.processedWithdrawalIds.push(hex);
  }

  cursor.lastLedger = Math.max(maxLedgerSeen, startLedger - 1);
  saveCursor(cursor);

  return discovered;
}
