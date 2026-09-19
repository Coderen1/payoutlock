// Thin keeper core: the permissionless state-advancement rules plus terminal-
// state slot release. Deliberately free of config/network imports so it can be
// unit tested without env vars, secrets or a chain — keeper.ts wires the real
// dependencies.
//
// What the keeper may do (advance_to_grace / advance_to_claimable /
// expire_unfunded have no require_auth in the contract, so the relayer can
// submit them):
//   Pending         + ledger time > sla_deadline                 -> advance_to_grace
//   Grace           + ledger time > grace_deadline               -> advance_to_claimable
//   AwaitingFunding + ledger time > funding_deadline + buffer
//                     and NO matching on-chain payment           -> expire_unfunded
// What it deliberately never does: claim(). Claiming is the User's own
// meaningful on-chain action, even though the contract would let anyone
// trigger it (funds always go to the record's user).
//
// Safety guard for LIVE protections (the demo kinds are synthetic — there is no
// anchor to consult): Grace -> Claimable is only taken when a fresh anchor
// observation, made in that same tick, positively says the payout is still
// unresolved. Anything else — no credentials, an expired or rejected token, a
// failed lookup, a `completed`/`refunded` payout, an unrecognised status — holds
// the protection in Grace. Failing to observe is NOT evidence the payout failed.
// The cost of the fail-safe is liveness: a live protection nobody can verify
// stays in Grace (collateral locked) until someone acts, which is documented as
// a known limitation of this prototype (see README).
//
// Every comparison uses LEDGER close time, never Date.now(): the contract's
// `now` lags wall-clock time, so waiting on the wall clock alone only
// produces a rejected transaction (see ledgerTime.ts).

export const TERMINAL_STATES: ReadonlySet<string> = new Set(["Settled", "Refunded", "Claimed", "Expired"]);

export function isTerminalState(tag: string | undefined | null): boolean {
  return !!tag && TERMINAL_STATES.has(tag);
}

type Numeric = bigint | number;

export interface KeeperRecord {
  state: { tag: string };
  created_at: Numeric;
  funding_deadline: Numeric;
  sla_deadline?: Numeric | null;
  grace_deadline?: Numeric | null;
}

export type KeeperAction =
  | { kind: "release_slot" }
  | { kind: "advance_to_grace" }
  | { kind: "advance_to_claimable" }
  | { kind: "expire_unfunded" }
  | { kind: "wait"; reason: string };

/** Pure: what (if anything) the chain state calls for right now. The
 * contract's own checks are strict `now > deadline`, so this is too. */
export function decideKeeperAction(
  record: KeeperRecord,
  ledgerNow: number,
  opts: { expireBufferSeconds: number },
): KeeperAction {
  const tag = record.state.tag;
  if (isTerminalState(tag)) return { kind: "release_slot" };

  switch (tag) {
    case "AwaitingFunding":
      return ledgerNow > Number(record.funding_deadline) + opts.expireBufferSeconds
        ? { kind: "expire_unfunded" }
        : { kind: "wait", reason: "funding window still open" };
    case "Pending":
      return record.sla_deadline != null && ledgerNow > Number(record.sla_deadline)
        ? { kind: "advance_to_grace" }
        : { kind: "wait", reason: "SLA still running" };
    case "Grace":
      return record.grace_deadline != null && ledgerNow > Number(record.grace_deadline)
        ? { kind: "advance_to_claimable" }
        : { kind: "wait", reason: "grace still running" };
    case "Claimable":
      return { kind: "wait", reason: "waiting for the User to claim" };
    default:
      return { kind: "wait", reason: `unrecognised state ${tag}` };
  }
}

export type AnchorPayoutVerdict = "resolved" | "unresolved" | "unknown";

// SEP-6 transaction statuses. Only statuses that positively mean "the fiat
// payout has not been delivered" count as unresolved; everything else — new or
// unrecognised statuses included — is treated as unknown and holds.
const RESOLVED_STATUSES = new Set(["completed", "refunded"]);
const UNRESOLVED_STATUSES = new Set([
  "incomplete",
  "pending_user_transfer_start",
  "pending_user_transfer_complete",
  "pending_external",
  "pending_anchor",
  "pending_stellar",
  "pending_receiver",
  "pending_sender",
  "pending_transaction_info_update",
  "pending_customer_info_update",
  "on_hold",
  "error",
  "expired",
  "no_market",
  "too_small",
  "too_large",
]);

