/** Freighter is a desktop-browser extension: it can't run in a mobile browser. Used to show an honest
 * "open this on a desktop" state instead of a Connect button that can never work. */
export function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (typeof uaData?.mobile === "boolean") return uaData.mobile;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}
