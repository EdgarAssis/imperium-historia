// src/components/game/RankingPanel.tsx
// Painel com rankings dos top países. Fase 2: agora mostra 4 rankings:
//   - PIB (motor clássico)
//   - Força Militar realista (orçamento militar + tropas + nuclear, 0-100)
//   - Influência Política (PIB + ONU-CS + blocos + aliados, 0-100)
//   - Exército (índice interno 0-1000, mantido para retrocompatibilidade)
//
// Destaca o país do jogador. Mostra turnos no top 3 e progresso para vitória.
// Vitória: top 3 em PIB OU em Força Militar durante {threshold} meses.

"use client";

import { useState } from "react";
import { useGameStore } from "@/lib/state";
import {
  rankByGdp,
  rankByMilitary,
  rankByMilitaryStrength,
  rankByInfluence,
  victoryThreshold,
  calculateMilitaryStrength,
  calculatePoliticalInfluence,
} from "@/lib/engine";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy } from "lucide-react";
import type { Country, GameState } from "@/types";

type RankingKind = "pib" | "forca" | "influencia" | "military";

export function RankingPanel() {
  const state = useGameStore((s) => s.state);
  const [kind, setKind] = useState<RankingKind>("pib");
  if (!state) return null;

  const countries = rankingCountries(state, kind);
  const threshold = victoryThreshold(state);
  const turnosTop3 = state.turnosTop3;
  const progressoVitoria = Math.min(100, (turnosTop3 / threshold) * 100);
  const vitoriaDeclarada = state.vitoriaDeclarada;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="size-4 text-amber-600" />
          Ranking mundial
        </CardTitle>
        <CardDescription>
          Top 10 por indicador. Vitória: top 3 durante {threshold} meses (PIB ou Força Militar).
        </CardDescription>
        {vitoriaDeclarada ? (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1 text-xs">
            <p className="font-medium text-emerald-700 dark:text-emerald-300">
              Vitória declarada! O jogo continua.
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Progresso para vitória</span>
              <span className="font-medium tabular-nums">{turnosTop3}/{threshold}</span>
            </div>
            <div className="bg-muted h-1.5 overflow-hidden rounded-full">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${progressoVitoria}%`, backgroundColor: "#16a34a" }}
              />
            </div>
          </div>
        )}
      </CardHeader>

      <Tabs value={kind} onValueChange={(v) => setKind(v as RankingKind)} className="px-4">
        <TabsList className="grid h-8 w-full grid-cols-4">
          <TabsTrigger value="pib" className="text-[11px]">PIB</TabsTrigger>
          <TabsTrigger value="forca" className="text-[11px]">Força</TabsTrigger>
          <TabsTrigger value="influencia" className="text-[11px]">Influência</TabsTrigger>
          <TabsTrigger value="military" className="text-[11px]">Exército</TabsTrigger>
        </TabsList>
      </Tabs>

      <ScrollArea className="flex-1 overflow-hidden">
        <CardContent className="pt-3 text-xs">
          <ol className="space-y-0.5">
            {countries.map((c, i) => {
              const isPlayer = c.id === state.playerCountryId;
              const top3 = i < 3;
              const v = metricValueFor(state, c, kind);
              return (
                <li
                  key={c.id}
                  className={`flex items-center justify-between rounded-md px-2 py-1 ${
                    isPlayer ? "border bg-accent" : "border-transparent"
                  } ${top3 ? "border-amber-500/40 bg-amber-500/5" : ""}`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`size-3 shrink-0 rounded-full ${top3 ? "ring-amber-500 ring-1" : ""}`}
                      style={{ backgroundColor: c.cor }}
                      aria-hidden
                    />
                    <span className="font-mono text-[10px] text-muted-foreground">{i + 1}</span>
                    <span className={`truncate ${isPlayer ? "font-semibold" : ""}`}>
                      {c.nome}
                      {isPlayer && <span className="ml-1 text-[10px] text-emerald-600">(tu)</span>}
                    </span>
                  </span>
                  <span className="tabular-nums">{formatMetric(v, kind)}</span>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </ScrollArea>
    </Card>
  );
}

/** Lista ordenada (desc) de top 10 países para a métrica escolhida. */
function rankingCountries(state: GameState, kind: RankingKind): Country[] {
  switch (kind) {
    case "pib": return rankByGdp(state, 10);
    case "forca": return rankByMilitaryStrength(state, 10);
    case "influencia": return rankByInfluence(state, 10);
    case "military": return rankByMilitary(state, 10);
  }
}

/** Valor a exibir para um país na métrica escolhida. */
function metricValueFor(state: GameState, c: Country, kind: RankingKind): number {
  switch (kind) {
    case "pib": return c.pib;
    case "forca": return calculateMilitaryStrength(c);
    case "influencia": return calculatePoliticalInfluence(c, state);
    case "military": return c.exercito;
  }
}

/** Formatador legível para cada tipo de métrica. */
function formatMetric(v: number, kind: RankingKind): string {
  switch (kind) {
    case "pib": return formatPib(v);
    case "forca":
    case "influencia":
      return v.toFixed(1);
    case "military":
      return v.toFixed(0);
  }
}

function formatPib(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return `$${sign}${(abs / 1e12).toFixed(2)} T`;
  if (abs >= 1e9) return `$${sign}${(abs / 1e9).toFixed(1)} MM`;
  if (abs >= 1e6) return `$${sign}${(abs / 1e6).toFixed(1)} M`;
  return `$${sign}${abs}`;
}
