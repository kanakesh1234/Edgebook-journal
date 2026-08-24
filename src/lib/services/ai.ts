import type { JournalEntry, JournalSettings } from "../types";
import type { JournalStats } from "../types";
import type { Violation } from "../rules";
import type { AdherenceSummary } from "../rules";
import type { DisciplineSummary } from "../discipline";
import type { EdgeBookContext } from "../minato/context";
import { respond, greet, type MinatoMessage } from "../minato/respond";

/* ------------------------------------------------------------------ */
/*  AiCoachProvider — the integration seam for MINATO                  */
/*                                                                      */
/*  Today: DeterministicMinatoProvider — every word derived from        */
/*  recorded EdgeBook data, zero fabrication, zero network calls.       */
/*  Tomorrow: swap in an LLM-backed provider (same interface); it       */
/*  receives this same structured EdgeBookContext. Chart/vision         */
/*  analysis gets its own capability flag — never faked.                */
/* ------------------------------------------------------------------ */

export interface CoachRequest {
  messages: MinatoMessage[];
  /** The trade currently under review, when the user opened MINATO from one. */
  focusEntry?: JournalEntry | null;
}

export interface CoachReply {
  text: string;
  /** Capability flags the UI may rely on. */
  meta: { deterministic: true; visionSupported: false };
}

export interface AiCoachProvider {
  readonly id: string;
  greeting(ctx: EdgeBookContext): string;
  reply(request: CoachRequest, ctx: EdgeBookContext): Promise<CoachReply>;
}

export class DeterministicMinatoProvider implements AiCoachProvider {
  readonly id = "minato-deterministic";

  greeting(ctx: EdgeBookContext): string {
    return greet(ctx);
  }

  async reply(request: CoachRequest, ctx: EdgeBookContext): Promise<CoachReply> {
    const last = [...request.messages].reverse().find((m) => m.role === "user");
    const text = last ? respond(ctx, last.text) : respond(ctx, "how am i doing");
    return { text, meta: { deterministic: true, visionSupported: false } };
  }
}

/** Single switch point — later phases swap this for an LLM provider. */
export function resolveCoachProvider(_settings?: JournalSettings): AiCoachProvider {
  return new DeterministicMinatoProvider();
}

/** Context type re-export for consumers. */
export type { EdgeBookContext, MinatoMessage, JournalStats, Violation, AdherenceSummary, DisciplineSummary };
