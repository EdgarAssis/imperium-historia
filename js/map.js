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
    if (mapGroup) mapGroup.attr('transform', event.transform);
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
  if (relation === 'ally') return '#1e3828';
  if (relation === 'hostile') return '#2e1818';
  if (relation === 'rival') return '#2a2010';
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
    .attr('transform', feature => {
      const center = geoPath.centroid(feature);
      return Number.isNaN(center[0]) ? 'translate(0,0)' : `translate(${center[0]},${center[1]})`;
    })
    .text(feature => COUNTRIES[NUM2ISO[feature.id]]?.name || '')
    .attr('font-size', getLabelFontSize)
    .attr('opacity', feature => {
      const area = window.d3.geoArea(feature);
      return area > 0.02 ? 0.86 : area > 0.004 ? 0.72 : 0.58;
    });
}

function getLabelFontSize(feature) {
  const area = window.d3.geoArea(feature);
  if (area > 0.08) return '12px';
  if (area > 0.025) return '10px';
  if (area > 0.006) return '8px';
  if (area > 0.0012) return '6px';
  return '4.8px';
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
  qs('#tt-rel').textContent = iso === getPlayerISO(state) ? '👑 Sua nação' : relationLabel(state.relations[iso] || 'neutral');
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
