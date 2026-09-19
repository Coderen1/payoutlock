import { Placeholder } from "./Placeholder";

export default function MarketingRoute() {
  return (
    <Placeholder
      eyebrow="Protected Off-Ramp Infrastructure"
      title="Cash out with confidence."
      description="PayoutLock protects the last mile between Stellar and fiat with collateral-backed settlement protection. The public site is being built."
      links={[
        { to: "/app", label: "Protected Cash Out" },
        { to: "/app/demo", label: "Demo scenarios" },
        { to: "/developer", label: "Developer console" },
      ]}
    />
  );
}
