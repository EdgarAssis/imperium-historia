import { COUNTRIES, NUM2ISO } from './data.js';
import { getCountryInfo, getPlayerISO } from './state.js';
import { clear, el, qs } from './utils.js';
import { relationLabel } from './render.js';

let svgEl = null;
let projection = null;
let geoPath = null;
let zoomBehavior = null;
let countryGroup = null;
let labelsGroup = null;
let mapGroup = null;
let featuresCache = [];
let selectHandler = null;

export async function initMap(state, onCountrySelect) {
  selectHandler = onCountrySelect;
  svgEl = window.d3?.select('#map-svg');
  if (!window.d3 || !window.topojson || !svgEl) {
    renderFallbackMap(state);
    return;
  }

  const container = qs('#map-area');
  const width = Math.max(container.clientWidth, 320);
  const height = Math.max(container.clientHeight, 320);
  projection = window.d3.geoNaturalEarth1().scale(width / 6.3).translate([width / 2, height / 2]);
  geoPath = window.d3.geoPath().projection(projection);
  zoomBehavior = window.d3.zoom().scaleExtent([0.5, 14]).on('zoom', event => {

  // 🔥 mover mapa
  if (mapGroup) {
    mapGroup.attr('transform', event.transform);
  }

  // 🔥 ajustar letras ao zoom
  if (labelsGroup) {

    labelsGroup.selectAll('.country-label')

      .style('font-size', feature => {

        const area = window.d3.geoArea(feature);
        const zoom = event.transform.k;

        let size = 6;

        if (area > 0.15) size = 18;
        else if (area > 0.06) size = 14;
        else if (area > 0.02) size = 11;
        else if (area > 0.006) size = 8;

        // 🔥 zoom dinâmico
        size = size / Math.sqrt(zoom);

        return `${Math.max(4, size)}px`;
      })

      // 🔥 esconder labels pequenas no zoom out
      .style('opacity', feature => {

        const area = window.d3.geoArea(feature);
        const zoom = event.transform.k;

        if (zoom < 1 && area < 0.01) return 0;
        if (zoom < 0.8 && area < 0.03) return 0;

        return 0.82;
      });
  }
});
  svgEl.call(zoomBehavior);
  svgEl.selectAll('*').remove();
  mapGroup = svgEl.append('g');
  mapGroup.append('path').datum({ type: 'Sphere' }).attr('class', 'sphere').attr('d', geoPath);
  mapGroup.append('path').datum(window.d3.geoGraticule()()).attr('class', 'graticule').attr('d', geoPath);
  countryGroup = mapGroup.append('g');
  labelsGroup = mapGroup.append('g');

  try {
    const topo = await window.d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json');
    const countries = window.topojson.feature(topo, topo.objects.countries);
    const borders = window.topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b);
    featuresCache = countries.features;

    countryGroup.selectAll('.country')
      .data(featuresCache)
      .enter()
      .append('path')
      .attr('class', 'country')
      .attr('d', geoPath)
      .attr('fill', feature => getCountryFill(NUM2ISO[feature.id], state))
      .on('mouseenter', (event, feature) => showTooltip(event, NUM2ISO[feature.id], state))
      .on('mousemove', moveTooltip)
      .on('mouseleave', hideTooltip)
      .on('click', function handleClick(event, feature) {
        const iso = NUM2ISO[feature.id];
        if (!iso || iso === getPlayerISO(state)) return;
        selectHandler?.(iso);
      });

    mapGroup.append('path').datum(borders).attr('class', 'borders').attr('d', geoPath);
    renderLabels();
    addPlayerMarker(state);
    updateMapColors(state);
  } catch (error) {
    console.warn('Map failed, using fallback map.', error);
    renderFallbackMap(state);
  }
}

export function updateMapColors(state) {
  if (!countryGroup) {
    renderFallbackMap(state);
    return;
  }
  const playerISO = getPlayerISO(state);
  countryGroup.selectAll('.country')
    .attr('fill', feature => getCountryFill(NUM2ISO[feature.id], state))
    .classed('player-nation', feature => NUM2ISO[feature.id] === playerISO)
    .classed('selected-nation', feature => NUM2ISO[feature.id] === state.selectedIso);
  addPlayerMarker(state);
  updateFallbackSelection(state);
}

