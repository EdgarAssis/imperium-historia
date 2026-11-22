// src/components/game/DiaryTimeline.tsx
// Diário do jogo: lista de eventos em estilo «jornal», com data.
// Filtros: por tipo (Todos, Guerra, Economia, Diplomacia, Política, Eventos, Sistema).
// Pesquisa: texto livre sobre título + texto + efeitos.
//
// Mostra os resumos de turno + golpes + colapsos + eventos da IA + guerras.

"use client";

import { useState, useMemo } from "react";
import { useGameStore } from "@/lib/state";
import { formatDatePT } from "@/lib/state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { GameEvent, GameEventType } from "@/types";
import { Newspaper, Search } from "lucide-react";

const EVENT_BADGE: Record<GameEventType, { label: string; className: string }> = {
  guerra: { label: "Guerra", className: "bg-red-500/15 text-red-700 dark:text-red-300" },
  economia: { label: "Economia", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  diplomacia: { label: "Diplomacia", className: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  politica: { label: "Política", className: "bg-purple-500/15 text-purple-700 dark:text-purple-300" },
  evento: { label: "Evento", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  sistema: { label: "Sistema", className: "bg-muted text-muted-foreground" },
};

const FILTERS: { value: "all" | GameEventType; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "guerra", label: "Guerra" },
  { value: "economia", label: "Economia" },
  { value: "diplomacia", label: "Diplomacia" },
  { value: "politica", label: "Política" },
  { value: "evento", label: "Eventos" },
  { value: "sistema", label: "Sistema" },
];

export function DiaryTimeline() {
  const state = useGameStore((s) => s.state);
  const [filter, setFilter] = useState<"all" | GameEventType>("all");
  const [search, setSearch] = useState("");

  const eventos = useMemo(() => {
    if (!state) return [];
    const reversed = [...state.eventos].reverse();
    const filtered = filter === "all" ? reversed : reversed.filter((e) => e.tipo === filter);
    if (search.trim().length === 0) return filtered;
    const q = search.trim().toLowerCase();
    return filtered.filter(
      (e) =>
        e.titulo.toLowerCase().includes(q) ||
        e.texto.toLowerCase().includes(q) ||
        e.efeitos.some((ef) => ef.toLowerCase().includes(q)),
    );
  }, [state, filter, search]);

  if (!state) return null;
  const totalEventos = state.eventos.length;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Diário</CardTitle>
        <CardDescription>
          {totalEventos === 0
            ? "Sem eventos ainda. Termina o primeiro turno para ver o resumo."
            : `${totalEventos} evento(s) registado(s)`}
        </CardDescription>
      </CardHeader>

      {/* Barra de filtros + pesquisa */}
      <div className="border-b px-3 pb-2 space-y-2">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={filter === f.value ? "default" : "outline"}
              className="h-7 px-2 text-[11px]"
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <div className="relative">
          <Search className="text-muted-foreground absolute left-2 top-1/2 size-3.5 -translate-y-1/2" />
          <Input
            type="search"
            placeholder="Pesquisar no diário..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-7 text-xs"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 overflow-hidden">
        <CardContent className="space-y-3 pt-3">
          {eventos.length === 0 ? (
            <p className="text-muted-foreground px-1 py-8 text-center text-xs">
              <Newspaper className="mx-auto mb-2 size-6 opacity-40" />
              {totalEventos === 0
                ? "O diário começa vazio. Após cada turno, o motor regista aqui um resumo das mudanças."
                : "Sem eventos para os filtros actuais."}
            </p>
          ) : (
            eventos.map((ev) => <DiaryEntry key={ev.id} event={ev} />)
          )}
        </CardContent>
      </ScrollArea>
    </Card>
  );
}

function DiaryEntry({ event }: { event: GameEvent }) {
  const badge = EVENT_BADGE[event.tipo];
  return (
    <article className="space-y-1 rounded-md border p-2.5 text-xs">
      <header className="flex items-center justify-between gap-2">
        <Badge variant="secondary" className={`px-1.5 py-0.5 text-[10px] ${badge.className}`}>
          {badge.label}
        </Badge>
        <time className="text-muted-foreground text-[10px]">
          {formatDatePT(event.data)}
        </time>
      </header>
      <h4 className="font-semibold leading-tight">{event.titulo}</h4>
      <p className="text-muted-foreground leading-snug">{event.texto}</p>
      {event.efeitos.length > 0 && (
        <ul className="mt-1 space-y-0.5 border-l-2 pl-2 text-[11px]">
          {event.efeitos.map((efeito, i) => (
            <li key={i} className="text-foreground/80">
              {efeito}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
