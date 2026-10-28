/* Tiny command channel so toolbars can drive the chart without prop-drilling a ref. */

export type ChartCommand =
  | { type: "reset" }
  | { type: "range"; seconds: number | "all" | "ytd" }
  | { type: "goto"; time: number }
  | { type: "screenshot"; mode: "download" | "copy" }
  | { type: "scroll-latest" }
  | { type: "settings" };

type Listener = (cmd: ChartCommand) => void;
const listeners = new Set<Listener>();

export function emitChartCommand(cmd: ChartCommand) {
  for (const l of listeners) l(cmd);
}

export function onChartCommand(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
