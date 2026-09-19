import { signPayload } from "../sign.ts";
import { attestorPublicKeyHex } from "../sign.ts";

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

const { encodedBytes, signature } = signPayload(payload);
console.log("attestor_pubkey_hex:", attestorPublicKeyHex());
console.log("encoded_bytes_hex:", encodedBytes.toString("hex"));
console.log("signature_hex:", Buffer.from(signature).toString("hex"));