export function classifyAnchorStatus(status: unknown): AnchorPayoutVerdict {
  if (typeof status !== "string") return "unknown";
  if (RESOLVED_STATUSES.has(status)) return "resolved";
  if (UNRESOLVED_STATUSES.has(status)) return "unresolved";
  return "unknown";
}

export interface KeeperEntry {
  hex: string;
  walletAddress: string;
  terminalObserved: boolean;
  /** "live" | "demo-failure" | "demo-refund". Only "live" is guarded by an anchor observation. */
  kind: string;
}

export interface KeeperDeps {
  listEntries(): KeeperEntry[];
  markTerminalObserved(hex: string): void;
  /** Must be idempotent (releasing a free slot is a no-op). */
  releaseSlot(walletAddress: string, hex: string): void;
  ledgerNow(): Promise<number>;
  /** null = could not be read this tick (transient) — never treated as terminal. */
  getRecord(hex: string): Promise<KeeperRecord | null>;
  /** True if a fully-verified payment for this protection exists on-chain. */
  hasFundingEvidence(hex: string, record: KeeperRecord): Promise<boolean>;
  /** The anchor's current status for a LIVE protection, observed now. null = no
   * usable credentials to observe with. Throws if the lookup fails (network, a
   * rejected or expired token, ...). */
  observeAnchorStatus(hex: string): Promise<string | null>;
  advanceToGrace(hex: string): Promise<string | undefined>;
  advanceToClaimable(hex: string): Promise<string | undefined>;
  expireUnfunded(hex: string): Promise<string | undefined>;
  log: { info(msg: string): void; warn(msg: string): void };
  expireBufferSeconds: number;
}

export interface KeeperTickResult {
  examined: number;
  released: number;
  advanced: number;
  expired: number;
  /** Live protections left in Grace by the anchor-observation guard. */
  held: number;
  errors: number;
}

const errMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createKeeper(deps: KeeperDeps) {
  const opts = { expireBufferSeconds: deps.expireBufferSeconds };
  // Consecutive failures per protection — only used to keep a persistent
  // failure (e.g. a relayer out of XLM) from logging a line every tick.
  const failures = new Map<string, number>();
  // Same idea for holds: log when the reason first appears or changes, then
  // only occasionally — a protection can sit in Grace for a long time.
  const holds = new Map<string, { reason: string; count: number }>();

  function hold(entry: KeeperEntry, reason: string, result: KeeperTickResult) {
    result.held++;
    const previous = holds.get(entry.hex);
    const count = previous && previous.reason === reason ? previous.count + 1 : 1;
    holds.set(entry.hex, { reason, count });
    if (count === 1 || count % 30 === 0) {
      deps.log.info(`[keeper] holding ${entry.hex} in Grace, not advancing to Claimable — ${reason}`);
    }
  }

  /** Live protections only: true iff a fresh anchor observation says the payout
   * is still unresolved. Every other outcome holds (and says why). */
  async function anchorPermitsClaimable(entry: KeeperEntry, result: KeeperTickResult): Promise<boolean> {
    let status: string | null;
    try {
      status = await deps.observeAnchorStatus(entry.hex);
    } catch (e) {
      hold(entry, `anchor lookup failed (${errMessage(e)}), so the payout cannot be confirmed unresolved`, result);
      return false;
    }
    if (status === null) {
      hold(entry, "no fresh anchor observation — no valid anchor credentials are held", result);
      return false;
    }
    const verdict = classifyAnchorStatus(status);
    if (verdict === "resolved") {
      hold(entry, `the anchor reports the payout as resolved (status "${status}")`, result);
      return false;
    }
    if (verdict === "unknown") {
      hold(entry, `the anchor status ${JSON.stringify(status)} is not one the keeper recognises`, result);
      return false;
    }
    deps.log.info(`[keeper] anchor observation for ${entry.hex}: status "${status}" — payout unresolved`);
    return true;
  }

  function release(entry: KeeperEntry, tag: string, result: KeeperTickResult) {
    holds.delete(entry.hex);
    deps.releaseSlot(entry.walletAddress, entry.hex);
    deps.markTerminalObserved(entry.hex);
    result.released++;
    deps.log.info(`[keeper] released wallet slot and dropped any held anchor credentials for ${entry.hex} (${tag})`);
  }

  async function act(
    entry: KeeperEntry,
    record: KeeperRecord,
    kind: "advance_to_grace" | "advance_to_claimable" | "expire_unfunded",
    ledgerNow: number,
    result: KeeperTickResult,
  ) {
    if (kind === "expire_unfunded") {
      // Fail safe: expire only when a payment is positively absent. If the
      // evidence check errors, or a matching payment exists, leave the
      // protection alone — FUNDED can still be attested (the contract accepts
      // it in AwaitingFunding regardless of the deadline).
      let hasEvidence: boolean;
      try {
        hasEvidence = await deps.hasFundingEvidence(entry.hex, record);
      } catch (e) {
        throw new Error(`funding check failed, not expiring: ${errMessage(e)}`);
      }
      if (hasEvidence) {
        deps.log.info(`[keeper] ${entry.hex} is past its funding deadline but a matching payment exists — leaving it to the FUNDED attestation`);
        return;
      }
    }

    if (kind === "advance_to_claimable" && entry.kind === "live") {
      if (!(await anchorPermitsClaimable(entry, result))) return;
    }

    try {
      const txHash =
        kind === "advance_to_grace"
          ? await deps.advanceToGrace(entry.hex)
          : kind === "advance_to_claimable"
            ? await deps.advanceToClaimable(entry.hex)
            : await deps.expireUnfunded(entry.hex);
      failures.delete(entry.hex);
      holds.delete(entry.hex);
      deps.log.info(`[keeper] ${kind} ok for ${entry.hex}${txHash ? ` (tx ${txHash})` : ""}`);
      if (kind === "expire_unfunded") {
        result.expired++;
        release(entry, "Expired", result);
      } else {
        result.advanced++;
      }
    } catch (e) {
      // A manual /developer control, or a slow earlier tick, may have applied
      // the same transition first — the contract then rejects this call.
      // Re-read: if the chain no longer wants this action it is a lost race,
      // not a failure.
      const fresh = await deps.getRecord(entry.hex).catch(() => null);
      if (fresh && decideKeeperAction(fresh, ledgerNow, opts).kind !== kind) {
        deps.log.info(`[keeper] ${kind} for ${entry.hex} was already applied (state is now ${fresh.state.tag})`);
        return;
      }
      throw e;
    }
  }

  async function tick(): Promise<KeeperTickResult> {
    const result: KeeperTickResult = { examined: 0, released: 0, advanced: 0, expired: 0, held: 0, errors: 0 };
    const entries = deps.listEntries().filter((e) => !e.terminalObserved);
    if (entries.length === 0) return result; // nothing to watch: no RPC traffic at all

    let ledgerNow: number;
    try {
      ledgerNow = await deps.ledgerNow();
    } catch (e) {
      deps.log.warn(`[keeper] ledger time unavailable, skipping tick: ${errMessage(e)}`);
      result.errors++;
      return result;
    }

    for (const entry of entries) {
      result.examined++;
      try {
        const record = await deps.getRecord(entry.hex);
        if (!record) continue; // unreadable this tick — retry next tick, never guess
        const action = decideKeeperAction(record, ledgerNow, opts);
        if (action.kind === "release_slot") release(entry, record.state.tag, result);
        else if (action.kind !== "wait") await act(entry, record, action.kind, ledgerNow, result);
      } catch (e) {
        result.errors++;
        const n = (failures.get(entry.hex) ?? 0) + 1;
        failures.set(entry.hex, n);
        if (n === 1 || n % 10 === 0) deps.log.warn(`[keeper] action failed for ${entry.hex} (attempt ${n}): ${errMessage(e)}`);
      }
    }
    return result;
  }

  return { tick };
}

export interface SlotReleaseDeps {
  trackedIds(walletAddress: string): string[];
  getRecord(hex: string): Promise<KeeperRecord | null>;
  releaseSlot(walletAddress: string, hex: string): void;
}

/** Frees the slots a wallet holds for protections that have already reached a
 * terminal state. Run before the per-wallet cap check so a User who just
 * claimed/settled/expired is never turned away by the very protection that
 * finished — without waiting for the next keeper tick. Idempotent, and an
 * unreadable record keeps its slot (fail closed). */
export async function releaseTerminalSlots(walletAddress: string, deps: SlotReleaseDeps): Promise<number> {
  let released = 0;
  for (const hex of deps.trackedIds(walletAddress)) {
    const record = await deps.getRecord(hex);
    if (record && isTerminalState(record.state.tag)) {
      deps.releaseSlot(walletAddress, hex);
      released++;
    }
  }
  return released;
}
