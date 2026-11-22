// src/components/game/WorldMap.tsx
// Mapa-mundo interativo com d3-geo + topojson. Projeção NaturalEarth1.
// - Países do cenário: polígonos coloridos pela cor do país.
// - Outros países: cinzento com etiqueta «sem dados» no tooltip.
// - País do jogador: contorno destacado.
// - Zoom (botões + scroll + pinch), pan (drag com rato ou 1 dedo).
// - Tooltip com nome em português (ou fallback).
// - Marcadores de província (com lat/lng) visíveis quando zoom > threshold.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { geoNaturalEarth1 } from "d3-geo";
import { WORLD_FEATURES, makePathGenerator, GRATICULE_PATH } from "@/lib/geo/world";
import { numericToAlpha3, numericToNome } from "@/data/iso-mapping";
import { useGameStore } from "@/lib/state";
import type { Country, Province } from "@/types";
import { Button } from "@/components/ui/button";
import { Plus, Minus, RotateCcw } from "lucide-react";
import { MapModeSelector, getColorForMapMode, type MapMode } from "./MapModeSelector";

export interface WorldMapProps {
  selectedCountryId: string | null;
  onSelectCountry: (id: string | null) => void;
}

interface FeaturePath {
  d: string;
  numeric: string | null;
  alpha3: string | null;
  name: string;
}