export function resizeMap(state) {
  if (!projection || !geoPath || !countryGroup) return;
  const container = qs('#map-area');
  const width = Math.max(container.clientWidth, 320);
  const height = Math.max(container.clientHeight, 320);
  projection.scale(width / 6.3).translate([width / 2, height / 2]);
  countryGroup.selectAll('.country').attr('d', geoPath);
  svgEl.select('.sphere').attr('d', geoPath);
  svgEl.select('.graticule').attr('d', geoPath);
  svgEl.select('.borders').attr('d', geoPath);
  if (labelsGroup) {
    labelsGroup.selectAll('.country-label').attr('transform', feature => {
      const center = geoPath.centroid(feature);
      return Number.isNaN(center[0]) ? 'translate(0,0)' : `translate(${center[0]},${center[1]})`;
    });
  }
  addPlayerMarker(state);
}

export function zoomIn() {
  if (svgEl && zoomBehavior) svgEl.transition().duration(180).call(zoomBehavior.scaleBy, 1.6);
}

export function zoomOut() {
  if (svgEl && zoomBehavior) svgEl.transition().duration(180).call(zoomBehavior.scaleBy, 0.625);
}

export function resetZoom() {
  if (svgEl && zoomBehavior) svgEl.transition().duration(180).call(zoomBehavior.transform, window.d3.zoomIdentity);
}

export function getCountryFill(iso, state) {
  if (!iso) return '#111a28';
  if (iso === getPlayerISO(state)) return '#7a5820';
  const relation = state.relations[iso];
  if (relation && typeof relation === "object") {
  if (relation.status === "ally") return '#1e3828';
  if (relation.status === "friendly") return '#244a35';
  if (relation.status === "hostile") return '#2e1818';
  if (relation.status === "cold") return '#2a2010';
}
  const h = (iso.charCodeAt(0) * 31 + iso.charCodeAt(1) * 17 + iso.charCodeAt(2) * 7) % 360;
  if (state.currentLayer === 'economy') return `hsl(${110 + (h % 30)},18%,13%)`;
  if (state.currentLayer === 'military') return `hsl(${210 + (h % 24)},20%,13%)`;
  return `hsl(${200 + (h % 42)},12%,12%)`;
}

function renderLabels() {

  const labelFeatures = featuresCache.filter(feature => {
    const iso = NUM2ISO[feature.id];
    return COUNTRIES[iso];
  });

  labelsGroup.selectAll('.country-label')
    .data(labelFeatures)
    .enter()
    .append('text')

    .attr('class', 'country-label')

    // 🔥 posição central
    .attr('transform', feature => {

      const center = geoPath.centroid(feature);

      return Number.isNaN(center[0])
        ? 'translate(0,0)'
        : `translate(${center[0]},${center[1]})`;
    })

    // 🔥 nomes inteligentes
    .text(feature => {

      const iso = NUM2ISO[feature.id];

      let name = COUNTRIES[iso]?.name || '';

      const area = window.d3.geoArea(feature);

      // 🔥 esconder países minúsculos
      if (area < 0.0015) return '';

      // 🔥 abreviações automáticas
      const shortNames = {

        "República Democrática do Congo": "RDC",
        "Estados Unidos da América": "EUA",
        "Arábia Saudita": "Arábia",
        "África do Sul": "África Sul",
        "República Centro-Africana": "RCA",
        "Nova Zelândia": "NZ",
        "Reino Unido": "RU",
        "Emirados Árabes Unidos": "EAU"

      };

      if (shortNames[name]) {
        name = shortNames[name];
      }

      // 🔥 cortar nomes longos
      if (area < 0.01 && name.length > 10) {
        name = name.slice(0, 8);
      }

      return name;
    })

    // 🔥 tamanho inteligente
    .style('font-size', feature => {

      const area = window.d3.geoArea(feature);

      if (area > 0.15) return '18px';
      if (area > 0.06) return '14px';
      if (area > 0.02) return '11px';
      if (area > 0.006) return '8px';

      return '6px';
    })

    // 🔥 centralizar
    .attr('text-anchor', 'middle')

    // 🔥 estilo
    .attr('opacity', 0.82)

    // 🔥 não bloquear clique
    .style('pointer-events', 'none')

    // 🔥 impedir seleção
    .style('user-select', 'none');
}

  labelsGroup.selectAll('.country-label')
    .data(labelFeatures)
    .enter()
    .append('text')
    .attr('class', 'country-label')
    .attr('transform', feature => {
      const center = geoPath.centroid(feature);
      return Number.isNaN(center[0]) ? 'translate(0,0)' : `translate(${center[0]},${center[1]})`;
    })
    .text(feature => {
      const name = COUNTRIES[NUM2ISO[feature.id]]?.name || '';

      const area = window.d3.geoArea(feature);

      // 🔥 ajustar nome ao tamanho do país
      if (area < 0.002) return ''; // esconder países pequenos
      if (area < 0.01) return name.slice(0, 6); // abreviar
      if (area < 0.03) return name.slice(0, 10);

      return name;
    })
    .attr('font-size', feature => {
      const area = window.d3.geoArea(feature);

      if (area > 0.1) return '14px';
      if (area > 0.03) return '11px';
      if (area > 0.008) return '9px';

      return '7px';
    })
    .attr('text-anchor', 'middle')
    .attr('opacity', 0.85);
}

