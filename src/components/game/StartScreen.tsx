// src/components/game/StartScreen.tsx
// Ecrã inicial: cenário, país, nível de realismo e botão «Começar».
// Mostra também as 3 ranhuras de save e botões de importar/exportar.

"use client";

import { useState } from "react";
import { useGameStore, type NewGameInput } from "@/lib/state";
import {
  listSlots,
  loadFromSlot,
  importFromFile,
  type SaveSlot,
} from "@/lib/state";
import type { RealismLevel } from "@/types";
import { SCENARIOS } from "@/data/scenarios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatDatePT } from "@/lib/state";

const REALISMOS: { value: RealismLevel; label: string; descricao: string }[] = [
  {
    value: "casual",
    label: "Casual",
    descricao: "Consequências mais ligeiras; o jogo perdoa decisões arriscadas.",
  },
  {
    value: "normal",
    label: "Normal",
    descricao: "Consequências proporcionais e realistas. Experiência padrão.",
  },
  {
    value: "brutal",
    label: "Brutal",
    descricao: "Erros custam caro; superpotências raramente perdoam.",
  },
];

export function StartScreen() {
  const newGame = useGameStore((s) => s.newGame);
  const loadState = useGameStore((s) => s.loadState);
  const setErro = useGameStore((s) => s.setErro);
  const erro = useGameStore((s) => s.erro);

  // Lazy initializers: StartScreen só monta após hidratação (ver page.tsx),
  // por isso é seguro ler localStorage aqui.
  const [scenarioId, setScenarioId] = useState<string>(SCENARIOS[0]?.id ?? "");
  const [countryId, setCountryId] = useState<string>(SCENARIOS[0]?.paises[0]?.id ?? "");
  const [realism, setRealism] = useState<RealismLevel>("normal");
  const [slots, setSlots] = useState(() => listSlots());

  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];

  // countryId efectivo: se não existir no cenário atual, cair para o primeiro país.
  const countryIds = new Set(scenario?.paises.map((p) => p.id) ?? []);
  const effectiveCountryId = countryId && countryIds.has(countryId)
    ? countryId
    : (scenario?.paises[0]?.id ?? "");

  function handleStart() {
    if (!scenario || !effectiveCountryId) {
      setErro("Escolhe um cenário e um país antes de continuar.");
      return;
    }
    const input: NewGameInput = {
      scenarioId,
      playerCountryId: effectiveCountryId,
      realism,
    };
    newGame(input);
  }

  function handleLoad(slot: SaveSlot) {
    try {
      const state = loadFromSlot(slot);
      loadState(state);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao carregar ranhura");
    }
    // Atualiza a lista de ranhuras para refletir ocupação atual.
    setSlots(listSlots());
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const state = importFromFile(text);
        loadState(state);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro ao importar";
        setErro(`Importação falhou: ${msg}`);
      }
    };
    reader.readAsText(file);
    // limpa o input para permitir re-importar o mesmo ficheiro
    e.target.value = "";
  }

  // Quando o cenário muda, esvaziamos a seleção de país — o `effectiveCountryId`
  // volta a ser o primeiro país do novo cenário, sem precisar de useEffect.
  function handleScenarioChange(newScenarioId: string) {
    setScenarioId(newScenarioId);
    setCountryId("");
    setSlots(listSlots());
  }

  return (
    <main className="bg-background min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Imperium História
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Simulador de geopolítica e de presidência/liderança. Escolhe um país e
            conduz a tua nação num mundo em mudança.
          </p>
        </header>

        {erro && (
          <Alert variant="destructive">
            <AlertTitle>Erro</AlertTitle>
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* Coluna esquerda: nova partida */}
          <Card>
            <CardHeader>
              <CardTitle>Nova partida</CardTitle>
              <CardDescription>
                Define o cenário, o país que vais liderar e o nível de realismo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="scenario">Cenário</Label>
                <Select value={scenarioId} onValueChange={handleScenarioChange}>
                  <SelectTrigger id="scenario" className="w-full">
                    <SelectValue placeholder="Escolhe um cenário" />
                  </SelectTrigger>
                  <SelectContent>
                    {SCENARIOS.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {scenario && (
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {scenario.descricao}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="country">País do jogador</Label>
                <Select value={effectiveCountryId} onValueChange={setCountryId}>
                  <SelectTrigger id="country" className="w-full">
                    <SelectValue placeholder="Escolhe um país" />
                  </SelectTrigger>
                  <SelectContent>
                    {scenario?.paises.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span
                          className="bg-primary inline-block size-3 rounded-full"
                          style={{ backgroundColor: c.cor }}
                          aria-hidden
                        />{" "}
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Nível de realismo</Label>
                <RadioGroup
                  value={realism}
                  onValueChange={(v) => setRealism(v as RealismLevel)}
                  className="grid gap-2"
                >
                  {REALISMOS.map((r) => (
                    <Label
                      key={r.value}
                      htmlFor={`real-${r.value}`}
                      className="has-[:checked]:border-primary has-[:checked]:bg-accent flex cursor-pointer items-start gap-3 rounded-md border p-3"
                    >
                      <RadioGroupItem
                        id={`real-${r.value}`}
                        value={r.value}
                        className="mt-1"
                      />
                      <span className="space-y-1">
                        <span className="block text-sm font-medium">{r.label}</span>
                        <span className="text-muted-foreground block text-xs leading-relaxed">
                          {r.descricao}
                        </span>
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>

              <Button className="w-full" size="lg" onClick={handleStart}>
                Começar
              </Button>
            </CardContent>
          </Card>

          {/* Coluna direita: continuar/importar */}
          <Card>
            <CardHeader>
              <CardTitle>Continuar</CardTitle>
              <CardDescription>
                Retoma uma partida guardada ou importa um ficheiro JSON.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Ranhuras guardadas</Label>
                <ul className="space-y-2">
                  {slots.map((s) => (
                    <li key={s.slot}>
                      <SaveSlotRow slot={s} onLoad={handleLoad} />
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2">
                <Label htmlFor="import">Importar ficheiro JSON</Label>
                <input
                  id="import"
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImport}
                  className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:hover:bg-accent"
                />
                <p className="text-muted-foreground text-xs">
                  O ficheiro é validado com zod antes de ser carregado. JSON inválido
                  mostra um erro claro e não altera o estado atual.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

function SaveSlotRow({
  slot,
  onLoad,
}: {
  slot: ReturnType<typeof listSlots>[number];
  onLoad: (slot: SaveSlot) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
      <div className="min-w-0 flex-1">
        {slot.ocupado ? (
          <div className="space-y-0.5">
            <p className="truncate text-sm font-medium">
              {slot.playerCountryNome ?? slot.playerCountryId}
            </p>
            <p className="text-muted-foreground text-xs">
              {slot.dataAtual ? formatDatePT(slot.dataAtual) : ""} · Turno {slot.turno}
            </p>
            {slot.guardadoEm && (
              <p className="text-muted-foreground text-xs">
                Guardado em {formatDatePT(slot.guardadoEm.slice(0, 10))}
              </p>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Ranhura {slot.slot} — vazia
          </p>
        )}
      </div>
      <Button
        size="sm"
        variant={slot.ocupado ? "default" : "outline"}
        disabled={!slot.ocupado}
        onClick={() => onLoad(slot.slot)}
      >
        Carregar
      </Button>
    </div>
  );
}
