// src/components/game/BudgetPanel.tsx
// Painel «Orçamento»: 4 sliders (economia, exército, saúde/educação, segurança)
// + 3 sliders de política fiscal (renda, capital, mercadorias) — Fase 5.
// Mostra receita fiscal estimada e evasão.

"use client";

import { useGameStore } from "@/lib/state";
import { budgetTotal, normalizeBudget, BUDGET_DEFAULT, calculateTaxRevenue, TAX_POLICY_BY_REGIME } from "@/lib/engine";
import type { BudgetAllocation, TaxPolicy } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Coins, Shield, Heart, Lock, Percent } from "lucide-react";
import { useId } from "react";

export function BudgetPanel() {
  const state = useGameStore((s) => s.state);
  const setBudget = useGameStore((s) => s.setBudget);
  const setTaxPolicy = useGameStore((s) => s.setTaxPolicy);

  if (!state) return null;

  const budget: BudgetAllocation = state.playerBudget ?? BUDGET_DEFAULT;
  const total = budgetTotal(budget);
  const overspent = total > 100;

  // Política fiscal do jogador (ou default do regime).
  const playerCountry = state.playerCountryId ? state.paises[state.playerCountryId] : null;
  const taxPolicy: TaxPolicy = state.playerTaxPolicy
    ?? playerCountry?.taxPolicy
    ?? (playerCountry ? TAX_POLICY_BY_REGIME[playerCountry.regime] : { taxa: 20, taxaCapital: 15, taxaMercadorias: 10 });

  // Receita fiscal estimada (mensal).
  const receitaFiscalEstimada = playerCountry
    ? calculateTaxRevenue(playerCountry, taxPolicy)
    : 0;
  // Evasão: base 5% + 0.5% por ponto de estabilidade < 50.
  const evasao = playerCountry
    ? Math.min(0.30, 0.05 + Math.max(0, (50 - playerCountry.estabilidade) * 0.005))
    : 0.05;

  function handleChange(field: keyof BudgetAllocation, value: number) {
    const next: BudgetAllocation = { ...budget, [field]: value };
    setBudget(next);
  }

  function handleTaxChange(field: keyof TaxPolicy, value: number) {
    const next: TaxPolicy = { ...taxPolicy, [field]: value };
    setTaxPolicy(next);
  }

  function handleReset() {
    setBudget({ ...BUDGET_DEFAULT });
  }

  function handleResetTax() {
    if (playerCountry) {
      setTaxPolicy({ ...TAX_POLICY_BY_REGIME[playerCountry.regime] });
    }
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Orçamento & Impostos</CardTitle>
        <CardDescription>
          Distribui o tesouro por setores e define a política fiscal. Soma &gt; 100% é escalada.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 overflow-hidden">
        <div className="space-y-3">
          <BudgetSlider
            field="economia"
            label="Economia"
            description="Impulsiona o crescimento do PIB (retornos decrescentes)."
            icon={<Coins className="size-4" />}
            value={budget.economia}
            onChange={(v) => handleChange("economia", v)}
          />
          <BudgetSlider
            field="exercito"
            label="Exército"
            description="Aumenta orçamento militar, tropas e força gradualmente."
            icon={<Shield className="size-4" />}
            value={budget.exercito}
            onChange={(v) => handleChange("exercito", v)}
          />
          <BudgetSlider
            field="saudeEducacao"
            label="Saúde e educação"
            description="Sobe estabilidade/aprovação; atrai multinacionais."
            icon={<Heart className="size-4" />}
            value={budget.saudeEducacao}
            onChange={(v) => handleChange("saudeEducacao", v)}
          />
          <BudgetSlider
            field="seguranca"
            label="Segurança"
            description="Estabilidade extra; reduz risco de golpe."
            icon={<Lock className="size-4" />}
            value={budget.seguranca}
            onChange={(v) => handleChange("seguranca", v)}
          />
        </div>

        <div className="flex items-center justify-between rounded-md border px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">Total distribuído</span>
          <span
            className={`font-semibold tabular-nums ${
              overspent ? "text-destructive" : total === 100 ? "text-emerald-600" : ""
            }`}
          >
            {total.toFixed(0)}%
            {overspent ? " (será escalado)" : total < 100 ? " (poupança)" : ""}
          </span>
        </div>

        {/* Fase 5 — Política fiscal */}
        <div className="space-y-2 rounded-md border border-blue-500/30 bg-blue-500/5 p-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <Percent className="size-3.5 text-blue-600" />
            Política fiscal (impostos)
          </div>
          <TaxSlider
            label="Rendimento (trabalho)"
            value={taxPolicy.taxa}
            max={50}
            onChange={(v) => handleTaxChange("taxa", v)}
          />
          <TaxSlider
            label="Capital (lucros)"
            value={taxPolicy.taxaCapital}
            max={50}
            onChange={(v) => handleTaxChange("taxaCapital", v)}
          />
          <TaxSlider
            label="Mercadorias (IVA)"
            value={taxPolicy.taxaMercadorias}
            max={30}
            onChange={(v) => handleTaxChange("taxaMercadorias", v)}
          />
          <div className="space-y-0.5 text-[11px] leading-snug">
            <p className="text-muted-foreground">
              Receita fiscal estimada: <span className="font-semibold tabular-nums text-foreground">${formatCompact(receitaFiscalEstimada)}/mês</span>
            </p>
            <p className="text-muted-foreground">
              Evasão fiscal: <span className="font-semibold tabular-nums text-foreground">{(evasao * 100).toFixed(1)}%</span>
              <span className="text-muted-foreground"> (cai com estabilidade alta)</span>
            </p>
          </div>
        </div>

        <div className="mt-auto flex items-center gap-2">
          <Button
            onClick={() => setBudget(normalizeBudget(budget))}
            variant="outline"
            size="sm"
            className="flex-1"
            aria-label="Normalizar orçamento (soma 100%)"
          >
            Normalizar
          </Button>
          <Button onClick={handleReset} variant="outline" size="sm" aria-label="Repor orçamento equilibrado">
            Repor
          </Button>
          <Button onClick={handleResetTax} variant="outline" size="sm" aria-label="Repor impostos do regime">
            Imp. regime
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface BudgetSliderProps {
  field: keyof BudgetAllocation;
  label: string;
  description: string;
  icon: React.ReactNode;
  value: number;
  onChange: (v: number) => void;
}

function BudgetSlider({ label, description, icon, value, onChange }: BudgetSliderProps) {
  const id = useId();
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="flex items-center gap-1.5 text-xs font-medium">
          {icon}
          {label}
        </Label>
        <span className="text-xs font-semibold tabular-nums">{value.toFixed(0)}%</span>
      </div>
      <Slider
        id={id}
        min={0}
        max={100}
        step={1}
        value={[Math.round(value)]}
        onValueChange={(v) => onChange(v[0] ?? 0)}
      />
      <p className="text-muted-foreground text-xs leading-snug">{description}</p>
    </div>
  );
}

function TaxSlider({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (v: number) => void }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-[11px] font-medium">{label}</Label>
        <span className="text-xs font-semibold tabular-nums">{value.toFixed(0)}%</span>
      </div>
      <Slider
        id={id}
        min={0}
        max={max}
        step={1}
        value={[Math.round(value)]}
        onValueChange={(v) => onChange(v[0] ?? 0)}
      />
    </div>
  );
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
