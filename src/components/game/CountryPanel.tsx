// src/components/game/CountryPanel.tsx
// Painel do país: dados económicos, regime, relação com o jogador, tratados
// e guerras ativas. Suporta país nulo (país «sem dados» no mapa).
// Fase 5: adiciona botões de diplomacia (propor tratados) e ação de paz em guerras.

"use client";

import type { GameState, Country, Treaty, War, DiplomaticProposalType, WarObjective } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGameStore } from "@/lib/state";
import { calculateMilitaryStrength, calculatePoliticalInfluence, calculateAttractiveness, getEffectiveTaxPolicy, calculateTaxRevenue, getReputationLabel, getReputationColor } from "@/lib/engine";
import { BLOCOS } from "@/data/blocs";
import { moedaDoPais } from "@/data/currencies";
import { X, Flag, Swords, Handshake, Scroll as ScrollIcon, Crosshair, Radiation, Users, Crown, Coins, Building2, Vote, Globe2, TrendingDown, Plane } from "lucide-react";

export interface CountryPanelProps {
  state: GameState;
  /** ID do país selecionado. null = país sem dados. */
  countryId: string | null;
  onClose: () => void;
}

const PROPOSAL_TYPES: { tipo: DiplomaticProposalType; label: string }[] = [
  { tipo: "alianca", label: "Aliança" },
  { tipo: "comercio", label: "Comércio" },
  { tipo: "nao_agressao", label: "Não-agressão" },
  { tipo: "paz", label: "Paz" },
  { tipo: "ultimato", label: "Ultimato" },
];

