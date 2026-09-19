import { GallerySection, Specimen } from "../GallerySection";

export function TypographySection() {
  return (
    <GallerySection id="typography" title="Typography" description="One family, two weights on screen at a time. Negative tracking only on display sizes; headings balance their lines; figures are tabular.">
      <Specimen label="Hierarchy in use">
        <div className="max-w-[44rem]">
          <p className="font-mono text-mono uppercase tracking-[0.08em] text-subtle">Protected Off-Ramp Infrastructure</p>
          <h4 className="mt-3 text-display-l text-foreground">A settlement gap, closed with collateral.</h4>
          <p className="mt-5 text-lead text-muted-foreground">PayoutLock protects the last mile between Stellar and fiat. Your USDC is covered while the bank payout is processed.</p>
          <p className="mt-5 text-body text-foreground">Collateral is locked on Stellar before you send anything, and the protection clock only starts once your payment is verified on-chain. If the payout doesn’t arrive, you can claim.</p>
          <p className="mt-4 text-caption text-subtle">Stellar Testnet · sandbox anchor · no real funds</p>
        </div>
      </Specimen>

      <div className="grid gap-10 lg:grid-cols-2">
        <Specimen label="Tabular figures" note="digits line up in columns">
          <div className="grid gap-1 font-medium text-title tabular-nums">
            {["1,234.56", "0.50", "48.54", "111.11", "20,000.00"].map((v) => (
              <p key={v} className="text-right">{v}</p>
            ))}
          </div>
        </Specimen>
        <Specimen label="Turkish and extended Latin" note="latin-ext subset">
          <p className="text-display-m text-foreground">ğ Ğ ş Ş ı İ ö Ö ü Ü ç Ç</p>
          <p className="mt-3 text-body text-muted-foreground">Işık İstanbul’da göğe çıkar — the font carries the glyphs Turkish names need.</p>
        </Specimen>
      </div>
    </GallerySection>
  );
}