interface Transform {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 1;
const MAX_SCALE = 8;

const CINZENTO = "#9ca3af"; // cinza neutro para países sem dados
const CINZENTO_BORDA = "#6b7280";

export function WorldMap({ selectedCountryId, onSelectCountry }: WorldMapProps) {
  // Selectors finos: o tick diário só muda `dataAtual` (mantém referências de
  // paises/provincias), pelo que este componente NÃO re-renderiza por dia.
  const paises = useGameStore((s) => s.state?.paises);
  const provincias = useGameStore((s) => s.state?.provincias);
  const playerCountryId = useGameStore((s) => s.state?.playerCountryId);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: 800,
    height: 500,
  });
  // Fase 11 — Modo de mapa (político, força, PIB, reputação, estabilidade).
  const [mapMode, setMapMode] = useState<MapMode>("politico");

  // Observa redimensionamentos do contentor (responsivo).
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setSize((prev) =>
            prev.width === width && prev.height === height
              ? prev
              : { width: Math.floor(width), height: Math.floor(height) },
          );
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pré-computa paths quando o tamanho muda.
  const paths = useMemo<FeaturePath[]>(() => {
    if (size.width < 10 || size.height < 10) return [];
    const gen = makePathGenerator(size.width, size.height);
    return WORLD_FEATURES.features.map((f) => {
      const numeric = f.properties.numeric;
      const alpha3 = numeric ? numericToAlpha3(numeric) : null;
      const name = (numeric ? numericToNome(numeric) : null) ?? f.properties.name;
      return {
        d: gen(f) ?? "",
        numeric,
        alpha3,
        name,
      };
    });
  }, [size.width, size.height]);

  // Transformação atual (pan + zoom).
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });

  // Estado separado para o cursor (não podemos ler ref no render).
  const [isDragging, setIsDragging] = useState(false);

  // Drag/pan state via pointer events.
  const dragRef = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  // Pinch state (dois ponteiros).
  const pinchRef = useRef<{
    a: PointerEvent;
    b: PointerEvent;
    startDist: number;
    startScale: number;
  } | null>(null);
  const activePointers = useRef<Map<number, PointerEvent>>(new Map());

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      // Nota: não chamamos setPointerCapture — isso redirecionava pointerup
      // para o SVG, impedindo o click no path do país.
      activePointers.current.set(e.pointerId, e.nativeEvent);

      if (activePointers.current.size === 2) {
        const [a, b] = Array.from(activePointers.current.values());
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        pinchRef.current = {
          a,
          b,
          startDist: dist,
          startScale: transform.scale,
        };
        dragRef.current = null; // cancela pan durante o pinch
        return;
      }
      if (activePointers.current.size === 1) {
        dragRef.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          originX: transform.x,
          originY: transform.y,
        };
        setIsDragging(true);
      }
    },
    [transform.x, transform.y, transform.scale],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!activePointers.current.has(e.pointerId)) return;
      activePointers.current.set(e.pointerId, e.nativeEvent);

      // Pinch ativo -> ajusta escala.
      if (pinchRef.current && activePointers.current.size >= 2) {
        const [a, b] = Array.from(activePointers.current.values());
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (pinchRef.current.startDist > 0) {
          const factor = dist / pinchRef.current.startDist;
          const newScale = clamp(
            pinchRef.current.startScale * factor,
            MIN_SCALE,
            MAX_SCALE,
          );
          setTransform((t) => ({ ...t, scale: newScale }));
        }
        return;
      }

      // Pan com 1 ponteiro.
      if (dragRef.current && dragRef.current.pointerId === e.pointerId) {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        setTransform((t) => ({
          ...t,
          x: dragRef.current!.originX + dx,
          y: dragRef.current!.originY + dy,
        }));
      }
    },
    [],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      activePointers.current.delete(e.pointerId);

      if (pinchRef.current) {
        // Se ainda há 2 ponteiros ativos, mantém pinch; senão, limpa.
        if (activePointers.current.size < 2) {
          pinchRef.current = null;
        }
      }
      // IMPORTANTE: o dragRef.current NÃO é limpo aqui. O onPointerUp do
      // path (que dispara ANTES deste handler por bubbling) precisa de ler
      // a posição inicial para distinguir click de drag. É limpo depois.
      if (dragRef.current && dragRef.current.pointerId === e.pointerId) {
        // Adia a limpeza para depois do handler do path ter oportunidade de correr.
        setTimeout(() => {
          dragRef.current = null;
          setIsDragging(false);
        }, 0);
      }
    },
    [],
  );

  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    // Zoom em torno do cursor: combina scale + translate.
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    setTransform((t) => {
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newScale = clamp(t.scale * factor, MIN_SCALE, MAX_SCALE);
      if (newScale === t.scale) return t;
      // Mantém o ponto sob o cursor estável.
      const ratio = newScale / t.scale;
      const nx = cx - (cx - t.x) * ratio;
      const ny = cy - (cy - t.y) * ratio;
      return { x: nx, y: ny, scale: newScale };
    });
  }, []);

  // Botões de zoom (zoom-to-center).
  const zoomBy = useCallback((factor: number) => {
    setTransform((t) => {
      const newScale = clamp(t.scale * factor, MIN_SCALE, MAX_SCALE);
      if (newScale === t.scale) return t;
      const cx = size.width / 2;
      const cy = size.height / 2;
      const ratio = newScale / t.scale;
      const nx = cx - (cx - t.x) * ratio;
      const ny = cy - (cy - t.y) * ratio;
      return { x: nx, y: ny, scale: newScale };
    });
  }, [size.width, size.height]);

  const reset = useCallback(() => {
    setTransform({ x: 0, y: 0, scale: 1 });
  }, []);

  // Hover/tooltip state.
  const [hovered, setHovered] = useState<{ alpha3: string | null; name: string; x: number; y: number } | null>(null);

  const handlePathEnter = useCallback(
    (feat: FeaturePath, e: React.PointerEvent<SVGPathElement>) => {
      setHovered({
        alpha3: feat.alpha3,
        name: feat.name,
        x: e.clientX,
        y: e.clientY,
      });
    },
    [],
  );

  const handlePathMove = useCallback(
    (feat: FeaturePath, e: React.PointerEvent<SVGPathElement>) => {
      setHovered({
        alpha3: feat.alpha3,
        name: feat.name,
        x: e.clientX,
        y: e.clientY,
      });
    },
    [],
  );

  const handlePathLeave = useCallback(() => setHovered(null), []);

  const handleClickPath = useCallback(
    (feat: FeaturePath, _e: React.PointerEvent<SVGPathElement>) => {
      if (feat.alpha3 && paises?.[feat.alpha3]) {
        onSelectCountry(feat.alpha3);
      } else {
        // País sem dados: painel mostra mensagem; passa null para sinalizar.
        onSelectCountry(null);
      }
    },
    [onSelectCountry, paises],
  );

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <svg
        width={size.width}
        height={size.height}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        style={{ touchAction: "none", cursor: isDragging ? "grabbing" : "grab" }}
        aria-label="Mapa-mundo do Imperium História"
      >
        <rect
          x={0}
          y={0}
          width={size.width}
          height={size.height}
          fill="#e5e7eb"
          onPointerDown={(e) => e.stopPropagation()}
        />
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
          {/* Graticule de fundo */}
          {GRATICULE_PATH && (
            <path d={GRATICULE_PATH} fill="none" stroke="#d1d5db" strokeWidth={0.5} />
          )}
          {/* Países */}
          {paths.map((feat, idx) => {
            const country = feat.alpha3 ? (paises?.[feat.alpha3] ?? null) : null;
            const isPlayer =
              country && playerCountryId === feat.alpha3;
            const isSelected =
              feat.alpha3 && selectedCountryId === feat.alpha3;
            // Fase 11 — fill baseado no modo de mapa (político usa cor; outros usam métrica).
            const fill = country
              ? (mapMode === "politico" ? country.cor : getColorForMapMode(country, mapMode))
              : CINZENTO;
            const stroke = isPlayer ? "#f8fafc" : isSelected ? "#0f172a" : CINZENTO_BORDA;
            const strokeWidth = isPlayer ? 2.2 : isSelected ? 1.6 : 0.4;
            return (
              <path
                key={`${feat.numeric ?? "xx"}-${idx}`}
                d={feat.d}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
                vectorEffect="non-scaling-stroke"
                onPointerEnter={(e) => handlePathEnter(feat, e)}
                onPointerMove={(e) => handlePathMove(feat, e)}
                onPointerLeave={handlePathLeave}
                onPointerUp={(e) => {
                  // Só conta como click se não houve drag significativo.
                  if (
                    dragRef.current &&
                    Math.abs(e.clientX - dragRef.current.startX) < 4 &&
                    Math.abs(e.clientY - dragRef.current.startY) < 4
                  ) {
                    handleClickPath(feat, e);
                  } else if (!dragRef.current) {
                    handleClickPath(feat, e);
                  }
                }}
                style={{ cursor: "pointer" }}
              >
                <title>{feat.name}</title>
              </path>
            );
          })}

          {/* Marcadores de província quando zoom > 1.5 */}
          {transform.scale > 1.5 && (
            <ProvinceMarkers
              paises={paises ?? {}}
              provincias={provincias ?? {}}
              width={size.width}
              height={size.height}
            />
          )}
        </g>
      </svg>

      {/* Fase 11 — Selector de modo de mapa */}
      <MapModeSelector mode={mapMode} onChange={setMapMode} />

      {/* Botões de zoom */}
      <div className="bg-background/90 absolute right-2 top-2 flex flex-col gap-1 rounded-md border p-1 shadow-sm backdrop-blur">
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={() => zoomBy(1.3)}
          aria-label="Aumentar zoom"
        >
          <Plus className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={() => zoomBy(1 / 1.3)}
          aria-label="Diminuir zoom"
        >
          <Minus className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={reset}
          aria-label="Repor mapa"
        >
          <RotateCcw className="size-4" />
        </Button>
      </div>

      {/* Escala atual (texto discreto) */}
      <div className="text-muted-foreground absolute bottom-2 left-2 rounded bg-background/80 px-2 py-0.5 text-xs backdrop-blur">
        Zoom: {transform.scale.toFixed(1)}×
      </div>

      {/* Tooltip */}
      {hovered && (
        <div
          className="bg-background pointer-events-none absolute z-10 max-w-48 rounded-md border px-2 py-1 text-xs shadow-md"
          style={{
            left: Math.min(hovered.x + 12, size.width - 180),
            top: Math.min(hovered.y + 12, size.height - 60),
          }}
        >
          <p className="font-semibold">{hovered.name}</p>
          {hovered.alpha3 && paises?.[hovered.alpha3] ? (
            <p className="text-muted-foreground">
              {paises[hovered.alpha3].donoJogador ? "País do jogador" : "Clique para ver"}
            </p>
          ) : (
            <p className="text-muted-foreground italic">Sem dados</p>
          )}
        </div>
      )}
    </div>
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Marcadores de província: renderiza um pequeno círculo colorido (pela cor
 * do país dono) no centro de cada província com lat/lng. Labels visíveis
 * quando zoom > 2.5.
 */
