export function stroopsToDecimal(stroops: bigint | string | number): string {
  const v = typeof stroops === "bigint" ? stroops : BigInt(stroops);
  const whole = v / 10_000_000n;
  const frac = (v % 10_000_000n).toString().padStart(7, "0");
  return `${whole}.${frac}`;
}

export function decimalToStroops(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  const fracPadded = (frac + "0000000").slice(0, 7);
  return BigInt(whole || "0") * 10_000_000n + BigInt(fracPadded || "0");
}

export const STATE_LABELS: Record<string, string> = {
  AwaitingFunding: "Awaiting Funding",
  Pending: "Protection Active",
  Grace: "Grace Period",
  Claimable: "Claimable",
  Settled: "Settled",
  Refunded: "Refunded",
  Claimed: "Claimed",
  Expired: "Expired (unfunded)",
};

export const TERMINAL_STATES = new Set(["Settled", "Refunded", "Claimed", "Expired"]);

export function isTerminalState(tag: string | undefined | null): boolean {
  return !!tag && TERMINAL_STATES.has(tag);
}

export function explorerTxUrl(hash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}

export function explorerAccountUrl(address: string): string {
  return `https://stellar.expert/explorer/testnet/account/${address}`;
}

export function explorerContractUrl(contractId: string): string {
  return `https://stellar.expert/explorer/testnet/contract/${contractId}`;
}

export function shorten(addr: string, len = 6): string {
  if (addr.length <= len * 2 + 3) return addr;
  return `${addr.slice(0, len)}...${addr.slice(-len)}`;
}
