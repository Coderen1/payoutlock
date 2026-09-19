import { readFileSync } from "node:fs";
import { contract, xdr } from "@stellar/stellar-sdk";
import { config } from "./config.ts";

const { Spec } = contract;
type Spec = InstanceType<typeof contract.Spec>;

let cached: Spec | undefined;

/**
 * Loads the contract's ScSpecEntry set directly from the built wasm file.
 * This is the authoritative source for the AttestationPayload field layout
 * (including the sorted-by-name order the Rust `#[contracttype]` derive
 * macro uses) — we never hand-replicate that ordering rule ourselves.
 */
export function loadSpec(): Spec {
  if (!cached) {
    const wasm = readFileSync(config.contractWasmPath);
    cached = Spec.fromWasm(wasm);
  }
  return cached;
}

export function attestationPayloadType(): xdr.ScSpecTypeDef {
  return xdr.ScSpecTypeDef.scSpecTypeUdt(
    new xdr.ScSpecTypeUdt({ name: "AttestationPayload" }),
  );
}
