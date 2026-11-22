// src/components/game/GameScreen.tsx
// Ecrã principal do jogo.
// Fase 1 (tempo real): o jogo NÃO é por turnos — existe um relógio global que
// avança dia a dia via setInterval (loop separado da UI). Pausa/velocidade
// (0.5x-10x) na barra superior + atalhos: espaço = pausar, +/- = velocidade.
// O motor mensal corre automaticamente quando o mês rola. Autosave mensal.
//
// Layout: barra superior (país, relógio, stats, ações), mapa ao centro,
// painel do país + ranking à direita (gaveta em mobile), caixa de ordens +
// orçamento + diário no fundo.

"use client";

import { useEffect, useState } from "react";
import {
  useGameStore,
  saveToSlot,
  exportToFile,
  clearAutosave,
  autosave,
  type SaveSlot,
} from "@/lib/state";
import { WorldMap } from "@/components/game/WorldMap";
import { CountryPanel } from "@/components/game/CountryPanel";
import { BudgetPanel } from "@/components/game/BudgetPanel";
import { DiaryTimeline } from "@/components/game/DiaryTimeline";
import { OrderBox } from "@/components/game/OrderBox";
import { EventModal } from "@/components/game/EventModal";
import { RankingPanel } from "@/components/game/RankingPanel";
import { MandateSummary } from "@/components/game/MandateSummary";
import { TimeControls } from "@/components/game/TimeControls";
import { NewsPanel } from "@/components/game/NewsPanel";
import { MissionsPanel } from "@/components/game/MissionsPanel";
import { TechTreePanel } from "@/components/game/TechTreePanel";
import { AdvisorsPanel } from "@/components/game/AdvisorsPanel";
import { EspionagePanel } from "@/components/game/EspionagePanel";
import { ElectionBanner } from "@/components/game/ElectionBanner";
import { BlocVoteModal } from "@/components/game/BlocVoteModal";
import { tickIntervalMs, nextSpeed, prevSpeed } from "@/lib/engine/clock";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  Save,
  Download,
  Menu as MenuIcon,
  Coins,
  Shield,
  ThumbsUp,
} from "lucide-react";
import type { GameState, Country } from "@/types";

