// src/components/game/TechTreePanel.tsx
// Fase 11 — Painel da árvore tecnológica.
// Mostra techs disponíveis, pesquisa em curso, e permite iniciar nova pesquisa.

"use client";

import { useGameStore } from "@/lib/state";
import { TECH_TREE, availableTechs, getTech } from "@/lib/engine";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FlaskConical, CheckCircle2, Clock, Lock } from "lucide-react";
import type { TechNode } from "@/types";

const CATEGORIA_LABELS: Record<TechNode["categoria"], string> = {
  militar: "Militar",
  economia: "Economia",
  saude: "Saúde",
  ciber: "Ciber",
  energia: "Energia",
};

const CATEGORIA_COLORS: Record<TechNode["categoria"], string> = {
  militar: "#dc2626",
  economia: "#16a34a",
  saude: "#0891b2",
  ciber: "#7c3aed",
  energia: "#f59e0b",
};

export function TechTreePanel() {
  const state = useGameStore((s) => s.state);
  const startResearch = useGameStore((s) => s.startResearch);

  if (!state) return null;

  const pesquisa = state.pesquisa;
  const desbloqueadas = new Set(pesquisa.desbloqueadas);
  const disponiveis = availableTechs(state);
  const techEmCurso = pesquisa.emPesquisa ? getTech(pesquisa.emPesquisa) : null;
  const totalTechs = TECH_TREE.length;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="size-4 text-purple-600" />
          Árvore tecnológica
        </CardTitle>
        <CardDescription>
          {desbloqueadas.size}/{totalTechs} desbloqueadas · {disponiveis.length} disponíveis
        </CardDescription>
      </CardHeader>
      <ScrollArea className="flex-1 overflow-hidden">
        <CardContent className="space-y-3 text-xs">
          {/* Pesquisa em curso */}
          {techEmCurso && (
            <section className="rounded-md border border-blue-500/40 bg-blue-500/5 p-2">
              <div className="mb-1 flex items-center gap-1.5">
                <Clock className="size-3 animate-spin text-blue-600" style={{ animationDuration: "3s" }} />
                <span className="font-medium">Em pesquisa: {techEmCurso.nome}</span>
              </div>
              <Progress
                value={((techEmCurso.turnosPesquisa - pesquisa.turnosRestantes) / techEmCurso.turnosPesquisa) * 100}
                className="h-1.5"
              />
              <p className="mt-1 text-muted-foreground text-[10px] tabular-nums">
                {pesquisa.turnosRestantes} meses restantes
              </p>
            </section>
          )}

          {/* Techs disponíveis */}
          {disponiveis.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">Disponíveis</h3>
              {disponiveis.map((tech) => (
                <TechCard
                  key={tech.id}
                  tech={tech}
                  podePesquisar={!techEmCurso && (state.playerCountryId ? state.paises[state.playerCountryId].tesouro >= tech.custo : false)}
                  onResearch={() => startResearch(tech.id)}
                />
              ))}
            </section>
          )}

          {/* Techs bloqueadas (prereqs em falta) */}
          <section className="space-y-1">
            <h3 className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">Bloqueadas</h3>
            {TECH_TREE.filter((t) => !desbloqueadas.has(t.id) && !disponiveis.find((d) => d.id === t.id)).map((tech) => (
              <div key={tech.id} className="rounded-md border border-muted bg-muted/20 px-2 py-1 opacity-60">
                <div className="flex items-center gap-1.5">
                  <Lock className="size-3 text-muted-foreground" />
                  <span className="font-medium">{tech.nome}</span>
                </div>
                <p className="text-muted-foreground text-[10px]">
                  Requer: {tech.prereqs.map((p) => getTech(p)?.nome ?? p).join(", ")}
                </p>
              </div>
            ))}
          </section>

          {/* Techs desbloqueadas */}
          {desbloqueadas.size > 0 && (
            <section className="space-y-1">
              <h3 className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">Desbloqueadas</h3>
              {TECH_TREE.filter((t) => desbloqueadas.has(t.id)).map((tech) => (
                <div key={tech.id} className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1">
                  <CheckCircle2 className="size-3 text-emerald-600" />
                  <span className="font-medium">{tech.nome}</span>
                  <span className="text-muted-foreground text-[10px]">{tech.bonus}</span>
                </div>
              ))}
            </section>
          )}
        </CardContent>
      </ScrollArea>
    </Card>
  );
}

function TechCard({
  tech,
  podePesquisar,
  onResearch,
}: {
  tech: TechNode;
  podePesquisar: boolean;
  onResearch: () => void;
}) {
  return (
    <div className="rounded-md border px-2 py-1.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium">{tech.nome}</span>
        <Badge variant="outline" className="text-[9px]" style={{ color: CATEGORIA_COLORS[tech.categoria] }}>
          {CATEGORIA_LABELS[tech.categoria]}
        </Badge>
      </div>
      <p className="text-muted-foreground mb-1 text-[11px] leading-snug">{tech.descricao}</p>
      <p className="text-emerald-600 mb-1 text-[10px]">Bónus: {tech.bonus}</p>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-[10px] tabular-nums">
          ${formatCompact(tech.custo)} · {tech.turnosPesquisa}m
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[10px]"
          disabled={!podePesquisar}
          onClick={onResearch}
          title={!podePesquisar ? "Tesouro insuficiente ou pesquisa em curso" : `Pesquisar ${tech.nome}`}
        >
          Pesquisar
        </Button>
      </div>
    </div>
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
