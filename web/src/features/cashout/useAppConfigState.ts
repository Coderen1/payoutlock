import { useEffect, useState } from "react";
import { getAppConfig, type AppConfig } from "../../lib/apiConfig";

/** The backend's public runtime config (contract, anchor, caps), loaded once. */
export function useAppConfigState(): { config: AppConfig | null; error: string | null } {
  const [state, setState] = useState<{ config: AppConfig | null; error: string | null }>({ config: null, error: null });
  useEffect(() => {
    let alive = true;
    getAppConfig()
      .then((config) => alive && setState({ config, error: null }))
      .catch((e) => alive && setState({ config: null, error: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
