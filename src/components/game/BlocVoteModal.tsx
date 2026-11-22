// src/components/game/BlocVoteModal.tsx
// Bloco A3 — Modal para o jogador votar manualmente em votações de blocos.
// Aparece automaticamente quando há uma votação pendente onde o jogador é membro.
// Se o jogador votar, o seu voto é registado. Se fechar sem votar, o motor
// decide automaticamente no próximo turno (comportamento existente).

"use client";

import { useState } from "react";
import { useGameStore } from "@/lib/state";
import { BLOCOS } from "@/data/blocs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThumbsUp, ThumbsDown, Minus, Vote } from "lucide-react";

export function BlocVoteModal() {
  const state = useGameStore((s) => s.state);
  const voteInBloc = useGameStore((s) => s.voteInBloc);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Procura votações pendentes onde o jogador é membro e ainda não votou.
  // Limpa dismissed inline (sem useEffect) — remove IDs que já fecharam.
  const validDismissed = new Set<string>();
  for (const id of dismissed) {
    const v = state?.votacoes.find((x) => x.id === id);
    if (v && !v.fechada) validDismissed.add(id);
  }

  const pendingVotes = state && state.playerCountryId
    ? state.votacoes.filter((v) => {
        if (v.fechada) return false;
        if (validDismissed.has(v.id)) return false;
        const player = state.paises[state.playerCountryId!];
        if (!player || !player.blocos.includes(v.blocoId)) return false;
        return v.votos[state.playerCountryId!] === null || v.votos[state.playerCountryId!] === undefined;
      })
    : [];

  const currentVote = pendingVotes[0] ?? null;

  if (!currentVote || !state || !state.playerCountryId) return null;

  const blocoDef = BLOCOS[currentVote.blocoId];
  const blocoNome = blocoDef?.nome ?? currentVote.blocoId;

  function handleVote(voto: "sim" | "nao" | "abstencao") {
    if (!currentVote || !state?.playerCountryId) return;
    voteInBloc(currentVote.id, voto);
    setDismissed((prev) => new Set(prev).add(currentVote.id));
  }

  function handleDismiss() {
    if (!currentVote) return;
    setDismissed((prev) => new Set(prev).add(currentVote.id));
  }

  return (
    <Dialog open={!!currentVote} onOpenChange={(open) => { if (!open) handleDismiss(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Vote className="size-5 text-blue-600" />
            Votação em {blocoNome}
          </DialogTitle>
          <DialogDescription>
            Como membro do bloco, podes votar nesta proposta. Se não votares, o motor decidirá automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Detalhes da proposta */}
          <div className="rounded-md border p-3">
            <div className="mb-1 flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                {currentVote.tipo === "admissao" ? "Admissão" :
                 currentVote.tipo === "sancionar" ? "Sanção" : "Resolução"}
              </Badge>
              <span className="text-muted-foreground text-[10px] tabular-nums">
                Turno {currentVote.turnoAbertura}
              </span>
            </div>
            <p className="text-sm font-medium">{currentVote.proposta}</p>
            {currentVote.alvos.length > 0 && (
              <p className="text-muted-foreground mt-1 text-xs">
                Alvos: {currentVote.alvos.map((id) => state.paises[id]?.nome ?? id).join(", ")}
              </p>
            )}
          </div>

          {/* Votos já registados (outros membros) */}
          {Object.entries(currentVote.votos).filter(([k, v]) => k !== state.playerCountryId && v !== null).length > 0 && (
            <div className="space-y-0.5">
              <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">Votos dos membros</p>
              {Object.entries(currentVote.votos)
                .filter(([k, v]) => k !== state.playerCountryId && v !== null)
                .map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-xs">
                    <span>{state.paises[k]?.nome ?? k}</span>
                    <Badge variant="outline" className="text-[9px]"
                      style={{ color: v === "sim" ? "#16a34a" : v === "nao" ? "#dc2626" : "#6b7280" }}>
                      {v === "sim" ? "A favor" : v === "nao" ? "Contra" : "Abstenção"}
                    </Badge>
                  </div>
                ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-1 sm:gap-1">
          <Button size="sm" variant="default" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => handleVote("sim")}>
            <ThumbsUp className="size-3.5" /> A favor
          </Button>
          <Button size="sm" variant="default" className="bg-red-600 hover:bg-red-700" onClick={() => handleVote("nao")}>
            <ThumbsDown className="size-3.5" /> Contra
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleVote("abstencao")}>
            <Minus className="size-3.5" /> Abster-se
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
