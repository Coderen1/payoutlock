import CashOutApp from "../features/cashout/CashOutApp.tsx";

/** /app/demo and /app/demo/:reference — the demo scenarios, kept apart from the real flow. */
export default function DemoRoute() {
  return <CashOutApp mode="demo" />;
}
