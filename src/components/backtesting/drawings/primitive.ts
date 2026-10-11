/* ------------------------------------------------------------------ */
/*  DrawingsPrimitive — a lightweight-charts series primitive that      */
/*  paints every drawing on the chart's own canvas, so it pans, zooms   */
/*  and rescales in lock-step with the candles (no overlay to sync).    */
/* ------------------------------------------------------------------ */

import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  ISeriesPrimitiveAxisView,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";
import type { DrawingObject } from "@/lib/backtesting/types";
import type { Rect } from "@/lib/backtesting/drawings/geometry";
import { axisPrices, fmtPrice, paintDrawing, type RenderEnv } from "./render";
import type { Projector } from "./projector";

/** The slice of fancy-canvas' render target we use (avoids a direct dependency on it). */
interface MediaTarget {
  useMediaCoordinateSpace<T>(
    f: (scope: { context: CanvasRenderingContext2D; mediaSize: { width: number; height: number } }) => T,
  ): T;
}

export interface PrimitiveOptions {
  getProjector: () => Projector | null;
  getTick: () => number;
  getPointValue: () => number;
  isDark: () => boolean;
}

export class DrawingsPrimitive implements ISeriesPrimitive<Time> {
  private param: SeriesAttachedParameter<Time> | null = null;
  drawings: DrawingObject[] = [];
  preview: DrawingObject | null = null;
  selectedId: string | null = null;
  hoverId: string | null = null;
  hidden = false;
  zoomBox: Rect | null = null;

  constructor(private opts: PrimitiveOptions) {}

  attached(param: SeriesAttachedParameter<Time>) { this.param = param; }
  detached() { this.param = null; }

  /** Push new state and repaint. */
  set(state: Partial<Pick<DrawingsPrimitive, "drawings" | "preview" | "selectedId" | "hoverId" | "hidden" | "zoomBox">>) {
    Object.assign(this, state);
    this.param?.requestUpdate();
  }
  repaint() { this.param?.requestUpdate(); }

  private env(w: number, h: number): RenderEnv | null {
    const proj = this.opts.getProjector();
    if (!proj) return null;
    return { proj, w, h, tick: this.opts.getTick(), pointValue: this.opts.getPointValue(), dark: this.opts.isDark() };
  }

  private view: IPrimitivePaneView = {
    zOrder: (): PrimitivePaneViewZOrder => "top",
    renderer: (): IPrimitivePaneRenderer => ({
      draw: (target) => {
        (target as unknown as MediaTarget).useMediaCoordinateSpace(({ context, mediaSize }) => {
          const env = this.env(mediaSize.width, mediaSize.height);
          if (!env) return;
          if (!this.hidden) {
            for (const d of this.drawings) {
              if (d.hidden) continue;
              paintDrawing(context, d, env, { selected: d.id === this.selectedId, hovered: d.id === this.hoverId });
            }
          }
          if (this.preview) paintDrawing(context, this.preview, env, { selected: true, hovered: false });
          if (this.zoomBox) {
            const z = this.zoomBox;
            context.save();
            context.fillStyle = "rgba(41,98,255,0.15)";
            context.strokeStyle = "#2962FF";
            context.lineWidth = 1;
            context.fillRect(z.x, z.y, z.w, z.h);
            context.strokeRect(z.x, z.y, z.w, z.h);
            context.restore();
          }
        });
      },
    }),
  };

  paneViews() { return [this.view]; }

  priceAxisViews(): readonly ISeriesPrimitiveAxisView[] {
    if (this.hidden || !this.param) return [];
    const series = this.param.series;
    const out: ISeriesPrimitiveAxisView[] = [];
    const all = this.preview ? [...this.drawings, this.preview] : this.drawings;
    for (const d of all) {
      if (d.hidden) continue;
      for (const price of axisPrices(d)) {
        out.push({
          coordinate: () => series.priceToCoordinate(price) ?? -1000,
          text: () => fmtPrice(price),
          textColor: () => "#ffffff",
          backColor: () => d.color,
          visible: () => series.priceToCoordinate(price) !== null,
        });
      }
    }
    return out;
  }
}
