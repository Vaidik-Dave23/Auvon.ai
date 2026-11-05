// Server-Sent Events over POST (fetch, because EventSource can't send a body or an
// Authorization header). Used for answers that should appear while the model writes.
//
//   const done = await postStream("/tutor/chat/stream", { json: payload, onEvent });
//
// onEvent gets every event ({type: "meta" | "delta" | ...}). Resolves with the "done"
// event. Rejects with an Error that has .status (HTTP errors, before streaming starts)
// or .partial = true (the stream broke after some text arrived).

import { refreshSession } from "./axios";

export async function postStream(path, { json, params, onEvent, signal } = {}) {
  const qs = params ? `?${new URLSearchParams(params)}` : "";
  const send = () => {
    const headers = { Authorization: `Bearer ${localStorage.getItem("token") || ""}` };
    if (json !== undefined) headers["Content-Type"] = "application/json";
    return fetch(`${import.meta.env.VITE_API_URL}${path}${qs}`, {
      method: "POST",
      headers,
      body: json !== undefined ? JSON.stringify(json) : undefined,
      signal,
    });
  };

  let res = await send();
  if (res.status === 401) {
    // access token expired: renew it once and try again
    try {
      await refreshSession();
      res = await send();
    } catch {
      /* fall through with the 401 */
    }
  }

  if (!res.ok || !res.body) {
    let detail = "";
    try {
      detail = (await res.json()).detail;
    } catch {
      /* not JSON */
    }
    const err = new Error(typeof detail === "string" && detail ? detail : `HTTP ${res.status}`);
    err.status = res.status;
    err.detail = typeof detail === "string" ? detail : "";
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let carry = "";
  let sawText = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    carry += decoder.decode(value, { stream: true });
    let cut;
    while ((cut = carry.indexOf("\n\n")) >= 0) {
      const block = carry.slice(0, cut);
      carry = carry.slice(cut + 2);
      const line = block.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const evt = JSON.parse(line.slice(5));
      if (evt.type === "delta") sawText = true;
      if (evt.type === "error") {
        const err = new Error(evt.detail || "Something went wrong");
        err.partial = sawText;
        throw err;
      }
      onEvent && onEvent(evt);
      if (evt.type === "done") return evt;
    }
  }
  const err = new Error("The connection closed before the answer was finished.");
  err.partial = sawText;
  throw err;
}

// Batch fast deltas into ~10 UI updates per second (markdown + KaTeX re-render is costly).
export function throttled(fn, ms = 90) {
  let timer = null;
  let latest;
  const run = () => {
    timer = null;
    fn(latest);
  };
  const call = (value) => {
    latest = value;
    if (!timer) timer = setTimeout(run, ms);
  };
  call.flush = () => {
    clearTimeout(timer);
    if (timer !== null || latest !== undefined) run();
  };
  call.cancel = () => clearTimeout(timer);
  return call;
}
