/**
 * Shravelle for React Native.
 *
 *   import Shravelle from "@shravelle/react-native";
 *   Shravelle.init({ endpoint: "https://ingest.example.com", key: "shv_brw_...", app: "shop-rn", release: "2.1.0" });
 *   // React Navigation: <NavigationContainer onStateChange={Shravelle.navigationStateChange}>
 *
 * Captures fatal and non-fatal JS errors (global handler), unhandled promise
 * rejections, fetch/XHR network calls with traceparent propagation, screen
 * views, sessions and custom events. The queue is persisted in AsyncStorage
 * so events survive app restarts and offline periods.
 */
import { AppState, Platform } from "react-native";

let AsyncStorage = null;
try { AsyncStorage = require("@react-native-async-storage/async-storage").default; } catch (e) { /* optional */ }

const KEY = "@shravelle/queue";
const cfg = { endpoint: "", key: "", app: "react-native", release: "", flushInterval: 15000, tracePropagationTargets: [] };
let queue = [], userId = "", sessionId = rid(16), started = false, sending = false, lastActive = Date.now();

function rid(n) { let s = ""; for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 256).toString(16).padStart(2, "0"); return s; }
function attrs(extra) { return { platform: "react-native", "os.name": Platform.OS, "os.version": String(Platform.Version), ...(extra || {}) }; }
function persist() { if (AsyncStorage) AsyncStorage.setItem(KEY, JSON.stringify(queue.slice(-2000))).catch(() => {}); }
function push(ev) {
  if (!started) return;
  queue.push({ timestamp: new Date().toISOString(), session_id: sessionId, user_id: userId, app: cfg.app, release: cfg.release, ...ev, attributes: attrs(ev.attributes) });
  if (queue.length > 2000) queue.splice(0, queue.length - 2000);
  persist();
}

const origFetch = global.fetch;
async function flush() {
  if (sending || !queue.length) return;
  sending = true;
  const batch = queue.slice(0, 200);
  try {
    const r = await origFetch(cfg.endpoint.replace(/\/$/, "") + "/v1/rum?key=" + encodeURIComponent(cfg.key), {
      method: "POST", headers: { "Content-Type": "application/json", "User-Agent": `Shravelle-ReactNative/1.0 (${Platform.OS} ${Platform.Version}; Mobile)` },
      body: JSON.stringify({ app: cfg.app, session_id: sessionId, user_id: userId, release: cfg.release, events: batch }),
    });
    if (r.ok || r.status === 400 || r.status === 401) { queue.splice(0, batch.length); persist(); }
  } catch (e) { /* offline: keep queued */ }
  sending = false;
}

function shouldTrace(url) {
  const host = (url.match(/^https?:\/\/([^/:]+)/) || [])[1] || "";
  return cfg.tracePropagationTargets.some((t) => (t instanceof RegExp ? t.test(url) : host === t || host.endsWith("." + t)));
}
const name = (m, u) => m + " " + String(u).split("?")[0].replace(/^https?:\/\//, "").replace(/\/\d+(?=\/|$)/g, "/:id");

function patchNetwork() {
  global.fetch = (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.indexOf(cfg.endpoint) === 0) return origFetch(input, init);
    const method = (init.method || "GET").toUpperCase(), start = Date.now();
    let traceId = "";
    if (shouldTrace(url)) { traceId = rid(16); init = { ...init, headers: { ...(init.headers || {}), traceparent: `00-${traceId}-${rid(8)}-01` } }; }
    return origFetch(input, init).then((r) => { push({ type: "ajax", name: name(method, url), status: r.status, duration_ms: Date.now() - start, trace_id: traceId }); return r; },
      (e) => { push({ type: "ajax", name: name(method, url), status: 0, duration_ms: Date.now() - start, message: String(e), trace_id: traceId }); throw e; });
  };
}

const Shravelle = {
  async init(opts) {
    if (started) return;
    Object.assign(cfg, opts);
    started = true;
    if (AsyncStorage) { try { const saved = JSON.parse((await AsyncStorage.getItem(KEY)) || "[]"); queue = saved.concat(queue); } catch (e) {} }
    const prev = global.ErrorUtils && global.ErrorUtils.getGlobalHandler();
    if (global.ErrorUtils) {
      global.ErrorUtils.setGlobalHandler((err, isFatal) => {
        push({ type: isFatal ? "crash" : "handled_exception", name: (err && err.name) || "Error", message: (err && err.message) || String(err), stack: (err && err.stack) || "" });
        persist();
        if (prev) prev(err, isFatal);
      });
    }
    const tracking = global.HermesInternal && global.HermesInternal.enablePromiseRejectionTracker;
    if (tracking) tracking({ allRejections: true, onUnhandled: (id, e = {}) => push({ type: "handled_exception", name: e.name || "UnhandledRejection", message: e.message || String(e), stack: e.stack || "" }) });
    patchNetwork();
    push({ type: "app_start", name: "js_start", value: global.performance && performance.now ? performance.now() : 0 });
    AppState.addEventListener("change", (s) => {
      if (s === "active") { if (Date.now() - lastActive > 30 * 60 * 1000) sessionId = rid(16); lastActive = Date.now(); }
      else flush();
    });
    setInterval(flush, cfg.flushInterval);
  },
  setUser(id) { userId = String(id || ""); },
  screen(screenName) { push({ type: "page_view", name: "screen", route: screenName, page_url: "app://" + screenName }); },
  track(eventName, attributes = {}, value = 0) { push({ type: "custom", name: eventName, attributes, value }); },
  recordError(err, attributes = {}) { push({ type: "handled_exception", name: (err && err.name) || "Error", message: (err && err.message) || String(err), stack: (err && err.stack) || "", attributes }); },
  /** React Navigation: <NavigationContainer onStateChange={Shravelle.navigationStateChange}> */
  navigationStateChange(state) {
    let s = state; while (s && s.routes && s.index != null && s.routes[s.index].state) s = s.routes[s.index].state;
    if (s && s.routes) Shravelle.screen(s.routes[s.index].name);
  },
  flush,
};
export default Shravelle;
