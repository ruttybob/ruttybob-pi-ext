/**
 * types.ts — Общие типы и константы для evolver extension.
 */

import { Type } from "@sinclair/typebox";

// ---------------------------------------------------------------------------
// Evolve tool details
// ---------------------------------------------------------------------------

export interface EvolveDetails {
	exitCode: number;
	strategy: string;
	durationMs: number;
	aborted: boolean;
	timedOut: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STRATEGIES = ["balanced", "innovate", "harden", "repair-only"] as const;

export type Strategy = (typeof STRATEGIES)[number];

export const StrategyEnum = Type.Union(STRATEGIES.map((s) => Type.Literal(s)));

export const EVOLVER_MARKER = "<!-- evolver-evolution-memory -->";
