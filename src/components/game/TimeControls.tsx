// src/components/game/TimeControls.tsx
// Fase 1 — Controlos do relógio global: pausa/continuar, velocidade 0.5x-10x,
// data exacta do jogo e toggle de pausa automática.
// Atalhos de teclado (tratados no GameScreen): espaço = pausar, +/- = velocidade.
//
// Usa selectors finos do store para re-renderizar apenas quando o relógio muda.

"use client";

import { useGameStore } from "@/lib/state";
import { GAME_SPEEDS, type GameSpeed } from "@/types";
import { formatDatePT } from "@/lib/state";
import { Button } from "@/components/ui/button";
import { Pause, Play, Bell, BellOff } from "lucide-react";

const SPEED_LABELS: Record<GameSpeed, string> = {
  0.5: "0.5x",
  1: "1x",
  2: "2x",
  5: "5x",
  10: "10x",
};

export function TimeControls() {
  const dataAtual = useGameStore((s) => s.state?.dataAtual ?? null);
  const pausado = useGameStore((s) => s.state?.timeState.pausado ?? true);
  const velocidade = useGameStore((s) => s.state?.timeState.velocidade ?? 1);
  const autoPause = useGameStore((s) => s.state?.timeState.autoPauseEventos ?? true);
  const togglePause = useGameStore((s) => s.togglePause);
  const setSpeed = useGameStore((s) => s.setSpeed);
  const setAutoPauseEventos = useGameStore((s) => s.setAutoPauseEventos);

  if (!dataAtual) return null;

  return (
    <div className="bg-card border-muted flex flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5 sm:gap-2 sm:px-3">
      {/* Data do jogo */}
      <time className="text-foreground min-w-[10.5rem] text-xs font-semibold tabular-nums sm:text-sm" dateTime={dataAtual}>
        {formatDatePT(dataAtual)}
      </time>

      {/* Pausa/continuar */}
      <Button
        size="sm"
        variant={pausado ? "default" : "secondary"}
        onClick={togglePause}
        aria-label={pausado ? "Continuar (espaço)" : "Pausar (espaço)"}
        title={pausado ? "Continuar (espaço)" : "Pausar (espaço)"}
        className="size-8 p-0"
      >
        {pausado ? <Play className="size-4" /> : <Pause className="size-4" />}
      </Button>

      {/* Velocidades */}
      <div className="flex items-center gap-0.5" role="group" aria-label="Velocidade do jogo (+/-)">
        {GAME_SPEEDS.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={velocidade === s && !pausado ? "default" : "ghost"}
            className="h-8 px-1.5 text-[11px] tabular-nums sm:px-2 sm:text-xs"
            onClick={() => setSpeed(s)}
            aria-pressed={velocidade === s && !pausado}
            title={`Velocidade ${SPEED_LABELS[s]}`}
          >
            {SPEED_LABELS[s]}
          </Button>
        ))}
      </div>

      {/* Pausa automática */}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setAutoPauseEventos(!autoPause)}
        aria-pressed={autoPause}
        aria-label={autoPause ? "Pausa automática ligada" : "Pausa automática desligada"}
        title={autoPause ? "Pausa automática em eventos: LIGADA" : "Pausa automática em eventos: DESLIGADA"}
        className="size-8 p-0"
      >
        {autoPause ? <Bell className="size-4 text-amber-600" /> : <BellOff className="size-4 text-muted-foreground" />}
      </Button>
    </div>
  );
}
