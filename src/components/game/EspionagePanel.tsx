// src/components/game/EspionagePanel.tsx
// Bloco A1 — Painel de operações de espionagem.
// Mostra operações disponíveis + resultados recentes. Permite seleccionar alvo
// (país actualmente seleccionado no mapa) e executar operação.

"use client";

import { useGameStore } from "@/lib/state";
import { SPY_OPERATIONS } from "@/lib/engine";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, Wrench, HandCoins, UserX, Skull } from "lucide-react";
import type { SpyOperationType } from "@/types";

const SPY_ICONS: Record<SpyOperationType, React.ReactNode> = {
  roubar_tech: <Eye className="size-4" />,
  sabotar_infra: <Wrench className="size-4" />,
  subornar_oficial: <HandCoins className="size-4" />,
  infiltrar_governo: <UserX className="size-4" />,
  assassinar: <Skull className="size-4" />,
};

export interface EspionagePanelProps {
  /** ID do país-alvo seleccionado no mapa. */
  alvoId: string | null;
}

export function EspionagePanel({ alvoId }: EspionagePanelProps) {
  const state = useGameStore((s) => s.state);
  const executeSpyOperation = useGameStore((s) => s.executeSpyOperation);

  if (!state || !state.playerCountryId) return null;

  const player = state.paises[state.playerCountryId];
  const alvo = alvoId ? state.paises[alvoId] : null;

  // Eventos de espionagem recentes (últimos 5).
  const spyEvents = state.eventos
    .filter((e) => e.titulo.includes("Operação secreta") || e.titulo.includes("espionagem"))
    .slice(-5)
    .reverse();

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Eye className="size-4 text-red-600" />
          Espionagem
        </CardTitle>
        <CardDescription>
          {alvo
            ? `Alvo: ${alvo.nome}. Escolhe uma operação.`
            : "Selecciona um país no mapa para espionar."}
        </CardDescription>
      </CardHeader>
      <ScrollArea className="flex-1 overflow-hidden">
        <CardContent className="space-y-2 text-xs">
          {/* Operações disponíveis */}
          {alvo && alvoId !== state.playerCountryId ? (
            <div className="space-y-1.5">
              {SPY_OPERATIONS.map((op) => {
                const podePagar = player.tesouro >= op.custo;
                return (
                  <div key={op.tipo} className="rounded-md border px-2 py-1.5">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-medium">
                        {SPY_ICONS[op.tipo]}
                        {op.label}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        ${formatCompact(op.custo)}
                      </span>
                    </div>
                    <p className="text-muted-foreground mb-1 text-[11px] leading-snug">{op.descricao}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 w-full text-[10px]"
                      disabled={!podePagar}
                      onClick={() => executeSpyOperation(alvoId!, op.tipo)}
                      title={!podePagar ? "Tesouro insuficiente" : `Executar: ${op.label}`}
                    >
                      Executar
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground">
              {alvoId === state.playerCountryId
                ? "Não se pode espionar a si próprio."
                : "Clica num país no mapa para seleccioná-lo como alvo."}
            </p>
          )}

          {/* Resultados recentes */}
          {spyEvents.length > 0 && (
            <div className="mt-2 space-y-1">
              <h3 className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
                Operações recentes
              </h3>
              {spyEvents.map((ev) => (
                <div key={ev.id} className="rounded-md border px-2 py-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[11px]">{ev.titulo}</span>
                    <Badge
                      variant="outline"
                      className="text-[9px]"
                      style={{
                        color: ev.titulo.includes("sucedida") ? "#16a34a" : "#dc2626",
                        borderColor: ev.titulo.includes("sucedida") ? "#16a34a" : "#dc2626",
                      }}
                    >
                      {ev.titulo.includes("sucedida") ? "Sucesso" : "Falha"}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-[10px] leading-snug">{ev.texto}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </ScrollArea>
    </Card>
  );
}

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)} T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)} MM`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)} M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)} k`;
  return `${sign}${abs}`;
}
