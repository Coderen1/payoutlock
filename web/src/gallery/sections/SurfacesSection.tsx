import { useState } from "react";
import { GallerySection, Specimen } from "../GallerySection";
import { Amount } from "../../ui/Amount";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "../../ui/Card";
import { LIFECYCLE, LIFECYCLE_ORDER } from "../../ui/lifecycle";
import { Notice } from "../../ui/Notice";
import { SandboxRibbon } from "../../ui/SandboxRibbon";
import { StatusBadge } from "../../ui/StatusBadge";
import type { Tone } from "../../ui/tones";

const TONES: Tone[] = ["neutral", "sapphire", "seal", "emerald", "amber", "rose"];

export function SurfacesSection() {
  const [dismissed, setDismissed] = useState(false);
  return (
    <GallerySection id="surfaces" title="Cards, badges & notices" description="Color carries meaning. Seal marks protection, emerald a settled or verified outcome, amber something that needs attention. Rose is only for system errors — a claim or a refund is never an error.">
      <div className="grid gap-10 md:grid-cols-2">
        <Specimen label="Card">
          <Card>
            <CardHeader>
              <CardTitle>Send USDC</CardTitle>
              <CardDescription>You’ll approve one payment in your wallet.</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button>Send</Button>
              <Button variant="ghost">Cancel</Button>
            </CardFooter>
          </Card>
        </Specimen>
        <Specimen label="Sunken">
          <Card tone="sunken">
            <CardHeader>
              <CardTitle>Details</CardTitle>
              <CardDescription>Wells hold secondary information without competing with the card above them.</CardDescription>
            </CardHeader>
          </Card>
        </Specimen>
        <Specimen label="Protected" note="glow = protected value" className="md:col-span-2">
          <Card tone="protected">
            <div className="flex items-center justify-between gap-3">
              <StatusBadge status="active" />
              <span className="text-caption text-subtle">illustrative</span>
            </div>
            <p className="mt-4 text-caption text-muted-foreground">Protection</p>
            <Amount value="1" currency="USDC" size="xl" />
            <p className="mt-1 text-caption text-muted-foreground">covered by collateral locked on Stellar</p>
          </Card>
        </Specimen>
      </div>

      <Specimen label="Card on a night chapter" night>
        <div className="grid gap-5 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Verifiable on Stellar</CardTitle>
              <CardDescription>Every state change is a public record you can read yourself.</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button variant="secondary" size="sm">View contract</Button>
            </CardFooter>
          </Card>
          <Card tone="protected">
            <StatusBadge status="available" />
            <p className="mt-3 text-body text-muted-foreground">Your protection is ready to claim.</p>
          </Card>
        </div>
      </Specimen>

      <Specimen label="Status badges" note="the vocabulary a person sees — contract states never appear in the product">
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {LIFECYCLE_ORDER.map((status) => (
            <div key={status} className="flex items-start gap-3">
              <StatusBadge status={status} className="shrink-0" />
              <p className="pt-0.5 text-caption text-muted-foreground">{LIFECYCLE[status].description}</p>
            </div>
          ))}
        </div>
      </Specimen>

      <Specimen label="Badge tones">
        <div className="flex flex-wrap items-center gap-3">
          {TONES.map((tone) => (
            <Badge key={tone} tone={tone}>{tone}</Badge>
          ))}
          <Badge tone="seal" size="sm">small</Badge>
        </div>
      </Specimen>

      <Specimen label="Notices" note="errors are announced immediately (role=alert); the rest politely">
        <div className="grid gap-4">
          <Notice tone="info" title="Indicative rate">Based on the sandbox anchor’s current quote. The final amount is set by the bank payout.</Notice>
          <Notice tone="success" title="Funding verified">Your payment is confirmed on Stellar.</Notice>
          <Notice tone="warning" title="Taking longer than expected" action={<Button size="sm" variant="secondary">Details</Button>}>Your protection unlocks at 14:32.</Notice>
          <Notice tone="error" title="Couldn’t reach your wallet">Open your wallet extension and try again.</Notice>
          <Notice tone="neutral">Quotes refresh every 30 seconds.</Notice>
          <Notice tone="simulated" title="Simulated fiat outcome">This scenario simulates the bank payout. Everything on Stellar is real Testnet.</Notice>
          {!dismissed && <Notice tone="info" title="Dismissible" onDismiss={() => setDismissed(true)}>Dismiss me — the close target is 44 px.</Notice>}
          {dismissed && <Button size="sm" variant="ghost" onClick={() => setDismissed(false)}>Bring the notice back</Button>}
        </div>
      </Specimen>

      <Specimen label="Sandbox ribbon" note="permanent on /app/demo · sticky, not dismissible (shown static here)">
        <SandboxRibbon className="static rounded-card border" />
      </Specimen>
    </GallerySection>
  );
}
