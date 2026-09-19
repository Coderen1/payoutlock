// Re-checks the real Testnet records shown on the landing page (src/features/landing/proof.ts) against Horizon:
// each transaction exists and succeeded, closed when we say it did, and called the expected function of OUR
// contract on the expected protection. Run it after a Testnet reset, or before showing the page to anyone.
//   npm run proof:verify        (needs network; read-only, no keys, no funds)
import { Address, scValToNative, xdr } from "@stellar/stellar-sdk";
import { CLAIMED_RECORD, CONTRACT_ID, SETTLED_RECORD, explorerContract, explorerTx } from "../../src/features/landing/proof.ts";

const HORIZON = "https://horizon-testnet.stellar.org";
let failed = 0;
const check = (ok, msg, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}${!ok && extra ? "  — " + extra : ""}`);
};
const get = async (path) => {
  const res = await fetch(HORIZON + path);
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
};
const decode = (b64) => scValToNative(xdr.ScVal.fromXDR(b64, "base64"));
const text = (v) => (v && v.type === "Buffer" ? Buffer.from(v.data).toString("utf8") : v instanceof Uint8Array ? Buffer.from(v).toString("utf8") : String(v));

console.log("landing page proof — checked against", HORIZON);
check(/^C[A-Z2-7]{55}$/.test(CONTRACT_ID), `contract id is well-formed  ${CONTRACT_ID}`);
console.log(`      contract link: ${explorerContract(CONTRACT_ID)}`);

for (const [name, record] of [["Settled", SETTLED_RECORD], ["Claimed", CLAIMED_RECORD]]) {
  console.log(`\n${name}: ${record.reference}  (${record.amount} USDC)`);
  console.log(`      link: ${explorerTx(record.outcomeTx)}`);
  const tx = await get(`/transactions/${record.outcomeTx}`);
  check(tx.ok, "the transaction exists on Testnet", `HTTP ${tx.status}`);
  if (!tx.ok) continue;
  check(tx.body.successful === true, "it succeeded");
  check(tx.body.created_at === record.recordedAt, `its ledger closed at ${record.recordedAt}`, `Horizon says ${tx.body.created_at}`);
  const ops = (await get(`/transactions/${record.outcomeTx}/operations`)).body._embedded?.records ?? [];
  const invoke = ops.find((o) => o.type === "invoke_host_function");
  check(!!invoke, "it invokes a contract function");
  if (!invoke) continue;
  const [contract, fn, arg] = (invoke.parameters ?? []).map((p) => decode(p.value));
  check(Address.fromScVal(xdr.ScVal.fromXDR(invoke.parameters[0].value, "base64")).toString() === CONTRACT_ID, "on the PayoutLock protection contract");
  check(fn === record.fn, `calling ${record.fn}`, `got ${fn}`);
  void contract;
  if (record.fn === "claim") {
    check(text(arg) === record.reference, `for protection ${record.reference}`, `got ${text(arg)}`);
  } else {
    const payload = arg;
    check(text(payload.anchor_withdrawal_id) === record.reference, `for protection ${record.reference}`, `got ${text(payload.anchor_withdrawal_id)}`);
    check(Array.isArray(payload.status) && payload.status[0] === "Settled", "attesting the payout Settled", JSON.stringify(payload.status));
    check(BigInt(payload.amount) === BigInt(Math.round(Number(record.amount) * 1e7)), `for ${record.amount} USDC`, String(payload.amount));
  }
}
console.log(failed ? `\n${failed} CHECK(S) FAILED — the landing page's proof records need replacing` : "\nALL PROOF RECORDS VERIFIED");
process.exit(failed ? 1 : 0);
