// src/lib/geo/world.ts
// Carrega o TopoJSON do mundo (1 vez) e converte para GeoJSON features.
// Pré-computa os paths SVG com d3-geo para evitar retrabalho em cada render.

import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import type { Topology, GeometryCollection } from "topojson-specification";
import { geoNaturalEarth1, geoPath, geoGraticule10, type GeoPath } from "d3-geo";

import worldTopo from "world-atlas/countries-110m.json";

export interface WorldFeatureProperties {
  /** Nome original do topojson (em inglês). Usado como fallback de tooltip. */
  name: string;
  /** ID numérico ISO 3166-1 (string zero-padded), ou null se em falta. */
  numeric: string | null;
}

export type WorldFeature = GeoJSON.Feature<Geometry, WorldFeatureProperties>;

/** Converte a topologia topojson numa FeatureCollection de países. */
function buildFeatures(): FeatureCollection<Geometry, WorldFeatureProperties> {
  const topo = worldTopo as unknown as Topology;
  const geom = topo.objects.countries as GeometryCollection;
  const fc = feature(topo, geom) as unknown as FeatureCollection<
    Geometry,
    WorldFeatureProperties
  >;
  return {
    type: "FeatureCollection",
    features: fc.features.map((f) => {
      const numericRaw = (f as unknown as { id?: string | number }).id;
      const numeric = numericRaw != null ? String(numericRaw) : null;
      const props = f.properties as { name?: unknown } | null;
      const name =
        props && typeof props.name === "string" && props.name.length > 0
          ? props.name
          : "Sem dados";
      return {
        type: "Feature",
        geometry: f.geometry,
        properties: {
          name,
          numeric: numeric ? numeric.padStart(3, "0") : null,
        },
      } as WorldFeature;
    }),
  };
}

export const WORLD_FEATURES: FeatureCollection<Geometry, WorldFeatureProperties> =
  buildFeatures();

/** Linhas de latitude/longitude (graticule) para fundo do mapa. */
export const GRATICULE_PATH: string =
  geoPath(geoNaturalEarth1())(geoGraticule10()) ?? "";

/**
 * Cria um geoPath reutilizável com a projeção NaturalEarth1 e tamanho dados.
 * Devolve a função path pronta a aplicar a features.
 */
export function makePathGenerator(width: number, height: number): GeoPath {
  const projection = geoNaturalEarth1()
    .fitExtent(
      [
        [10, 10],
        [width - 10, height - 10],
      ],
      WORLD_FEATURES,
    )
    .rotate([0, 0]);
  return geoPath(projection);
}
