import { useState } from "react";
import { ArrowRight, ShieldCheck, Wallet } from "lucide-react";
import { GallerySection, Specimen } from "../GallerySection";
import { AmountInput } from "../../ui/AmountInput";
import { Button } from "../../ui/Button";
import { Field, Input } from "../../ui/Input";

const VARIANTS = ["primary", "secondary", "ghost", "seal"] as const;
const SIZES = ["sm", "md", "lg"] as const;

export function ControlsSection() {
  const [run, setRun] = useState<"idle" | "loading" | "success">("idle");
  const [amount, setAmount] = useState("1");
  const [text, setText] = useState("");

  const startRun = () => {
    setRun("loading");
    window.setTimeout(() => setRun("success"), 1400);
    window.setTimeout(() => setRun("idle"), 3000);
  };

  return (
    <GallerySection id="controls" title="Buttons & inputs" description="Every control is at least 44 px tall (the small size is for dense desktop use only), shows a clear focus ring, and never changes width when it loads.">
      <Specimen label="Buttons" note="variant × size">
        <div className="grid gap-6">
          {VARIANTS.map((variant) => (
            <div key={variant} className="flex flex-wrap items-center gap-4">
              <span className="w-24 font-mono text-mono text-subtle">{variant}</span>
              {SIZES.map((size) => (
                <Button key={size} variant={variant} size={size}>
                  {variant === "seal" ? "Claim Protection" : "Continue"}
                </Button>
              ))}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-4">
            <span className="w-24 font-mono text-mono text-subtle">with icons</span>
            <Button leading={<Wallet aria-hidden className="size-4" />}>Connect wallet</Button>
            <Button variant="secondary" trailing={<ArrowRight aria-hidden className="size-4" />}>Review</Button>
            <Button variant="seal" leading={<ShieldCheck aria-hidden className="size-4" />}>Claim Protection</Button>
            <Button variant="secondary" size="icon" aria-label="Connect wallet"><Wallet aria-hidden className="size-5" /></Button>
            <Button asChild variant="secondary"><a href="#tokens">As a link</a></Button>
          </div>
        </div>
      </Specimen>

      <Specimen label="States" note="click Run — the width does not move">
        <div className="flex flex-wrap items-center gap-4">
          <Button disabled>Disabled</Button>
          <Button status="loading">Sending</Button>
          <Button status="success" variant="secondary">Done</Button>
          <Button status={run} onClick={startRun} className="min-w-40">
            {run === "success" ? "Sent" : "Run"}
          </Button>
        </div>
        <p className="mt-4 text-caption text-subtle">Hover, press (scales to 98%) and keyboard focus are live — Tab to any button.</p>
      </Specimen>

      <Specimen label="Buttons on a night chapter" night note="semantic tokens flip; no dark variants">
        <div className="flex flex-wrap items-center gap-4">
          <Button>Launch Protected Cash Out</Button>
          <Button variant="secondary">Open developer console</Button>
          <Button variant="ghost">Learn how it works</Button>
        </div>
      </Specimen>

      <div className="grid gap-10 lg:grid-cols-2">
        <Specimen label="Text input">
          <div className="grid gap-5">
            <Field label="Email" hint="We’ll only use it for this cash out.">
              {(f) => <Input {...f} type="email" placeholder="you@example.com" value={text} onChange={(e) => setText(e.target.value)} />}
            </Field>
            <Field label="Reference" error="That reference wasn’t found.">
              {(f) => <Input {...f} defaultValue="abc-123" />}
            </Field>
            <Field label="Wallet (read only)">{(f) => <Input {...f} readOnly value="GBBD47IF6LWK…H3ZLLFLA5" />}</Field>
            <Field label="Disabled">{(f) => <Input {...f} disabled placeholder="Not available" />}</Field>
          </div>
        </Specimen>
        <Specimen label="Amount input" note="digits and one decimal point only">
          <div className="grid gap-5">
            <Field label="You send" hint="Balance 2.03 USDC (illustrative)">
              {(f) => <AmountInput {...f} value={amount} onValueChange={setAmount} currency="USDC" />}
            </Field>
            <Field label="Over the limit" error="The most you can protect right now is 2 USDC.">
              {(f) => <AmountInput {...f} value="5" onValueChange={() => {}} currency="USDC" />}
            </Field>
            <AmountInput value="1" onValueChange={() => {}} currency="USDC" disabled aria-label="Disabled amount" />
          </div>
        </Specimen>
      </div>
    </GallerySection>
  );
}
