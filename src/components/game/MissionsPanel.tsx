// src/components/game/MissionsPanel.tsx
// Fase 11 — Painel de missões e achievements.
// Mostra missões activas/completas/falhadas com progresso + achievements desbloqueados.

"use client";

import { useGameStore } from "@/lib/state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Trophy, Target, CheckCircle2, XCircle } from "lucide-react";
import type { Mission, MissionStatus } from "@/types";

const STATUS_LABELS: Record<MissionStatus, string> = {
  ativa: "Activa",
  completa: "Completa",
  falhada: "Falhada",
};

const STATUS_COLORS: Record<MissionStatus, string> = {
  ativa: "#2563eb",
  completa: "#16a34a",
  falhada: "#dc2626",
};

export function MissionsPanel() {
  const missoes = useGameStore((s) => s.state?.missoes ?? []);
  const achievements = useGameStore((s) => s.state?.achievements ?? []);
  const turno = useGameStore((s) => s.state?.turno ?? 0);

  const activas = missoes.filter((m) => m.status === "ativa");
  const completas = missoes.filter((m) => m.status === "completa");
  const falhadas = missoes.filter((m) => m.status === "falhada");
  const achvDesbloqueados = achievements.filter((a) => a.turnoDesbloqueio !== null);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="size-4 text-amber-600" />
          Missões & Achievements
        </CardTitle>
        <CardDescription>
          {activas.length} activas · {completas.length} completas · {achvDesbloqueados.length} achievements
        </CardDescription>
      </CardHeader>
      <ScrollArea className="flex-1 overflow-hidden">
        <CardContent className="space-y-3 text-xs">
          {/* Missões activas */}
          {activas.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">Missões activas</h3>
              {activas.map((m) => (
                <MissionCard key={m.id} mission={m} turno={turno} />
              ))}
            </section>
          )}

          {/* Missões completas */}
          {completas.length > 0 && (
            <section className="space-y-1">
              <h3 className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">Completas</h3>
              {completas.map((m) => (
                <div key={m.id} className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1">
                  <CheckCircle2 className="size-3 text-emerald-600" />
                  <span className="font-medium">{m.titulo}</span>
                </div>
              ))}
            </section>
          )}

          {/* Missões falhadas */}
          {falhadas.length > 0 && (
            <section className="space-y-1">
              <h3 className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">Falhadas</h3>
              {falhadas.map((m) => (
                <div key={m.id} className="flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/5 px-2 py-1">
                  <XCircle className="size-3 text-red-600" />
                  <span className="font-medium">{m.titulo}</span>
                </div>
              ))}
            </section>
          )}

          {/* Achievements */}
          <section className="space-y-1">
            <h3 className="text-muted-foreground flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide">
              <Trophy className="size-3" /> Achievements ({achvDesbloqueados.length}/{achievements.length})
            </h3>
            <div className="grid grid-cols-2 gap-1">
              {achievements.map((a) => {
                const desbloqueado = a.turnoDesbloqueio !== null;
                return (
                  <div
                    key={a.id}
                    className={`rounded-md border px-1.5 py-1 ${desbloqueado ? "border-amber-500/40 bg-amber-500/5" : "border-muted bg-muted/20 opacity-50"}`}
                  >
                    <p className="text-[10px] font-medium leading-tight">{a.titulo}</p>
                    <p className="text-muted-foreground text-[9px] leading-tight">{a.descricao}</p>
                  </div>
                );
              })}
            </div>
          </section>
        </CardContent>
      </ScrollArea>
    </Card>
  );
}

function MissionCard({ mission, turno }: { mission: Mission; turno: number }) {
  const progressoPct = Math.min(100, (mission.progresso / mission.alvo) * 100);
  const turnosRestantes = mission.prazo > 0 ? mission.prazo - (turno - mission.turnoAtribuicao) : -1;
  return (
    <div className="rounded-md border px-2 py-1.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium">{mission.titulo}</span>
        <Badge variant="outline" className="text-[9px]" style={{ color: STATUS_COLORS[mission.status] }}>
          {STATUS_LABELS[mission.status]}
        </Badge>
      </div>
      <p className="text-muted-foreground mb-1.5 text-[11px] leading-snug">{mission.descricao}</p>
      <Progress value={progressoPct} className="h-1.5" />
      <div className="mt-1 flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground tabular-nums">
          {formatProgress(mission)}/{formatAlvo(mission)}
        </span>
        {turnosRestantes >= 0 && (
          <span className={`tabular-nums ${turnosRestantes < 10 ? "text-amber-600" : "text-muted-foreground"}`}>
            {turnosRestantes}m restantes
          </span>
        )}
      </div>
      <p className="mt-0.5 text-[10px] text-emerald-600">
        Recompensa: +${formatCompact(mission.recompensaTesouro)} · {mission.recompensaReputacao >= 0 ? "+" : ""}{mission.recompensaReputacao} rep
      </p>
    </div>
  );
}

function formatProgress(m: Mission): string {
  if (m.objetivo === "atingir_pib") return `$${formatCompact(m.progresso)}`;
  return Math.round(m.progresso).toString();
}

function formatAlvo(m: Mission): string {
  if (m.objetivo === "atingir_pib") return `$${formatCompact(m.alvo)}`;
  return m.alvo.toString();
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