function getLabelFontSize(feature) {
  const area = window.d3.geoArea(feature);

  if (area > 0.1) return '14px';
  if (area > 0.03) return '11px';
  if (area > 0.008) return '9px';
  if (area > 0.002) return '7px';

  return '0px'; // 🔥 esconde países muito pequenos
}

function addPlayerMarker(state) {
  if (!mapGroup || !featuresCache.length) return;
  mapGroup.select('#player-marker-g').remove();
  const playerISO = getPlayerISO(state);
  if (!playerISO) return;
  const feature = featuresCache.find(item => NUM2ISO[item.id] === playerISO);
  if (!feature) return;
  const center = geoPath.centroid(feature);
  if (Number.isNaN(center[0])) return;
  const marker = mapGroup.append('g').attr('id', 'player-marker-g');
  marker.append('circle').attr('cx', center[0]).attr('cy', center[1]).attr('r', 5)
    .attr('fill', 'var(--gold-2)').attr('stroke', 'var(--gold-3)').attr('stroke-width', .8).attr('opacity', .9);
  marker.append('circle').attr('cx', center[0]).attr('cy', center[1]).attr('r', 9)
    .attr('fill', 'none').attr('stroke', 'var(--gold)').attr('stroke-width', .6).attr('opacity', .45);
}

function showTooltip(event, iso, state) {
  const country = getCountryInfo(iso);
  qs('#tt-name').textContent = `${country.flag} ${country.name}`;
  const rel = state.relations[iso];
  const relStatus = rel?.status || "neutral";

  qs('#tt-rel').textContent =
    iso === getPlayerISO(state)
      ? '👑 Sua nação'
      : relationLabel(relStatus);
  qs('#tt-leader').textContent = `Líder: ${country.leader}`;
  qs('#map-tooltip').style.display = 'block';
  moveTooltip(event);
}

function moveTooltip(event) {
  const rect = qs('#map-area').getBoundingClientRect();
  const tooltip = qs('#map-tooltip');
  let x = event.clientX - rect.left + 14;
  let y = event.clientY - rect.top + 14;
  if (x + 220 > rect.width) x = event.clientX - rect.left - 230;
  if (y + 90 > rect.height) y = event.clientY - rect.top - 92;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

function hideTooltip() {
  qs('#map-tooltip').style.display = 'none';
}

function renderFallbackMap(state) {
  const fallback = qs('#map-fallback');
  const svg = qs('#map-svg');
  svg.style.display = 'none';
  fallback.hidden = false;
  clear(fallback);
  const grid = el('div', { className: 'fallback-grid' });
  Object.entries(COUNTRIES)
    .sort((a, b) => a[1].name.localeCompare(b[1].name, 'pt'))
    .forEach(([iso, country]) => {
      const button = el('button', {
        className: `fallback-country${state.selectedIso === iso ? ' selected' : ''}`,
        attrs: { type: 'button' },
        on: { click: () => selectHandler?.(iso) },
      }, [
        el('strong', { text: `${country.flag} ${country.name}` }),
        el('div', { text: relationLabel(state.relations[iso] || 'neutral') }),
      ]);
      grid.append(button);
    });
  fallback.append(grid);
}

function updateFallbackSelection(state) {
  const fallback = qs('#map-fallback');
  if (fallback.hidden) return;
  renderFallbackMap(state);
}
