import { useState } from "react";
import { GallerySection, Specimen } from "../GallerySection";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Notice } from "../../ui/Notice";
import { Skeleton, SkeletonText } from "../../ui/Skeleton";
import { Spinner } from "../../ui/Spinner";
import { StateMessage } from "../../ui/StateMessage";
import { StatusMark } from "../../ui/StatusMark";
import { SummaryList, SummaryRow } from "../../ui/SummaryList";

export function StatesSection() {
  const [replay, setReplay] = useState(0);
  return (
    <GallerySection id="states" title="Loading, error & success" description="Polling is silent — data stays on screen while it refreshes. Loading holds the layout with skeletons; success and error draw themselves in (and simply appear with reduced motion).">
      <div className="grid gap-10 lg:grid-cols-2">
        <Specimen label="Skeleton" note="holds the layout; announce what is loading">
          <Card>
            <div role="status" aria-label="Loading quote">
              <SummaryList>
                <SummaryRow label="You send" loading>{null}</SummaryRow>
                <SummaryRow label="You receive" loading>{null}</SummaryRow>
                <SummaryRow label="Protection" loading emphasis="protected">{null}</SummaryRow>
              </SummaryList>
            </div>
            <SkeletonText lines={3} className="mt-6" />
            <Skeleton className="mt-6 h-11 w-full rounded-full" />
          </Card>
        </Specimen>
        <Specimen label="Spinner" note="indeterminate">
          <div className="flex flex-wrap items-center gap-8 text-sapphire-600">
            <Spinner className="size-4" />
            <Spinner />
            <Spinner className="size-8" />
            <Spinner className="size-12" label="Loading" />
          </div>
          <div className="mt-8 grid gap-3">
            <Notice tone="info" title="Confirming on Stellar">This usually takes under a minute. You can leave this page open.</Notice>
          </div>
        </Specimen>
      </div>

      <Specimen label="Status marks" note="loading · success · error · protected">
        <div className="flex flex-wrap items-center gap-10" key={replay}>
          <StatusMark state="loading" size={64} />
          <StatusMark state="success" size={64} />
          <StatusMark state="error" size={64} />
          <StatusMark state="protected" size={64} />
          <Button variant="secondary" size="sm" onClick={() => setReplay((n) => n + 1)}>Replay</Button>
        </div>
      </Specimen>

      <div className="grid gap-10 lg:grid-cols-2">
        <Specimen label="Whole-panel states">
          <div className="grid gap-10">
            <StateMessage state="loading" title="Confirming your payment" description="Waiting for the payment to land on Stellar." />
            <StateMessage state="success" title="Settled" description="Your bank payout completed." />
          </div>
        </Specimen>
        <Specimen label="Whole-panel states">
          <div className="grid gap-10">
            <StateMessage state="protected" title="Protection active" description="Your USDC is covered while the bank payout is processed." />
            <StateMessage state="error" title="We couldn’t reach your wallet" description="Open your wallet extension and try again." action={<Button variant="secondary" size="sm">Try again</Button>} />
          </div>
        </Specimen>
      </div>
    </GallerySection>
  );
}
