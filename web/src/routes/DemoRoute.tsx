import { useParams } from "react-router";
import { Placeholder } from "./Placeholder";

/** /app/demo and /app/demo/:reference — hackathon demo scenarios, kept apart from
 * the real product flow. Will always carry "Stellar Testnet · Simulated fiat outcome". */
export default function DemoRoute() {
  const { reference } = useParams();
  return (
    <Placeholder
      eyebrow="Stellar Testnet · Simulated fiat outcome"
      title="Demo scenarios"
      description="Successful payout, simulated payout failure and simulated principal return, on the same product UI. Coming soon."
      detail={reference ? `Reference · ${reference}` : undefined}
      links={[
        { to: "/app", label: "Protected Cash Out" },
        { to: "/", label: "PayoutLock" },
        { to: "/developer", label: "Developer console" },
      ]}
    />
  );
}
