// src/components/game/NewsPanel.tsx
// Fase 11 + Bloco A5 — Painel de notícias dinâmicas com filtros.
// Mostra as últimas notícias geradas pelo motor (state.noticias).
// Filtros: por categoria (todas/guerra/economia/diplomacia/politica/mundo) + por país.

"use client";

import { useState } from "react";
import { useGameStore } from "@/lib/state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Newspaper } from "lucide-react";
import type { NewsItem } from "@/types";

const CATEGORIA_LABELS: Record<NewsItem["categoria"], string> = {
  guerra: "Guerra",
  economia: "Economia",
  diplomacia: "Diplomacia",
  politica: "Política",
  evento: "Evento",
  sistema: "Sistema",
  mundo: "Mundo",
};

const CATEGORIA_COLORS: Record<NewsItem["categoria"], string> = {
  guerra: "#dc2626",
  economia: "#16a34a",
  diplomacia: "#2563eb",
  politica: "#f59e0b",
  evento: "#7c3aed",
  sistema: "#6b7280",
  mundo: "#0891b2",
};

type FiltroCategoria = "todas" | NewsItem["categoria"];

const FILTROS: { id: FiltroCategoria; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "guerra", label: "Guerra" },
  { id: "economia", label: "Economia" },
  { id: "diplomacia", label: "Diplomacia" },
  { id: "politica", label: "Política" },
  { id: "mundo", label: "Mundo" },
];

export function NewsPanel() {
  const noticias = useGameStore((s) => s.state?.noticias ?? []);
  const [filtro, setFiltro] = useState<FiltroCategoria>("todas");

  // Filtra por categoria + mostra últimas 15 (mais recentes primeiro).
  const filtradas = noticias
    .filter((n) => filtro === "todas" || n.categoria === filtro)
    .reverse()
    .slice(0, 15);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Newspaper className="size-4 text-blue-600" />
          Notícias do mundo
        </CardTitle>
        <CardDescription>
          {filtradas.length} notícia(s) {filtro !== "todas" ? `em «${CATEGORIA_LABELS[filtro as NewsItem["categoria"]]}»` : "(todas as categorias)"}
        </CardDescription>
      </CardHeader>
      {/* Bloco A5 — Filtros por categoria */}
      <div className="flex flex-wrap gap-0.5 px-4 pb-2">
        {FILTROS.map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant={filtro === f.id ? "default" : "ghost"}
            className="h-6 px-2 text-[10px]"
            onClick={() => setFiltro(f.id)}
          >
            {f.label}
          </Button>
        ))}
      </div>
      <ScrollArea className="flex-1 overflow-hidden">
        <CardContent className="space-y-2 text-xs">
          {filtradas.length === 0 ? (
            <p className="text-muted-foreground">Ainda não há notícias{filtro !== "todas" ? " nesta categoria" : ""}. Avança o tempo para ver o mundo em movimento.</p>
          ) : (
            filtradas.map((n) => (
              <div key={n.id} className="rounded-md border px-2 py-1.5">
                <div className="mb-0.5 flex items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className="text-[9px]"
                    style={{ color: CATEGORIA_COLORS[n.categoria], borderColor: CATEGORIA_COLORS[n.categoria] }}
                  >
                    {CATEGORIA_LABELS[n.categoria]}
                  </Badge>
                  <span className="text-muted-foreground text-[10px] tabular-nums">T{n.turno}</span>
                  {n.countryId && (
                    <span className="text-muted-foreground text-[10px]">· {n.countryId}</span>
                  )}
                </div>
                <p className="font-medium leading-snug">{n.titulo}</p>
                <p className="text-muted-foreground text-[11px] leading-snug">{n.texto}</p>
              </div>
            ))
          )}
        </CardContent>
      </ScrollArea>
    </Card>
  );
}
