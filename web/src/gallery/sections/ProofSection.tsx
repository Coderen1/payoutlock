import { GallerySection, Specimen } from "../GallerySection";
import { Card } from "../../ui/Card";
import { HashChip } from "../../ui/HashChip";
import { ProofList } from "../../ui/ProofList";

// Obviously synthetic values: a repeating pattern, not anything that looks like a real transaction.
const SAMPLE = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const EXPLORER = "https://stellar.expert/explorer/testnet";

export function ProofSection() {
  return (
    <GallerySection id="proof" title="Proof & hashes" description="Verifiable receipts. A step with no record yet is shown as waiting — never with a made-up value. The values below are patterned samples, not real transactions.">
      <div className="grid gap-10 lg:grid-cols-2">
        <Specimen label="Hash chip" note="copy with confirmation · open on Stellar">
          <div className="grid justify-items-start gap-4">
            <HashChip value={SAMPLE} label="transaction hash" href={EXPLORER} />
            <HashChip value={SAMPLE} label="reference" />
            <HashChip value="GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" label="wallet address" href={EXPLORER} head={4} tail={4} />
          </div>
        </Specimen>
        <Specimen label="On a night chapter" night>
          <HashChip value={SAMPLE} label="transaction hash" href={EXPLORER} />
        </Specimen>
      </div>

      <Specimen label="Proof list" note="the last two steps have no record yet">
        <Card>
          <ProofList
            items={[
              { id: "open", label: "Protection opened", description: "Collateral locked", time: "14:02", hash: SAMPLE, href: EXPLORER },
              { id: "pay", label: "Payment received", description: "Your USDC reached the payout partner", time: "14:03", hash: SAMPLE, href: EXPLORER },
              { id: "fund", label: "Funding confirmed", time: "14:03", hash: SAMPLE, href: EXPLORER },
              { id: "payout", label: "Payout confirmed", description: "Waiting for the bank payout" },
              { id: "claim", label: "Protection claimed" },
            ]}
          />
        </Card>
      </Specimen>
    </GallerySection>
  );
}
