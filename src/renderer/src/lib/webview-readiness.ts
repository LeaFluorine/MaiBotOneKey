// A loaded HTML shell is not necessarily a rendered React application.
export const READ_MAIBOT_CONTENT_SCRIPT = `(() => {
  const root = document.getElementById("root");
  return Boolean(root && Array.from(root.children).some(element => {
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" &&
      element.getClientRects().length > 0;
  }));
})()`;

/** Bound even a hung guest IPC request; cancellation also discards late results. */
export function waitForWebviewContent(
  probe: () => Promise<boolean>,
  signal: AbortSignal,
  timeoutMs = 15_000,
  intervalMs = 250,
): Promise<boolean> {
  return new Promise((resolve) => {
    let finished = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (ready: boolean): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutTimer);
      clearTimeout(pollTimer);
      signal.removeEventListener("abort", abort);
      resolve(ready);
    };
    const abort = (): void => finish(false);
    const timeoutTimer = setTimeout(abort, timeoutMs);
    signal.addEventListener("abort", abort, { once: true });
    const poll = async (): Promise<void> => {
      let ready = false;
      try { ready = await probe(); } catch { /* Guest may be navigating. */ }
      if (finished) return;
      if (ready) finish(true);
      else pollTimer = setTimeout(() => void poll(), intervalMs);
    };
    if (signal.aborted) abort();
    else void poll();
  });
}
