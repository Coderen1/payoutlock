// Real records on Stellar Testnet, shown on the landing page so a reader can check the claim themselves.
// Nothing here is an example or a placeholder: each hash is a transaction that exists, and `npm run proof:verify`
// re-checks all of them against Horizon (that it succeeded, when it closed, that it called this contract with the
// expected function and protection). If Testnet is ever reset, that command fails — replace these with a fresh run
// of `attestor` scenarios, don't leave dead links.
//
// Kept free of `lib/` on purpose: the landing page must not pull in the Stellar SDK.

export const CONTRACT_ID = "CDLJDCOFCOZ7PPBO744NBOYWR5RYJ3UW2V5G2PULLY2FPUDFMYTFPLKF";

export interface ProofRecord {
  /** The protection's reference (`anchor_withdrawal_id`). Not shown; used by the verifier. */
  reference: string;
  /** USDC, decimal string. */
  amount: string;
  /** The transaction that recorded the outcome. */
  outcomeTx: string;
  /** Contract function that transaction called. */
  fn: "submit_attestation" | "claim";
  /** When the ledger holding that transaction closed (UTC). */
  recordedAt: string;
}

export const SETTLED_RECORD: ProofRecord = {
  reference: "sep_tpy34xakvjdfcnyv6ybp",
  amount: "1.00",
  outcomeTx: "968d4b6203209c7a08c42e38f0a66ffc8303e3b76311e97ff86f6f988820817a",
  fn: "submit_attestation",
  recordedAt: "2026-09-19T10:49:42Z",
};

export const CLAIMED_RECORD: ProofRecord = {
  reference: "demo_failure_00d769c98dc9",
  amount: "0.10",
  outcomeTx: "6a72062cb700739c8730341f4461d8b2c4b38ef9d404d9148e6be316d70ed221",
  fn: "claim",
  recordedAt: "2026-09-19T10:05:02Z",
};

const EXPLORER = "https://stellar.expert/explorer/testnet";
export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const explorerContract = (id: string) => `${EXPLORER}/contract/${id}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "19 Sep 2026" — spelled out here rather than by Intl, whose abbreviations differ between browsers. */
export function formatRecordedDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