export function CountryPanel({ state, countryId, onClose }: CountryPanelProps) {
  const proposeTreaty = useGameStore((s) => s.proposeTreaty);
  const declareWar = useGameStore((s) => s.declareWar);
  const signPeace = useGameStore((s) => s.signPeace);
  const annexCountry = useGameStore((s) => s.annexCountry);
  const conquerBySurrender = useGameStore((s) => s.conquerBySurrender);
  const conquerByPopularPressure = useGameStore((s) => s.conquerByPopularPressure);
  const conquerByDiplomacy = useGameStore((s) => s.conquerByDiplomacy);
  const joinBloc = useGameStore((s) => s.joinBloc);
  const leaveBloc = useGameStore((s) => s.leaveBloc);
  const proposeBlocVote = useGameStore((s) => s.proposeBlocVote);
  const supportRebels = useGameStore((s) => s.supportRebels);
  const cancelProxy = useGameStore((s) => s.cancelProxy);

  const country = countryId ? state.paises[countryId] : null;

  if (!country) {
    return (
      <Card className="flex h-full flex-col">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">País sem dados</CardTitle>
          <Button size="icon" variant="ghost" className="size-7" onClick={onClose} aria-label="Fechar">
            <X className="size-4" />
          </Button>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center text-center">
          <p className="text-muted-foreground text-sm">
            Este país não faz parte do cenário «{state.config.scenarioId}».
            Apenas os 57 países detalhados têm dados completos.
          </p>
        </CardContent>
      </Card>
    );
  }

  const relacao = countryId ? findRelation(state, countryId, state.playerCountryId) : null;
  const tratadosAtivos = listActiveTreaties(state, countryId);
  const guerrasAtivas = listActiveWars(state, countryId);
  const isPlayer = country.donoJogador;
  const emGuerraComJogador = guerrasAtivas.some(
    (g) => g.agressor === state.playerCountryId || g.defensores.includes(state.playerCountryId ?? ""),
  );
  const podePropor = !isPlayer && !emGuerraComJogador;
  const haTratadoPaz = state.tratados.some(
    (t) =>
      !t.rompido &&
      (t.tipo === "paz" || t.tipo === "nao_agressao") &&
      t.paises.includes(countryId) &&
      t.paises.includes(state.playerCountryId ?? ""),
  );
  const podeDeclararGuerra = !isPlayer && !emGuerraComJogador && !haTratadoPaz;
  const provinciasDoPais = Object.values(state.provincias)
    .filter((p) => p.countryId === countryId);

  // Pode anexar: país não é o jogador e não tem províncias próprias
  // (perdeu todas para o jogador ou foram cedidas). Mesmo que a guerra
  // já tenha terminada, o jogador pode decidir anexar manualmente.
  const podeAnexar = !isPlayer && provinciasDoPais.length === 0;

  // Métricas realistas (Fase 2): Força Militar e Influência Política (0-100).
  const forcaMilitar = calculateMilitaryStrength(country);
  const influenciaPolitica = calculatePoliticalInfluence(country, state);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0 pb-3">
        <div className="flex items-center gap-3">
          <span
            className="border-border inline-flex size-9 shrink-0 items-center justify-center rounded-md border shadow-sm"
            style={{ backgroundColor: country.cor }}
            aria-hidden
          >
            <Flag className="size-4 text-white/90 drop-shadow" />
          </span>
          <div className="min-w-0">
            <CardTitle className="truncate text-base leading-tight">{country.nome}</CardTitle>
            <p className="text-muted-foreground text-xs">
              {country.id} · {translateRegime(country.regime)}
            </p>
          </div>
        </div>
        <Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={onClose} aria-label="Fechar painel">
          <X className="size-4" />
        </Button>
      </CardHeader>
      <ScrollArea className="flex-1 overflow-hidden">
        <CardContent className="space-y-4 text-sm">
          {/* Líder */}
          {country.lider && (
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <Crown className="size-3.5" />
              Chefe de Estado/governo: <span className="text-foreground font-medium">{country.lider}</span>
            </p>
          )}

          {/* Métricas realistas (Fase 2): Força Militar + Influência Política */}
          <Section title="Força & Influência">
            <div className="space-y-1.5">
              <MetricBar label="Força Militar" value={forcaMilitar} hint={forceLabel(forcaMilitar)} />
              <MetricBar label="Influência Política" value={influenciaPolitica} hint={influenceLabel(influenciaPolitica)} />
            </div>
          </Section>

          {/* Indicadores base */}
          <Section title="Indicadores">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <Stat label="População" value={formatNumber(country.populacao)} />
              <Stat label="PIB" value={`$${formatCompact(country.pib)}`} />
              <Stat label="Tesouro" value={`$${formatCompact(country.tesouro)}`} />
              <Stat label="Exército" value={country.exercito.toString()} />
              <Stat label="Estabilidade" value={`${country.estabilidade}/100`} />
              <Stat label="Aprovação" value={`${country.aprovacao}/100`} />
            </dl>
            <Bars estabilidade={country.estabilidade} aprovacao={country.aprovacao} />
          </Section>

          {/* Dados militares realistas (Fase 2) */}
          <Section title="Dados militares">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <Stat label="Tropas ativas" value={formatNumber(country.tropas)} icon={<Users className="size-3.5" />} />
              <Stat label="Orçamento militar" value={`$${formatCompact(country.orcamentoMilitar)}/ano`} />
              <Stat
                label="Arsenal nuclear"
                value={country.nuclear ? "Sim" : "Não"}
                icon={country.nuclear ? <Radiation className="size-3.5 text-amber-600" /> : undefined}
              />
              <Stat label="Moeda" value={moedaDoPais(country.id).codigo} icon={<Coins className="size-3.5" />} />
            </dl>
          </Section>

          {/* Fase 5 — Economia e política fiscal */}
          <Section title="Economia e fiscal" icon={<Coins className="size-4" />}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <Stat label="Attractividade (multinacionais)" value={`${calculateAttractiveness(country, getEffectiveTaxPolicy(country, state), state).toFixed(0)}/100`} />
              <Stat label="Receita fiscal estimada" value={`$${formatCompact(calculateTaxRevenue(country, getEffectiveTaxPolicy(country, state)))}/mês`} />
            </dl>
            <p className="text-muted-foreground text-[11px] leading-snug">
              Política fiscal: renda {(getEffectiveTaxPolicy(country, state).taxa).toFixed(0)}% ·
              capital {(getEffectiveTaxPolicy(country, state).taxaCapital).toFixed(0)}% ·
              mercadorias {(getEffectiveTaxPolicy(country, state).taxaMercadorias).toFixed(0)}%.
              {country.donoJogador && " (editável no painel «Orçamento & Impostos»)."}
            </p>
          </Section>

          {/* Fase 5 — Multinacionais instaladas neste país */}
          {state.multinacionais.filter((m) => m.paisOperacao === country.id).length > 0 && (
            <Section title={`Multinacionais instaladas (${state.multinacionais.filter((m) => m.paisOperacao === country.id).length})`} icon={<Building2 className="size-4" />}>
              <ul className="space-y-1">
                {state.multinacionais.filter((m) => m.paisOperacao === country.id).map((m) => (
                  <li key={m.id} className="rounded-md border px-2 py-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{m.nome}</span>
                      <Badge variant="secondary" className="text-[9px]">{m.sector}</Badge>
                    </div>
                    <p className="text-muted-foreground text-[11px]">
                      Sede: {state.paises[m.sede]?.nome ?? m.sede} ·
                      Receita: ${formatCompact(m.receita)}/ano ·
                      Empregados: {formatNumber(m.empregados)}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Fase 7/8 — Mundo vivo: reputação, refugiados, proxies */}
          <Section title="Mundo & Reputação" icon={<Globe2 className="size-4" />}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <Stat
                label="Reputação mundial"
                value={`${country.reputacao ?? 0}/100`}
                icon={<TrendingDown className="size-3.5" style={{ color: getReputationColor(country.reputacao ?? 0) }} />}
              />
              <Stat
                label="Refugiados acolhidos"
                value={formatNumber(country.refugiadosAcolhidos ?? 0)}
                icon={<Plane className="size-3.5" />}
              />
              <Stat
                label="Refugiados gerados"
                value={formatNumber(country.refugiadosGerados ?? 0)}
              />
              <Stat
                label="Proxies ativos"
                value={(country.proxies ?? []).length.toString()}
              />
            </dl>
            <p className="text-xs">
              <span className="text-muted-foreground">Reputação:</span>{" "}
              <span className="font-semibold" style={{ color: getReputationColor(country.reputacao ?? 0) }}>
                {getReputationLabel(country.reputacao ?? 0)}
              </span>
            </p>

            {/* Fase 8: Guerra por procuração — só para o país do jogador como sponsor */}
            {isPlayer === false && countryId && state.playerCountryId && (
              <ProxyWarControl
                state={state}
                alvoId={countryId}
                onSupport={(alvoId) => supportRebels(alvoId)}
              />
            )}

            {/* Proxies criados por este país (lista) */}
            {(country.proxies ?? []).length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-muted-foreground text-[11px] font-semibold">Proxies apadrinhados:</p>
                <ul className="space-y-1">
                  {(country.proxies ?? []).map((proxyId) => {
                    const proxy = state.paises[proxyId];
                    const ativo = state.guerras.some((g) => g.estado === "ativa" && g.agressor === proxyId);
                    return (
                      <li key={proxyId} className="text-[11px]">
                        <div className="flex items-center gap-1">
                          <span className="font-medium">{proxy?.nome ?? proxyId}</span>
                          <Badge variant={ativo ? "default" : "secondary"} className="text-[9px]">
                            {ativo ? "em guerra" : "terminado"}
                          </Badge>
                        </div>
                        {/* Bloco A4 — Botão cancelar proxy (só para país do jogador) */}
                        {isPlayer && ativo && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="mt-0.5 h-5 text-[10px] text-destructive"
                            onClick={() => cancelProxy(proxyId)}
                            title="Cancelar apoio financeiro (proxy perde 25 estabilidade)"
                          >
                            Cancelar apoio
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </Section>

          {/* Fase 6 — Blocos políticos (com nomes em PT + ações) */}
          <Section title={`Blocos políticos (${country.blocos.length})`} icon={<Handshake className="size-4" />}>
            {country.blocos.length === 0 ? (
              <p className="text-muted-foreground text-xs">Não é membro de nenhum bloco.</p>
            ) : (
              <ul className="space-y-1">
                {country.blocos.map((blocoId) => {
                  const def = BLOCOS[blocoId];
                  const nome = def?.nome ?? blocoId;
                  const membros = Object.values(state.paises).filter((c) => c.blocos.includes(blocoId) && c.id !== country.id);
                  return (
                    <li key={blocoId} className="rounded-md border px-2 py-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{nome}</span>
                        <Badge variant="outline" className="text-[9px]">{def?.tipo ?? "?"}</Badge>
                      </div>
                      <p className="text-muted-foreground text-[11px]">
                        Membros: {membros.length + 1} ·
                        Bónus comércio interno: {((def?.bonusComercioInterno ?? 0) * 100).toFixed(2)}%/par/mês
                        {def?.moedaPartilhada ? ` · Moeda: ${def.moedaPartilhada}` : ""}
                      </p>
                      {/* Ações de bloco para o país do jogador */}
                      {isPlayer && (
                        <div className="mt-1 flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-5 text-[10px]"
                            onClick={() => proposeBlocVote(blocoId, {
                              tipo: "resolucao",
                              proposta: "Resolução política conjunta",
                              alvos: [],
                            })}
                            title="Abrir votação"
                          >
                            <Vote className="size-3" /> Votar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 text-[10px] text-destructive"
                            onClick={() => leaveBloc(blocoId)}
                            title="Sair do bloco (custo: estabilidade -5)"
                          >
                            Sair
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {/* País do jogador: juntar-se a novo bloco */}
            {isPlayer && (
              <JoinBlocControl
                country={country}
                onJoin={(blocoId) => joinBloc(blocoId)}
              />
            )}
          </Section>

          {/* Recursos económicos */}
          {country.recursos.length > 0 && (
            <Section title="Recursos económicos">
              <div className="flex flex-wrap gap-1">
                {country.recursos.map((r) => (
                  <Badge key={r} variant="secondary" className="text-[10px]">{r}</Badge>
                ))}
              </div>
            </Section>
          )}

          {/* Províncias/regiões (Fase 2 + Fase 4): cultura, lealdade, ocupação */}
          {provinciasDoPais.length > 0 && (
            <Section title={`Regiões (${provinciasDoPais.length})`}>
              <ul className="space-y-1.5">
                {provinciasDoPais.map((p) => (
                  <li key={p.id} className="space-y-1 rounded-md border px-2 py-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{p.nome}</span>
                      <span className="text-muted-foreground tabular-nums">
                        Estr. {p.valorEstrategico ?? 1}/5
                      </span>
                    </div>
                    <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>Cultura: {p.cultura ?? "—"}</span>
                      <span>·</span>
                      <span>Lealdade: {p.lealdade ?? "—"}</span>
                      {p.ocupadaPor && (
                        <>
                          <span>·</span>
                          <span className="text-red-600 dark:text-red-400">
                            Ocupada por {state.paises[p.ocupadaPor]?.nome ?? p.ocupadaPor}
                          </span>
                          {(p.mesesOcupada ?? 0) > 0 && (
                            <span className="text-amber-600 dark:text-amber-400">
                              · há {p.mesesOcupada}m
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    {/* Barra de lealdade colorida (Fase 4): mostra risco de revolta ou assimilação */}
                    {(p.lealdade ?? 50) >= 0 && (
                      <div className="bg-muted mt-0.5 h-1 overflow-hidden rounded-full">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${p.lealdade ?? 50}%`,
                            backgroundColor:
                              (p.lealdade ?? 50) > 60 ? "#16a34a"
                              : (p.lealdade ?? 50) > 30 ? "#f59e0b"
                              : "#dc2626",
                          }}
                        />
                      </div>
                    )}
                    {p.recursos && p.recursos.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {p.recursos.map((r) => (
                          <Badge key={r} variant="outline" className="text-[9px]">{r}</Badge>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {isPlayer && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1.5 text-xs">
              <p className="font-medium text-emerald-700 dark:text-emerald-300">
                És tu a liderar este país.
              </p>
            </div>
          )}

          {relacao && !isPlayer && (
            <Section title="Relação com o teu país">
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span>Inimizade</span>
                  <span className="font-medium">{relacaoLabel(relacao.valor)}</span>
                  <span>Aliança</span>
                </div>
                <RelationBar value={relacao.valor} />
                <p className="text-muted-foreground text-xs">
                  {relacao.valor > 60
                    ? "Relação muito forte; provável apoio em conflitos."
                    : relacao.valor > 20
                      ? "Relação cordial; diálogo favorável."
                      : relacao.valor > -20
                        ? "Relação neutra."
                        : relacao.valor > -60
                          ? "Relação tensa; cautela diplomática."
                          : "Relação muito hostil; risco de conflito."}
                </p>
              </div>
            </Section>
          )}

          {/* Diplomacia: propor tratados */}
          {podePropor && (
            <Section title="Diplomacia" icon={<Handshake className="size-4" />}>
              <p className="text-muted-foreground text-xs">
                Propor um tratado. A decisão é calculada pelo motor (relação, poder, interesse).
              </p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {PROPOSAL_TYPES.map((p) => (
                  <Button
                    key={p.tipo}
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => proposeTreaty(country.id, p.tipo)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </Section>
          )}

          <Section title={`Guerras ativas (${guerrasAtivas.length})`} icon={<Swords className="size-4" />}>
            {guerrasAtivas.length === 0 ? (
              <p className="text-muted-foreground text-xs">Sem guerras em curso.</p>
            ) : (
              <ul className="space-y-1.5">
                {guerrasAtivas.map((g) => {
                  const isAgressor = g.agressor === countryId;
                  const otherSide = isAgressor ? g.defensores : [g.agressor];
                  const playerSide =
                    state.playerCountryId === g.agressor || g.defensores.includes(state.playerCountryId ?? "");
                  return (
                    <li key={g.id} className="space-y-1 rounded-md border border-red-500/40 bg-red-500/5 px-2 py-1.5 text-xs">
                      <p className="font-medium">
                        {isAgressor ? "Agressor" : "Defensor"} — vs {otherSide.map((id) => state.paises[id]?.nome ?? id).join(", ")}
                      </p>
                      <p className="text-muted-foreground">
                        Início: {g.inicio} · Objetivo: {translateWarObjective(g.objetivo)}
                      </p>
                      {g.frentes.length > 0 && (
                        <ul className="ml-2 space-y-0.5 border-l pl-2">
                          {g.frentes.map((f) => (
                            <li key={f.provinceId} className="text-[11px]">
                              <span className="text-muted-foreground">{state.provincias[f.provinceId]?.nome ?? f.provinceId}:</span>{" "}
                              <span className="font-medium tabular-nums">{f.progresso.toFixed(0)}/100</span>{" "}
                              <span className="text-muted-foreground">({f.ultimoDelta >= 0 ? "+" : ""}{f.ultimoDelta.toFixed(1)})</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {playerSide && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-1 h-6 text-[11px]"
                          onClick={() => {
                            const vencedorId = state.playerCountryId ?? "";
                            signPeace(g.id, vencedorId, { retirada: true });
                          }}
                        >
                          <ScrollIcon className="size-3" /> Assinar paz (statu quo)
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {/* Declarar guerra (se permitido) — FASE 3: forma militar */}
          {podeDeclararGuerra && provinciasDoPais.length > 0 && (
            <Section title="Conquista militar" icon={<Crosshair className="size-4" />}>
              <p className="text-muted-foreground text-xs">
                Declarar guerra para conquistar uma província deste país. Custo: estabilidade −3.
                Frentes avançam até 100; população local culturalmente aparentada ajuda o invasor.
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                {provinciasDoPais.map((p) => (
                  <Button
                    key={p.id}
                    size="sm"
                    variant="destructive"
                    className="text-xs"
                    onClick={() => declareWar(country.id, [p.id], "conquistar")}
                  >
                    Conquistar {p.nome}
                  </Button>
                ))}
              </div>
            </Section>
          )}

          {/* FASE 3: Rendição — país fraco cede sem luta */}
          {podeDeclararGuerra && !isPlayer && provinciasDoPais.length > 0 && (
            <Section title="Conquista por rendição">
              <p className="text-muted-foreground text-xs">
                Forçar o país a ceder território sem combate. Só funciona se for fraco
                (estabilidade &lt; 30 OU exército &lt; 50% do teu). Cede todas as províncias
                abaixo + indemnização opcional. Cria tratado de paz.
              </p>
              <div className="space-y-1">
                <p className="text-xs">
                  <span className="text-muted-foreground">Estabilidade do alvo:</span>{" "}
                  <span className="font-medium tabular-nums">{country.estabilidade}/100</span>
                  {country.estabilidade < 30 && (
                    <Badge variant="outline" className="ml-1 text-[9px] text-emerald-600">fraco</Badge>
                  )}
                </p>
                <p className="text-xs">
                  <span className="text-muted-foreground">Exército do alvo:</span>{" "}
                  <span className="font-medium tabular-nums">{country.exercito}</span>
                  {country.exercito < (state.playerCountryId ? state.paises[state.playerCountryId].exercito * 0.5 : 0) && (
                    <Badge variant="outline" className="ml-1 text-[9px] text-emerald-600">inferior</Badge>
                  )}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => {
                    const terms = {
                      cederProvincias: provinciasDoPais.map((p) => p.id),
                      indemnizacoes: Math.round(country.tesouro * 0.2),
                    };
                    conquerBySurrender(country.id, terms);
                  }}
                >
                  Exigir rendição (cede {provinciasDoPais.length} província(s))
                </Button>
              </div>
            </Section>
          )}

          {/* FASE 3: Pressão popular — província desleal revolta-se */}
          {podeDeclararGuerra && !isPlayer && provinciasDoPais.length > 0 && (
            <Section title="Conquista por pressão popular">
              <p className="text-muted-foreground text-xs">
                Financiar revolta numa província desleal (lealdade &lt; 25) com cultura
                diferente do governo central. Custa ~50% do PIB da província do teu tesouro.
                Requer PIB &gt; 5× o da província.
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                {provinciasDoPais.map((p) => {
                  const lealdade = p.lealdade ?? 50;
                  const podePressionar = lealdade < 25;
                  return (
                    <Button
                      key={p.id}
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      disabled={!podePressionar}
                      onClick={() => conquerByPopularPressure(country.id, p.id)}
                      title={!podePressionar ? `Lealdade ${lealdade} ≥ 25 — população não revolta` : `Financiar revolta em ${p.nome}`}
                    >
                      Pressionar {p.nome}
                      <span className="text-muted-foreground ml-1 tabular-nums">
                        (leald. {lealdade})
                      </span>
                    </Button>
                  );
                })}
              </div>
            </Section>
          )}

          {/* FASE 3: Diplomacia — comprar província a país em crise */}
          {podeDeclararGuerra && !isPlayer && provinciasDoPais.length > 0 && (
            <Section title="Conquista diplomática (compra)">
              <p className="text-muted-foreground text-xs">
                Comprar uma província a um país em crise económica (tesouro &lt; 0 OU
                estabilidade &lt; 30). Preço sugerido: 5× o PIB da província. Paga do teu
                tesouro; melhora relação em +10.
              </p>
              <div className="space-y-1">
                <p className="text-xs">
                  <span className="text-muted-foreground">Estado do vendedor:</span>{" "}
                  {country.tesouro < 0 ? (
                    <Badge variant="outline" className="ml-1 text-[9px] text-red-600">em dívida</Badge>
                  ) : country.estabilidade < 30 ? (
                    <Badge variant="outline" className="ml-1 text-[9px] text-amber-600">instável</Badge>
                  ) : (
                    <Badge variant="outline" className="ml-1 text-[9px]">estável</Badge>
                  )}
                </p>
                <div className="grid grid-cols-1 gap-1.5">
                  {provinciasDoPais.map((p) => {
                    const preco = Math.round(p.pib * 5);
                    const tesouroJogador = state.playerCountryId
                      ? state.paises[state.playerCountryId].tesouro
                      : 0;
                    const podeComprar = (country.tesouro < 0 || country.estabilidade < 30) && tesouroJogador >= preco;
                    return (
                      <Button
                        key={p.id}
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        disabled={!podeComprar}
                        onClick={() => conquerByDiplomacy(country.id, p.id, preco)}
                        title={!podeComprar ? "Vendedor não está em crise ou tesouro insuficiente" : `Comprar ${p.nome}`}
                      >
                        Comprar {p.nome} — ${formatCompact(preco)}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </Section>
          )}

          {/* Anexar país (quando o país não tem províncias — conquistadas pelo jogador) */}
          {podeAnexar && (
            <Section title="Anexação" icon={<Crosshair className="size-4" />}>
              <p className="text-muted-foreground text-xs">
                Este país perdeu todas as suas províncias para ti. Podes anexá-lo para
                absorver parte do seu PIB, tesouro e exército.
              </p>
              <Button
                size="sm"
                variant="destructive"
                className="text-xs"
                onClick={() => annexCountry(country.id)}
              >
                Anexar {country.nome}
              </Button>
            </Section>
          )}

          <Section title={`Tratados ativos (${tratadosAtivos.length})`} icon={<Handshake className="size-4" />}>
            {tratadosAtivos.length === 0 ? (
              <p className="text-muted-foreground text-xs">Nenhum tratado ativo.</p>
            ) : (
              <ul className="space-y-1.5">
                {tratadosAtivos.map((t) => (
                  <li key={t.id} className="flex items-center justify-between rounded-md border px-2 py-1 text-xs">
                    <span className="font-medium">{translateTreatyType(t.tipo)}</span>
                    <span className="text-muted-foreground">
                      {t.paises
                        .filter((id) => id !== countryId)
                        .map((id) => state.paises[id]?.nome ?? id)
                        .join(", ") || "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </CardContent>
      </ScrollArea>
    </Card>
  );
}

function Section({ title, children, icon }: { title: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Controlo para o país do jogador se juntar a um novo bloco. */
function JoinBlocControl({ country, onJoin }: { country: Country; onJoin: (blocoId: string) => void }) {
  // Lista blocos disponíveis (não membro).
  const disponiveis = Object.values(BLOCOS).filter((b) => !country.blocos.includes(b.id));
  if (disponiveis.length === 0) return null;
  return (
    <div className="mt-2 space-y-1">
      <p className="text-muted-foreground text-[11px]">Candidatar-se a um bloco:</p>
      <Select onValueChange={(v) => onJoin(v)}>
        <SelectTrigger className="h-7 text-[11px]">
          <SelectValue placeholder="Escolhe um bloco..." />
        </SelectTrigger>
        <SelectContent>
          {disponiveis.map((b) => (
            <SelectItem key={b.id} value={b.id} className="text-xs">
              {b.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Controlo de guerra por procuração (Fase 8): país do jogador apadrinha rebeldes. */
function ProxyWarControl({
  state,
  alvoId,
  onSupport,
}: {
  state: GameState;
  alvoId: string;
  onSupport: (alvoId: string) => void;
}) {
  if (!state.playerCountryId) return null;
  const sponsor = state.paises[state.playerCountryId];
  const alvo = state.paises[alvoId];
  if (!sponsor || !alvo) return null;
  // Pré-condições: sponsor mais forte que alvo × 5 e tesouro > 0.
  const pibOk = sponsor.pib > alvo.pib * 5;
  const tesouroOk = sponsor.tesouro > 0;
  const jaTemProxy = (sponsor.proxies ?? []).some((pid) => pid.startsWith(`${alvoId}-PR`));
  const podeApadrinhar = pibOk && tesouroOk && !jaTemProxy && !alvo.donoJogador;
  const custo = sponsor.pib * 0.001;
  return (
    <div className="mt-2 space-y-1 rounded-md border border-red-500/30 bg-red-500/5 p-1.5">
      <p className="text-[11px] font-semibold">Guerra por procuração:</p>
      <p className="text-muted-foreground text-[10px] leading-snug">
        Apadrinhar rebeldes em {alvo.nome}. Custo: ${formatCompactLocal(custo)} do tesouro.
        Reputação: -10. Cria país rebelde que entra em guerra civil com o alvo.
      </p>
      <Button
        size="sm"
        variant="destructive"
        className="h-6 text-[10px]"
        disabled={!podeApadrinhar}
        onClick={() => onSupport(alvoId)}
        title={!podeApadrinhar ? "Sponsor precisa PIB > 5× alvo e tesouro > 0; não pode já ter proxy neste alvo" : `Apadrinhar rebeldes em ${alvo.nome}`}
      >
        <Crosshair className="size-3" /> Apadrinhar rebeldes
      </Button>
      {!pibOk && (
        <p className="text-[10px] text-amber-600">PIB do sponsor insuficiente ({formatCompactLocal(sponsor.pib)} ≤ 5× {formatCompactLocal(alvo.pib)}).</p>
      )}
      {!tesouroOk && (
        <p className="text-[10px] text-amber-600">Tesouro insuficiente.</p>
      )}
      {jaTemProxy && (
        <p className="text-[10px] text-amber-600">Já existe um proxy activo neste alvo.</p>
      )}
    </div>
  );
}

/** Helper local de formatação compacta. */
function formatCompactLocal(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)} T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)} MM`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)} M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)} k`;
  return `${sign}${abs}`;
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-muted-foreground flex items-center gap-1 text-xs">
        {icon}
        {label}
      </dt>
      <dd className="text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/** Barra de métrica 0-100 com etiqueta textual (fraco/médio/forte). */
function MetricBar({ label, value, hint }: { label: string; value: number; hint: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = pct > 60 ? "#16a34a" : pct > 30 ? "#f59e0b" : "#dc2626";
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          <span className="font-semibold">{value.toFixed(1)}</span>
          <span className="text-muted-foreground"> · {hint}</span>
        </span>
      </div>
      <div className="bg-muted h-1.5 overflow-hidden rounded-full">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

/** Etiqueta qualitativa para a Força Militar (0-100). */
function forceLabel(v: number): string {
  if (v >= 80) return "superpotência";
  if (v >= 60) return "grande potência";
  if (v >= 40) return "potência regional";
  if (v >= 20) return "força média";
  if (v >= 10) return "fraca";
  return "muito fraca";
}

/** Etiqueta qualitativa para a Influência Política (0-100). */
function influenceLabel(v: number): string {
  if (v >= 80) return "hegemónica";
  if (v >= 60) return "elevada";
  if (v >= 40) return "moderada";
  if (v >= 20) return "limitada";
  return "marginal";
}

function Bars({ estabilidade, aprovacao }: { estabilidade: number; aprovacao: number }) {
  return (
    <div className="mt-2 space-y-1.5">
      <MiniBar label="Estabilidade" value={estabilidade} />
      <MiniBar label="Aprovação" value={aprovacao} />
    </div>
  );
}

function MiniBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
      <div className="bg-muted h-1.5 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${value}%`,
            backgroundColor: value > 60 ? "#16a34a" : value > 30 ? "#f59e0b" : "#dc2626",
          }}
        />
      </div>
    </div>
  );
}

function RelationBar({ value }: { value: number }) {
  const pct = ((value + 100) / 2);
  const color = value > 20 ? "#16a34a" : value > -20 ? "#f59e0b" : "#dc2626";
  return (
    <div className="bg-muted relative h-2 overflow-hidden rounded-full">
      <div className="absolute inset-y-0 left-1/2 w-px bg-foreground/30" />
      <div
        className="absolute inset-y-0"
        style={{
          left: value >= 0 ? "50%" : `${pct}%`,
          width: value >= 0 ? `${pct - 50}%` : `${50 - pct}%`,
          backgroundColor: color,
        }}
      />
    </div>
  );
}

// --- Helpers ---------------------------------------------------------------

function findRelation(state: GameState, a: string, b: string | null): { valor: number } | null {
  if (!b) return null;
  for (const r of state.relacoes) {
    if ((r.a === a && r.b === b) || (r.a === b && r.b === a)) {
      return { valor: r.valor };
    }
  }
  return null;
}

function listActiveTreaties(state: GameState, countryId: string): Treaty[] {
  return state.tratados.filter((t) => !t.rompido && t.paises.includes(countryId));
}

function listActiveWars(state: GameState, countryId: string): War[] {
  return state.guerras.filter(
    (g) =>
      g.estado === "ativa" &&
      (g.agressor === countryId || g.defensores.includes(countryId)),
  );
}

function relacaoLabel(v: number): string {
  if (v > 60) return "Aliada";
  if (v > 20) return "Amiga";
  if (v > -20) return "Neutra";
  if (v > -60) return "Tensa";
  return "Hostil";
}

function translateRegime(r: Country["regime"]): string {
  const map: Record<Country["regime"], string> = {
    democracia: "Democracia",
    republica: "República",
    monarquia_constitucional: "Monarquia constitucional",
    autocracia: "Autocracia",
    regime_partido_unico: "Regime de partido único",
    teocracia: "Teocracia",
    junta_militar: "Junta militar",
    monarquia_absoluta: "Monarquia absoluta",
  };
  return map[r] ?? r;
}

function translateTreatyType(t: Treaty["tipo"]): string {
  const map: Record<Treaty["tipo"], string> = {
    alianca: "Aliança",
    comercio: "Comércio",
    nao_agressao: "Não-agressão",
    paz: "Paz",
  };
  return map[t] ?? t;
}

function translateWarObjective(o: WarObjective): string {
  const map: Record<WarObjective, string> = {
    conquistar: "conquistar províncias",
    saquear: "saquear recursos",
    humilhar: "humilhar o adversário",
    defender: "defender o statu quo",
  };
  return map[o] ?? o;
}

function formatNumber(n: number): string {
  return n.toLocaleString("pt-PT");
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
