import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { GallerySection, Specimen } from "../GallerySection";
import { Amount } from "../../ui/Amount";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { SummaryList, SummaryRow } from "../../ui/SummaryList";
import { WalletChip } from "../../ui/WalletChip";
import { AnimatedNumber } from "../../ui/motion/AnimatedNumber";

const SAMPLE_ADDRESS = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"; // the public USDC issuer id, used only as a stand-in address
const QUOTES = [48.54, 48.61, 48.49, 48.72];

export function WalletAmountSection() {
  const [connected, setConnected] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState(0);

  const connect = () => {
    setConnecting(true);
    window.setTimeout(() => {
      setConnecting(false);
      setConnected(true);
    }, 1400);
  };
  const refresh = () => {
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      setQ((n) => (n + 1) % QUOTES.length);
    }, 900);
  };

  return (
    <GallerySection id="wallet-amount" title="Wallet chip & amounts" description="Presentation only — connecting a wallet is the product flow's job. The menu portals into the design-system root, so it gets the same fonts and tokens.">
      <div className="grid gap-10 lg:grid-cols-3">
        <Specimen label="Not connected">
          <WalletChip onConnect={() => {}} />
        </Specimen>
        <Specimen label="Connecting">
          <WalletChip connecting />
        </Specimen>
        <Specimen label="Connected" note="open the menu">
          <WalletChip address={SAMPLE_ADDRESS} explorerUrl="https://stellar.expert/explorer/testnet" onDisconnect={() => setConnected(false)} />
        </Specimen>
      </div>

      <Specimen label="Live: connect → connected → disconnect" note="uses the same component">
        <WalletChip address={connected ? SAMPLE_ADDRESS : null} connecting={connecting} onConnect={connect} onDisconnect={() => setConnected(false)} explorerUrl="https://stellar.expert/explorer/testnet" />
      </Specimen>

      <Specimen label="Amount" note="strings in, never rounded · fraction dimmed · currency small">
        <div className="grid gap-6">
          <div className="flex flex-wrap items-baseline gap-x-10 gap-y-4">
            <Amount value="1234.5" currency="USDC" size="display" />
            <Amount value="48.54" currency="TRY" size="xl" approx />
          </div>
          <div className="flex flex-wrap items-baseline gap-x-10 gap-y-3">
            <Amount value="1" currency="USDC" size="lg" />
            <Amount value="0.5" currency="USDC" size="md" />
            <Amount value="20000" currency="USDC" size="sm" />
            <Amount value="1.2345678" decimals={2} currency="USDC" size="sm" />
          </div>
          <p className="text-caption text-subtle">The last value shows all seven digits it was given — padding never truncates.</p>
        </div>
      </Specimen>

      <div className="grid gap-10 lg:grid-cols-2">
        <Specimen label="Quote summary" note="illustrative values · loading holds the layout">
          <Card>
            <SummaryList>
              <SummaryRow label="You send"><Amount value="1" currency="USDC" size="md" /></SummaryRow>
              <SummaryRow label="You receive" loading={loading} hint="Indicative · sandbox rate">
                <Amount value={QUOTES[q].toFixed(2)} currency="TRY" size="md" approx />
              </SummaryRow>
              <SummaryRow label="Protection" emphasis="protected"><Amount value="1" currency="USDC" size="md" /></SummaryRow>
            </SummaryList>
            <Button variant="secondary" size="sm" className="mt-5" onClick={refresh} leading={<RefreshCw aria-hidden className="size-4" />}>Refresh quote</Button>
          </Card>
        </Specimen>
        <Specimen label="Animated number" note="eases when the value changes · display only">
          <p className="text-display-m text-foreground"><AnimatedNumber value={QUOTES[q]} /> <span className="text-title text-subtle">TRY</span></p>
          <p className="mt-2 text-caption text-subtle">Press “Refresh quote” on the left. With reduced motion it snaps instead.</p>
        </Specimen>
      </div>
    </GallerySection>
  );
}