export function GameScreen() {
  const state = useGameStore((s) => s.state);
  const clear = useGameStore((s) => s.clear);
  const setErro = useGameStore((s) => s.setErro);
  const erro = useGameStore((s) => s.erro);

  // --- Relógio global (Fase 1) -------------------------------------------
  const pausado = state?.timeState.pausado ?? true;
  const velocidade = state?.timeState.velocidade ?? 1;
  const turno = state?.turno ?? 0;
  const pendingEventId = state?.pendingEvent?.evento.id ?? null;

  // Game loop: setInterval controlado pela velocidade. Usa getState() para
  // não recriar o interval a cada render; só muda quando pausa/velocidade mudam.
  useEffect(() => {
    if (!state || pausado) return;
    const ms = tickIntervalMs(velocidade);
    const id = setInterval(() => {
      useGameStore.getState().tickDay();
    }, ms);
    return () => clearInterval(id);
  }, [pausado, velocidade, !!state]);

  // Atalhos de teclado: espaço = pausar/continuar; +/- = velocidade.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ignora atalhos quando o jogador está a escrever em campos de texto.
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.code === "Space") {
        e.preventDefault();
        useGameStore.getState().togglePause();
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        const st = useGameStore.getState().state;
        if (st) useGameStore.getState().setSpeed(nextSpeed(st.timeState.velocidade));
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        const st = useGameStore.getState().state;
        if (st) useGameStore.getState().setSpeed(prevSpeed(st.timeState.velocidade));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Autosave: apenas quando o mês rola (turno) ou surge um evento pendente —
  // evita escrever em localStorage a cada dia de jogo.
  useEffect(() => {
    if (state) {
      autosave(state);
    }
  }, [turno, pendingEventId, state]);

  const [slotDialogOpen, setSlotDialogOpen] = useState(false);
  const [selectedCountryId, setSelectedCountryId] = useState<string | null>(null);
  const [panelOpenMobile, setPanelOpenMobile] = useState(false);

  if (!state) return null;

  const playerCountry = state.playerCountryId ? state.paises[state.playerCountryId] : null;
  if (!playerCountry) {
    return (
      <main className="bg-background min-h-screen p-6">
        <div className="bg-destructive/10 text-destructive rounded-md border p-4 text-sm">
          País do jogador em falta. Volta ao menu para criar uma nova partida.
        </div>
        <Button className="mt-4" variant="outline" onClick={clear}>
          Voltar ao menu
        </Button>
      </main>
    );
  }

  function handleExport() {
    if (!state) return;
    const json = exportToFile(state);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `imperium-${state.config.scenarioId}-${state.dataAtual}-t${state.turno}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleSave(slot: SaveSlot) {
    if (!state) return;
    const ok = saveToSlot(state, slot);
    if (!ok) {
      setErro("Não foi possível guardar (localStorage inacessível?).");
    } else {
      setSlotDialogOpen(false);
    }
  }

  function handleBackToMenu() {
    clear();
    clearAutosave();
  }

  function handleSelectCountry(id: string | null) {
    setSelectedCountryId(id);
    if (id) {
      setPanelOpenMobile(true);
    }
  }

  function handleClosePanelMobile() {
    setPanelOpenMobile(false);
    setSelectedCountryId(null);
  }

  return (
    <div className="bg-background flex min-h-screen flex-col">
      {/* Barra superior */}
      <TopBar
        state={state}
        playerCountry={playerCountry}
        onExport={handleExport}
        onMenu={handleBackToMenu}
        saveDialogOpen={slotDialogOpen}
        onSaveDialogChange={setSlotDialogOpen}
        onSaveSlot={handleSave}
      />

      {erro && (
        <div className="bg-destructive/10 text-destructive border-b px-4 py-2 text-sm sm:px-6">
          {erro}
        </div>
      )}

      {/* Bloco A2 — Banner de eleições próximas */}
      <ElectionBanner />

      {/* Conteúdo: mapa + painel */}
      <main className="flex flex-1 flex-col gap-3 p-3 lg:flex-row lg:p-4">
        {/* Mapa */}
        <section
          className="bg-card relative flex-1 overflow-hidden rounded-lg border shadow-sm"
          style={{ minHeight: "320px" }}
        >
          <WorldMap
            selectedCountryId={selectedCountryId}
            onSelectCountry={handleSelectCountry}
          />
        </section>

        {/* Painel do país + ranking — empilhados em ecrã grande */}
        <aside className="hidden w-full max-w-md flex-col gap-3 lg:flex">
          <div className="flex-1">
            <CountryPanel
              state={state}
              countryId={selectedCountryId}
              onClose={() => setSelectedCountryId(null)}
            />
          </div>
          <div style={{ minHeight: "240px" }}>
            <RankingPanel />
          </div>
        </aside>
      </main>

      {/* Drawer mobile do painel do país */}
      <Sheet
        open={panelOpenMobile && selectedCountryId !== null}
        onOpenChange={(open) => {
          if (!open) handleClosePanelMobile();
        }}
      >
        <SheetContent side="right" className="w-full p-3 sm:max-w-md" aria-describedby={undefined}>
          <VisuallyHidden>
            <DialogTitle>Painel do país</DialogTitle>
            <DialogDescription>
              Detalhes do país selecionado no mapa.
            </DialogDescription>
          </VisuallyHidden>
          <CountryPanel
            state={state}
            countryId={selectedCountryId}
            onClose={handleClosePanelMobile}
          />
        </SheetContent>
      </Sheet>

      {/* Modal de evento pendente */}
      <EventModal />

      {/* Bloco A3 — Modal de votação em bloco */}
      <BlocVoteModal />

      {/* Reserva inferior: caixa de ordens + orçamento + tabs */}
      <BottomReserve selectedCountryId={selectedCountryId} />
    </div>
  );
}

interface TopBarProps {
  state: GameState;
  playerCountry: Country;
  onExport: () => void;
  onMenu: () => void;
  saveDialogOpen: boolean;
  onSaveDialogChange: (open: boolean) => void;
  onSaveSlot: (slot: SaveSlot) => void;
}

function TopBar({
  state,
  playerCountry,
  onExport,
  onMenu,
  saveDialogOpen,
  onSaveDialogChange,
  onSaveSlot,
}: TopBarProps) {
  return (
    <header className="bg-card border-b">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-4">
        {/* Esquerda: país + relógio (data, pausa, velocidades) */}
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="border-border inline-block size-3 shrink-0 rounded-full border"
            style={{ backgroundColor: playerCountry.cor }}
            aria-hidden
          />
          <div className="min-w-0 hidden sm:block">
            <p className="truncate text-xs font-semibold leading-tight sm:text-sm">
              {playerCountry.nome}
            </p>
            <p className="text-muted-foreground text-xs">
              Mês {state.turno} · {playerCountry.lider}
            </p>
          </div>
          <TimeControls />
        </div>

        {/* Centro: stats do jogador */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <StatChip
            icon={<Coins className="size-3.5" />}
            label="Tesouro"
            value={`$${formatCompact(playerCountry.tesouro)}`}
          />
          <StatChip
            icon={<Shield className="size-3.5" />}
            label="Estab."
            value={`${playerCountry.estabilidade}`}
            accent={barColor(playerCountry.estabilidade)}
          />
          <StatChip
            icon={<ThumbsUp className="size-3.5" />}
            label="Aprov."
            value={`${playerCountry.aprovacao}`}
            accent={barColor(playerCountry.aprovacao)}
          />
        </div>

        {/* Direita: ações */}
        <div className="flex flex-wrap items-center gap-1 sm:gap-2">
          <MandateSummary />
          <Dialog open={saveDialogOpen} onOpenChange={onSaveDialogChange}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" aria-label="Guardar partida">
                <Save className="size-4" />
                <span className="hidden sm:inline">Guardar</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Guardar partida</DialogTitle>
                <DialogDescription>
                  Escolhe a ranhura onde guardar. Substitui qualquer jogo guardado
                  anteriormente nessa ranhura.
                </DialogDescription>
              </DialogHeader>
              <SaveSlotPicker onSave={onSaveSlot} />
            </DialogContent>
          </Dialog>
          <Button size="sm" variant="outline" onClick={onExport} aria-label="Exportar JSON">
            <Download className="size-4" />
            <span className="hidden sm:inline">Exportar</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={onMenu} aria-label="Voltar ao menu">
            <MenuIcon className="size-4" />
            <span className="hidden sm:inline">Menu</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

function StatChip({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="bg-muted/50 flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs">
      <span className="text-muted-foreground" style={accent ? { color: accent } : undefined}>
        {icon}
      </span>
      <span className="text-muted-foreground hidden sm:inline">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

interface BottomReserveProps {
  selectedCountryId: string | null;
}

function BottomReserve({ selectedCountryId }: BottomReserveProps) {
  // Fase 11 + Bloco A1 — Sistema de tabs com 6 painéis (adicionado Espionagem).
  const [activeTab, setActiveTab] = useState<"diario" | "noticias" | "missoes" | "tech" | "conselheiros" | "espionagem">("diario");

  const tabs: { id: typeof activeTab; label: string }[] = [
    { id: "diario", label: "Diário" },
    { id: "noticias", label: "Notícias" },
    { id: "missoes", label: "Missões" },
    { id: "tech", label: "Tech" },
    { id: "conselheiros", label: "Conselheiros" },
    { id: "espionagem", label: "Espionagem" },
  ];

  return (
    <footer className="border-t bg-muted/30 px-3 py-3 sm:px-4">
      <div
        className="mx-auto grid max-w-screen-2xl gap-2 lg:grid-cols-3"
        style={{ minHeight: "260px", maxHeight: "55vh" }}
      >
        <OrderBox />
        <BudgetPanel />
        {/* Coluna direita: tabs */}
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap gap-0.5 rounded-md border bg-card p-0.5">
            {tabs.map((t) => (
              <Button
                key={t.id}
                size="sm"
                variant={activeTab === t.id ? "default" : "ghost"}
                className="h-7 flex-1 text-[11px]"
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </Button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {activeTab === "diario" && <DiaryTimeline />}
            {activeTab === "noticias" && <NewsPanel />}
            {activeTab === "missoes" && <MissionsPanel />}
            {activeTab === "tech" && <TechTreePanel />}
            {activeTab === "conselheiros" && <AdvisorsPanel />}
            {activeTab === "espionagem" && <EspionagePanel alvoId={selectedCountryId} />}
          </div>
        </div>
      </div>
    </footer>
  );
}

function SaveSlotPicker({ onSave }: { onSave: (slot: SaveSlot) => void }) {
  const [slot, setSlot] = useState<SaveSlot>(1);
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="slot">Ranhura</Label>
        <Select value={String(slot)} onValueChange={(v) => setSlot(Number(v) as SaveSlot)}>
          <SelectTrigger id="slot" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3].map((n) => (
              <SelectItem key={n} value={String(n)}>
                Ranhura {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button onClick={() => onSave(slot)}>Guardar</Button>
      </DialogFooter>
    </div>
  );
}

// --- Helpers --------------------------------------------------------------

function barColor(value: number): string {
  if (value > 60) return "#16a34a";
  if (value > 30) return "#f59e0b";
  return "#dc2626";
}

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(1)} T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)} MM`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)} M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)} k`;
  return `${sign}${abs}`;
}
