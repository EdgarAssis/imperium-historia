// src/components/game/MandateSummary.tsx
// Ecrã «Resumo do mandato»: gráficos simples (SVG inline) do PIB, estabilidade
// e aprovação do país do jogador ao longo do tempo.
// Usa os snapshots de state.playerHistory.
//
// Acessível via um botão na barra superior (mostra um Dialog).

"use client";

import { useGameStore } from "@/lib/state";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BarChart3, TrendingUp, TrendingDown } from "lucide-react";
import type { PlayerHistoryEntry } from "@/types";

const WIDTH = 600;
const HEIGHT = 200;
const PADDING = 40;

export function MandateSummary() {
  const state = useGameStore((s) => s.state);
  if (!state) return null;

  const history = state.playerHistory;
  const hasData = history.length > 1;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" aria-label="Resumo do mandato">
          <BarChart3 className="size-4" />
          <span className="hidden sm:inline">Resumo</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Resumo do mandato</DialogTitle>
          <DialogDescription>
            Evolução do país do jogador ao longo de {history.length} turno(s).
            {!hasData && " Termina pelo menos 2 turnos para ver gráficos."}
          </DialogDescription>
        </DialogHeader>

        {!hasData ? (
          <p className="text-muted-foreground text-sm">
            Ainda não há dados suficientes para gráficos. Termina mais turnos.
          </p>
        ) : (
          <div className="space-y-4">
            <Chart
              title="PIB"
              history={history}
              valueExtractor={(h) => h.pib}
              formatValue={formatPib}
              color="#3b82f6"
            />
            <Chart
              title="Estabilidade (0–100)"
              history={history}
              valueExtractor={(h) => h.estabilidade}
              formatValue={(v) => v.toFixed(0)}
              color="#16a34a"
              yMin={0}
              yMax={100}
            />
            <Chart
              title="Aprovação (0–100)"
              history={history}
              valueExtractor={(h) => h.aprovacao}
              formatValue={(v) => v.toFixed(0)}
              color="#f59e0b"
              yMin={0}
              yMax={100}
            />
            <Chart
              title="Tesouro"
              history={history}
              valueExtractor={(h) => h.tesouro}
              formatValue={formatPib}
              color="#a855f7"
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface ChartProps {
  title: string;
  history: PlayerHistoryEntry[];
  valueExtractor: (h: PlayerHistoryEntry) => number;
  formatValue: (v: number) => string;
  color: string;
  yMin?: number;
  yMax?: number;
}

function Chart({ title, history, valueExtractor, formatValue, color, yMin, yMax }: ChartProps) {
  if (history.length < 2) {
    return (
      <div className="text-muted-foreground text-sm">
        <h3 className="font-medium text-foreground">{title}</h3>
        <p>Sem dados suficientes.</p>
      </div>
    );
  }
  const values = history.map(valueExtractor);
  let min = yMin ?? Math.min(...values);
  let max = yMax ?? Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const points = values.map((v, i) => {
    const x = PADDING + (i / (history.length - 1)) * (WIDTH - 2 * PADDING);
    const y = HEIGHT - PADDING - ((v - min) / (max - min)) * (HEIGHT - 2 * PADDING);
    return { x, y, value: v, turno: history[i].turno, data: history[i].data };
  });

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  // Último e primeiro para tendência.
  const first = values[0];
  const last = values[values.length - 1];
  const diff = last - first;
  const trendUp = diff > 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-xs tabular-nums">
          {formatValue(first)} → {formatValue(last)}{" "}
          <span className={trendUp ? "text-emerald-600" : "text-red-600"}>
            {trendUp ? <TrendingUp className="inline size-3" /> : <TrendingDown className="inline size-3" />}
            {diff > 0 ? "+" : ""}{formatValue(diff)}
          </span>
        </span>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* Eixo Y: linhas de referência */}
        <line x1={PADDING} y1={PADDING} x2={WIDTH - PADDING} y2={PADDING} stroke="#e5e7eb" strokeWidth={1} />
        <line x1={PADDING} y1={HEIGHT - PADDING} x2={WIDTH - PADDING} y2={HEIGHT - PADDING} stroke="#e5e7eb" strokeWidth={1} />
        {/* Etiquetas Y */}
        <text x={PADDING - 4} y={PADDING + 4} fontSize={10} textAnchor="end" fill="#6b7280">{formatValue(max)}</text>
        <text x={PADDING - 4} y={HEIGHT - PADDING + 4} fontSize={10} textAnchor="end" fill="#6b7280">{formatValue(min)}</text>
        {/* Etiqueta X: último turno */}
        <text x={WIDTH - PADDING} y={HEIGHT - PADDING + 18} fontSize={10} textAnchor="end" fill="#6b7280">
          T{history[history.length - 1].turno}
        </text>
        <text x={PADDING} y={HEIGHT - PADDING + 18} fontSize={10} textAnchor="start" fill="#6b7280">
          T{history[0].turno}
        </text>
        {/* Linha do gráfico */}
        <path d={pathD} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {/* Pontos */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={2}
            fill={color}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  );
}

function formatPib(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return `$${sign}${(abs / 1e12).toFixed(2)} T`;
  if (abs >= 1e9) return `$${sign}${(abs / 1e9).toFixed(1)} MM`;
  if (abs >= 1e6) return `$${sign}${(abs / 1e6).toFixed(1)} M`;
  if (abs >= 1e3) return `$${sign}${(abs / 1e3).toFixed(1)} k`;
  return `$${sign}${abs}`;
}
