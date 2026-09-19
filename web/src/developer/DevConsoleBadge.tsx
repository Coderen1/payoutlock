import { Link } from "react-router";

/** Small fixed pill marking this page as the engineering console, with a way
 * back to the product site. Fixed-position and inline-styled on purpose: it
 * takes no space in the console's layout and depends on none of the
 * stylesheets, so the console renders exactly as it did before. */
export function DevConsoleBadge() {
  return (
    <div
      data-dev-shell
      style={{
        position: "fixed",
        right: 12,
        bottom: 12,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 12px",
        borderRadius: 999,
        background: "#0b1220",
        color: "#ffffff",
        font: "500 12px/1 system-ui, sans-serif",
        boxShadow: "0 2px 10px rgba(11, 18, 32, 0.25)",
      }}
    >
      <span>Engineering console · Stellar Testnet</span>
      <Link to="/" style={{ color: "#9aa4b5", textDecoration: "none" }}>
        ← PayoutLock
      </Link>
    </div>
  );
}
