// src/components/game/MapModeSelector.tsx
// Fase 11 — Selector de modo de mapa.
// Modos: político (cor do país), força militar, PIB, reputação, estabilidade.

"use client";

import { Button } from "@/components/ui/button";
import { Map as MapIcon, Swords, Coins, Globe2, Activity, Users } from "lucide-react";

export type MapMode = "politico" | "forca" | "pib" | "reputacao" | "estabilidade" | "refugiados";

const MODES: { mode: MapMode; label: string; icon: React.ReactNode }[] = [
  { mode: "politico", label: "Político", icon: <MapIcon className="size-3.5" /> },
  { mode: "forca", label: "Força", icon: <Swords className="size-3.5" /> },
  { mode: "pib", label: "PIB", icon: <Coins className="size-3.5" /> },
  { mode: "reputacao", label: "Reputação", icon: <Globe2 className="size-3.5" /> },
  { mode: "estabilidade", label: "Estab.", icon: <Activity className="size-3.5" /> },
  { mode: "refugiados", label: "Refugiados", icon: <Users className="size-3.5" /> },
];

export interface MapModeSelectorProps {
  mode: MapMode;
  onChange: (mode: MapMode) => void;
}

export function MapModeSelector({ mode, onChange }: MapModeSelectorProps) {
  return (
    <div className="bg-background/90 absolute left-2 top-2 flex flex-col gap-0.5 rounded-md border p-1 shadow-sm backdrop-blur">
      {MODES.map((m) => (
        <Button
          key={m.mode}
          size="sm"
          variant={mode === m.mode ? "default" : "ghost"}
          className="h-7 justify-start px-2 text-[10px]"
          onClick={() => onChange(m.mode)}
          aria-label={`Modo de mapa: ${m.label}`}
          title={`Modo: ${m.label}`}
        >
          {m.icon}
          <span className="ml-1 hidden sm:inline">{m.label}</span>
        </Button>
      ))}
    </div>
  );
}

/**
 * Calcula a cor de um país baseada no modo de mapa seleccionado.
 * Devolve a cor hexadecimal para preenchimento do path.
 */
export function getColorForMapMode(
  country: { cor: string; exercito: number; pib: number; reputacao?: number; estabilidade: number; refugiadosAcolhidos?: number; refugiadosGerados?: number },
  mode: MapMode,
): string {
  switch (mode) {
    case "politico":
      return country.cor;
    case "forca": {
      const pct = Math.min(1, country.exercito / 500);
      return interpolateColor(pct);
    }
    case "pib": {
      const logPib = Math.log10(Math.max(1, country.pib));
      const pct = Math.max(0, Math.min(1, (logPib - 10) / 3));
      return interpolateColor(pct);
    }
    case "reputacao": {
      const rep = country.reputacao ?? 0;
      const pct = (rep + 100) / 200;
      return interpolateColor(pct);
    }
    case "estabilidade": {
      const pct = country.estabilidade / 100;
      return interpolateColor(pct);
    }
    case "refugiados": {
      // Modo refugiados: países que geraram refugiados = vermelho;
      // países que acolheram = verde; sem refugiados = cinzento.
      const gerados = country.refugiadosGerados ?? 0;
      const acolhidos = country.refugiadosAcolhidos ?? 0;
      if (gerados > 0 && acolhidos > 0) {
        // Mistura: laranja (origem + destino).
        return "#ea580c";
      }
      if (gerados > 0) {
        // Vermelho (origem de refugiados).
        const pct = Math.min(1, Math.log10(Math.max(1, gerados)) / 6); // 1M refugiados = 100%
        return `rgb(${220},${Math.round(38 + (1-pct)*100)},38)`;
      }
      if (acolhidos > 0) {
        // Verde (acolhimento).
        const pct = Math.min(1, Math.log10(Math.max(1, acolhidos)) / 6);
        return `rgb(${Math.round(220 - pct*200)},${Math.round(38 + pct*165)},${Math.round(38 + pct*40)})`;
      }
      return "#9ca3af"; // cinzento (sem refugiados)
    }
  }
}

/** Interpola de vermelho (0) → amarelo (0.5) → verde (1). */
function interpolateColor(pct: number): string {
  const clamped = Math.max(0, Math.min(1, pct));
  if (clamped < 0.5) {
    // Vermelho → amarelo.
    const t = clamped * 2;
    const r = 220;
    const g = Math.round(38 + (202 - 38) * t);
    const b = Math.round(38 + (70 - 38) * t);
    return `rgb(${r},${g},${b})`;
  } else {
    // Amarelo → verde.
    const t = (clamped - 0.5) * 2;
    const r = Math.round(220 + (22 - 220) * t);
    const g = Math.round(202 + (163 - 202) * t);
    const b = Math.round(70 + (74 - 70) * t);
    return `rgb(${r},${g},${b})`;
  }
}
