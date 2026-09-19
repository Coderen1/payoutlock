import CashOutApp from "../features/cashout/CashOutApp.tsx";

/** /app and /app/cash-out/:reference — the real Protected Cash Out. */
export default function CashOutRoute() {
  return <CashOutApp mode="live" />;
}
