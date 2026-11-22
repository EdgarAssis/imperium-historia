// src/components/game/AdvisorsPanel.tsx
// Fase 11 — Painel de conselheiros.
// Mostra 4 conselheiros (económico, militar, diplomático, segurança) com sugestões.

"use client";

import { useGameStore } from "@/lib/state";
import { generateAdvisorSuggestions } from "@/lib/engine";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Shield, Globe, Lock } from "lucide-react";
import type { AdvisorType } from "@/types";

const ADVISOR_ICONS: Record<AdvisorType, React.ReactNode> = {
  economico: <Briefcase className="size-4 text-emerald-600" />,
  militar: <Shield className="size-4 text-red-600" />,
  diplomatico: <Globe className="size-4 text-blue-600" />,
  seguranca: <Lock className="size-4 text-amber-600" />,
};

const PRIORIDADE_LABELS: Record<"alta" | "media" | "baixa", string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

const PRIORIDADE_COLORS: Record<"alta" | "media" | "baixa", string> = {
  alta: "#dc2626",
  media: "#f59e0b",
  baixa: "#6b7280",
};

export function AdvisorsPanel() {
  const state = useGameStore((s) => s.state);
  if (!state) return null;

  const sugestoes = generateAdvisorSuggestions(state);
  const conselheiros = state.conselheiros;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Conselheiros</CardTitle>
        <CardDescription>
          Sugestões baseadas no estado actual. Confiança reflecte estabilidade do governo.
        </CardDescription>
      </CardHeader>
      <ScrollArea className="flex-1 overflow-hidden">
        <CardContent className="space-y-2 text-xs">
          {sugestoes.map((sug) => {
            const conselheiro = conselheiros.find((c) => c.tipo === sug.tipo);
            const confianca = conselheiro?.confianca ?? 50;
            return (
              <div key={sug.tipo} className="rounded-md border px-2 py-1.5">
                <div className="mb-1 flex items-center gap-1.5">
                  {ADVISOR_ICONS[sug.tipo]}
                  <span className="font-medium">{sug.conselheiro}</span>
                  <Badge
                    variant="outline"
                    className="ml-auto text-[9px]"
                    style={{ color: PRIORIDADE_COLORS[sug.prioridade], borderColor: PRIORIDADE_COLORS[sug.prioridade] }}
                  >
                    {PRIORIDADE_LABELS[sug.prioridade]}
                  </Badge>
                </div>
                <p className="text-muted-foreground text-[11px] leading-snug">{sug.sugestao}</p>
                <div className="mt-1 flex items-center gap-1">
                  <span className="text-muted-foreground text-[10px]">Confiança:</span>
                  <div className="bg-muted h-1 w-16 overflow-hidden rounded-full">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${confianca}%`,
                        backgroundColor: confianca > 60 ? "#16a34a" : confianca > 30 ? "#f59e0b" : "#dc2626",
                      }}
                    />
                  </div>
                  <span className="text-muted-foreground text-[10px] tabular-nums">{confianca}%</span>
                </div>
              </div>
            );
          })}
        </CardContent>
      </ScrollArea>
    </Card>
  );
}
