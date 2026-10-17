import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

// Executes the real component and its local helpers with deterministic React hooks.
// No server, browser, database, or external requests are involved.
export async function ownerControlHarness({ status = "draft", source } = {}) {
  const show = { id: "fixture", slug: "fixture", title: "Fixture night", venue: "Fixture venue", showDate: "2026-10-31",
    date: "Fixture date", startTime: "", endTime: "", hours: "", expectedWrap: "", status, isDefault: false };
  const calls = [], slots = [], effects = [], cleanups = [], timers = new Map(), cache = new Map();
  let cursor = 0, timerId = 0;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useMemo(fn) { return fn(); }, useId() { return "fixture"; },
    useEffect(fn) { const index = cursor++; if (!(index in slots)) { slots[index] = true; effects.push(fn); } },
    useLayoutEffect(fn) { fn(); },
  };
  const headers = { "X-Rad-Dad-Read-Scope": "owner", "X-Rad-Dad-Data-Source": "owner-database" };
  const reply = (returnedShow = show, options = {}) => Response.json({ show: returnedShow, songs: [],
    setWriteVersions: { "rad-dad": "initial:0", stalemate: "initial:0", "jeff-story-friends": "initial:0" } }, { headers, ...options });
  const net = { handle: async (url) => url === "/api/shows" ? Response.json({ shows: [show] })
    : url === "/api/suggestions" ? Response.json({ suggestions: [] }) : reply() };
  const window = { location: { search: "?show=fixture" }, confirm: () => true, addEventListener() {}, removeEventListener() {},
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); } };
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const loaded = { exports: {} }; cache.set(file, loaded);
    const input = file.endsWith("show-control.tsx") && source ? source : fs.readFileSync(file, "utf8");
    const code = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const require = name => {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (name === "next/link" || name.endsWith(".css") || ["./set-coach", "./acoustic-slot-helper"].includes(name)) return () => null;
      const base = path.resolve(path.dirname(file), name);
      const resolved = [base, `${base}.ts`, `${base}.tsx`].find(candidate => fs.existsSync(candidate));
      if (!resolved) throw new Error(`Unexpected fixture import: ${name}`);
      return load(resolved);
    };
    vm.runInNewContext(code, { module: loaded, exports: loaded.exports, require, window, URLSearchParams, AbortController,
      setTimeout: window.setTimeout, clearTimeout: window.clearTimeout,
      fetch: async (url, options = {}) => { calls.push({ url, ...options }); return net.handle(url, options); },
    }, { filename: file });
    return loaded.exports;
  }
  const Component = load(path.resolve("app/show-control/show-control.tsx")).default;
  const render = () => { cursor = 0; return Component({ userName: "Fixture owner", userEmail: "owner@example.test", signOutHref: "/signout" }); };
  render(); effects.splice(0).forEach(fn => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); });
  await new Promise(resolve => setImmediate(resolve));
  const nodes = node => !node || typeof node !== "object" ? [] : Array.isArray(node)
    ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
  const text = node => node == null || typeof node === "boolean" ? "" : typeof node !== "object" ? String(node)
    : Array.isArray(node) ? node.map(text).join(" ") : text(node.props?.children);
  const find = predicate => nodes(render()).find(predicate);
  const button = label => find(node => node.type === "button" && text(node) === label);
  const click = label => {
    const target = button(label);
    if (!target || target.props.disabled) throw new Error(`No enabled button: ${label}`);
    target.props.onClick();
  };
  const settle = () => new Promise(resolve => setImmediate(resolve));
  return { show, net, calls, render, nodes, text, find, button, click, reply, settle,
    expire: () => { for (const [id, fn] of timers) { timers.delete(id); fn(); } },
    unmount: () => cleanups.forEach(fn => fn()),
  };
}
