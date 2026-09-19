// Proves TS <-> Rust canonical encoding compatibility BEFORE any real Anchor
// integration is attempted (implementation plan Phase 3, item 2). Uses the
// exact same fixed field values as contract/src/test.rs's
// `test_encoding_interop_fixture` and asserts the resulting XDR hex is
// byte-for-byte identical.
import { encodePayload } from "../sign.ts";

const RUST_FIXTURE_HEX =
  "0000001100000001000000080000000f00000006616d6f756e7400000000000a0000000000000000000000000012d6870000000f00000014616e63686f725f7769746864726177616c5f69640000000d0000000d666978747572652d77642d69640000000000000f00000005617373657400000000000012000000015045cd5ec0729a768fd5ad02505852df4f028dce830e5ac52209ba48483b2f010000000f00000009646f6d61696e5f69640000000000000d0000002022222222222222222222222222222222222222222222222222222222222222220000000f000000056e6f6e63650000000000000d0000002011111111111111111111111111111111111111111111111111111111111111110000000f0000000673746174757300000000001000000001000000010000000f0000000646756e64656400000000000f0000000974696d657374616d7000000000000005000000006553f1000000000f00000004757365720000001200000000000000003a51eeea754f644203b522142aad0ec6d5f028bd59b0cf671c54775727f585cd";

const payload = {
  anchorWithdrawalId: new TextEncoder().encode("fixture-wd-id"),
  user: "GA5FD3XKOVHWIQQDWURBIKVNB3DNL4BIXVM3BT3HDRKHOVZH6WC422VQ",
  amount: 1234567n,
  asset: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  status: "Funded" as const,
  timestamp: 1700000000n,
  nonce: new Uint8Array(32).fill(0x11),
  domainId: new Uint8Array(32).fill(0x22),
};

const tsBytes = encodePayload(payload);
const tsHex = tsBytes.toString("hex");

console.log("Rust hex:", RUST_FIXTURE_HEX);
console.log("TS   hex:", tsHex);

if (tsHex === RUST_FIXTURE_HEX) {
  console.log("MATCH: TS and Rust canonical encodings are byte-identical.");
  process.exit(0);
} else {
  console.error("MISMATCH: TS and Rust encodings differ. STOPPING per instructions.");
  console.error("Rust length:", RUST_FIXTURE_HEX.length / 2, "bytes");
  console.error("TS   length:", tsHex.length / 2, "bytes");
  process.exit(1);
}
