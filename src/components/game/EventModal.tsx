// src/components/game/EventModal.tsx
// Modal de evento: mostra pendingEvent (título, texto, escolhas) e deixa o
// jogador escolher. Quando escolhe, chama store.resolveEvent.

"use client";

import { useGameStore } from "@/lib/state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { formatDatePT } from "@/lib/state";

export function EventModal() {
  const pendingEvent = useGameStore((s) => s.state?.pendingEvent ?? null);
  const resolveEvent = useGameStore((s) => s.resolveEvent);

  if (!pendingEvent) return null;
  const { evento, data } = pendingEvent;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-1 pb-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertCircle className="size-4 text-amber-600" />
            <span>{formatDatePT(data)}</span>
            <span>·</span>
            <span className="uppercase tracking-wide">{translateEventType(evento.tipo)}</span>
          </div>
          <CardTitle className="text-lg">{evento.titulo}</CardTitle>
          <CardDescription>{evento.texto}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {evento.choices.map((choice) => (
            <button
              key={choice.id}
              onClick={() => resolveEvent(evento.id, choice.id)}
              className="hover:bg-accent flex w-full flex-col items-start gap-0.5 rounded-md border p-3 text-left transition-colors"
            >
              <span className="text-sm font-medium">{choice.label}</span>
              {choice.descricao && (
                <span className="text-muted-foreground text-xs leading-snug">
                  {choice.descricao}
                </span>
              )}
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function translateEventType(t: string): string {
  const map: Record<string, string> = {
    guerra: "guerra",
    economia: "economia",
    diplomacia: "diplomacia",
    politica: "política",
    evento: "evento",
    sistema: "sistema",
  };
  return map[t] ?? t;
}
