import { useEffect, useState } from "react";
import { useAppSession } from "../hooks/useAppSession";
import { shorten } from "../lib/format";

export function ConnectBar() {
  const { session, connect, disconnect, checkNetwork } = useAppSession();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [networkWarning, setNetworkWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!session.address) return;
    let cancelled = false;
    const check = () => checkNetwork().then((w) => !cancelled && setNetworkWarning(w)).catch(() => {});
    check();
    const id = window.setInterval(check, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [session.address, checkNetwork]);

  const onConnect = async () => {
    setError(null);
    setConnecting(true);
    try {
      await connect();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="connect-bar">
      {session.address ? (
        <>
          <span className="pill">{shorten(session.address)}</span>
          <button onClick={disconnect}>Disconnect</button>
        </>
      ) : (
        <button onClick={onConnect} disabled={connecting}>
          {connecting ? "Connecting…" : "Connect Wallet"}
        </button>
      )}
      {error && <div className="error-banner">{error}</div>}
      {networkWarning && <div className="error-banner">⚠ {networkWarning}</div>}
    </div>
  );
}
