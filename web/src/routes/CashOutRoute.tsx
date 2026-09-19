import { useParams } from "react-router";
import { Placeholder } from "./Placeholder";

/** /app and /app/cash-out/:reference — the real Protected Cash Out product. */
export default function CashOutRoute() {
  const { reference } = useParams();
  return (
    <Placeholder
      eyebrow={reference ? "Tracking a cash-out" : "Protected Cash Out"}
      title="Protected Cash Out"
      description="The Protected Cash Out experience is being built."
      detail={reference ? `Reference · ${reference}` : undefined}
      links={[
        { to: "/", label: "PayoutLock" },
        { to: "/app/demo", label: "Demo scenarios" },
        { to: "/developer", label: "Developer console" },
      ]}
    />
  );
}