function ProvinceMarkers({
  paises,
  provincias,
  width,
  height,
}: {
  paises: Record<string, Country>;
  provincias: Record<string, Province>;
  width: number;
  height: number;
}) {
  // Reusa o mesmo path generator do mapa principal para projecção consistente.
  const projection = useMemo(() => {
    const p = geoNaturalEarth1()
      .fitExtent(
        [
          [10, 10],
          [width - 10, height - 10],
        ],
        WORLD_FEATURES,
      )
      .rotate([0, 0]);
    return p;
  }, [width, height]);

  const markerSize = 5;
  const showLabels = true;

  // Filtra províncias com lat/lng.
  const provs = useMemo<Province[]>(
    () => Object.values(provincias).filter(
      (p) => typeof p.lat === "number" && typeof p.lng === "number",
    ),
    [provincias],
  );

  return (
    <g pointerEvents="none">
      {provs.map((p) => {
        const country = paises[p.countryId];
        const cor = country?.cor ?? "#9ca3af";
        const isOcupada = p.ocupadaPor && p.ocupadaPor !== p.countryId;
        const proj = projection([p.lng ?? 0, p.lat ?? 0]);
        if (!proj) return null;
        const [x, y] = proj;
        return (
          <g key={p.id}>
            <circle
              cx={x}
              cy={y}
              r={markerSize}
              fill={cor}
              stroke={isOcupada ? "#000" : "#fff"}
              strokeWidth={isOcupada ? 1.5 : 0.8}
              vectorEffect="non-scaling-stroke"
              opacity={0.95}
            />
            {showLabels && (
              <text
                x={x + markerSize + 1}
                y={y + 2}
                fontSize={9}
                fill="#1f2937"
                stroke="white"
                strokeWidth={2.5}
                paintOrder="stroke"
                vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: "none" }}
              >
                {p.nome}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
