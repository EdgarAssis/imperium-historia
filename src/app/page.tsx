// src/app/page.tsx
// Rota única visível (`/`). Alterna entre ecrã inicial e ecrã do jogo
// conforme o estado do store zustand.

"use client";

import { useEffect } from "react";
import { useGameStore, loadAutosave } from "@/lib/state";
import { useClientOnly } from "@/lib/state/useClientOnly";
import { StartScreen } from "@/components/game/StartScreen";
import { GameScreen } from "@/components/game/GameScreen";

export default function Home() {
  const state = useGameStore((s) => s.state);
  const isClient = useClientOnly();

  // Restaura do autosave quando passamos para o cliente.
  // setState (loadState) corre dentro do callback, não sincronizado no corpo — ok.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = loadAutosave();
    if (saved) {
      useGameStore.getState().loadState(saved);
    }
  }, []);

  if (!isClient) {
    return (
      <main className="bg-background min-h-screen">
        <div className="text-muted-foreground p-6 text-sm">A preparar o mundo…</div>
      </main>
    );
  }

  return state ? <GameScreen /> : <StartScreen />;
}
