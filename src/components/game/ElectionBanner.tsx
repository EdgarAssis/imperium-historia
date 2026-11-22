// src/components/game/ElectionBanner.tsx
// Bloco A2 — Banner que alerta quando eleições se aproximam.
// Não bloqueia o tempo; aparece como barra amarela no topo do GameScreen.

"use client";

import { useGameStore } from "@/lib/state";
import { electionApproaching, turnsUntilElection } from "@/lib/engine";
import { Vote } from "lucide-react";

export function ElectionBanner() {
  const state = useGameStore((s) => s.state);
  if (!state) return null;
  if (!electionApproaching(state)) return null;

  const turnos = turnsUntilElection(state);
  const player = state.playerCountryId ? state.paises[state.playerCountryId] : null;
  if (!player) return null;

  return (
    <div className="flex items-center gap-2 bg-amber-500/15 border-b border-amber-500/40 px-4 py-2 text-xs sm:px-6">
      <Vote className="size-4 text-amber-600 shrink-0" />
      <span className="text-amber-700 dark:text-amber-300 font-medium">
        Eleições em {turnos} {turnos === 1 ? "mês" : "meses"}
      </span>
      <span className="text-muted-foreground hidden sm:inline">
        — Aprovação actual: {player.aprovacao}/100. Mantém a governação estável para garantir a reeleição.
      </span>
    </div>
  );
}
