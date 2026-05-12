"use strict";

// ─── Layout ───────────────────────────────────────────────────────────────────
const M = { top: 24, right: 28, bottom: 40, left: 58 };
const MAIN_W = 860, MAIN_H = 310;
const STRIPES_H = 72;
const HIST_W = 400, HIST_H = 240;
const T = 220;

const TEMP_PATH = "./data/cmip6_timeseries.csv";
const SAMP_PATH = "./data/cmip6_sample.csv";

// ─── State ────────────────────────────────────────────────────────────────────
let allData    = [];
let dataMap    = new Map();
let windowSize = 30;
let showThresh = false;
let brushYears = null;

// ─── Scales / generators ──────────────────────────────────────────────────────
let xMain, yMain, xStripe;
let rawLineGen, rollLineGen;
let stripeColorFn;

// ─── D3 selections ────────────────────────────────────────────────────────────
let rawPath, rollPath, xAxisG, yAxisG, yGridG;
let crosshairLine, tempDot;
let threshLine, threshLabel;
let zeroLine, zeroLabel;
let mainBrush, mainBrushG;
let stripeHoverLine, stripeSelectionRect, stripesRects;
let histSvg, histXAxisG, histYAxisG;
let tipDiv;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function visibleData() {
  if (!brushYears) return allData;
  return allData.filter(d => d.year >= brushYears[0] && d.year <= brushYears[1]);
}

function rollingMean(data, w) {
  return data.map((d, i) => {
    const win = data.slice(Math.max(0, i - w + 1), i + 1);
    return { year: d.year, value: d3.mean(win, s => s.anomaly_c) };
  });
}

function yDomain() {
  const [yMin, yMax] = d3.extent(allData, d => d.anomaly_c);
  if (showThresh) return [Math.min(yMin - 0.15, -0.4), Math.max(yMax + 0.1, 1.6)];
  return [yMin - 0.12, yMax + 0.12];
}

// ─── Hover ────────────────────────────────────────────────────────────────────
function applyHover(event, year) {
  const d = dataMap.get(year);
  if (!d) return;

  stripeHoverLine.attr("x", xStripe(year) - 0.75).style("opacity", 1);
  crosshairLine.attr("x1", xMain(year)).attr("x2", xMain(year)).style("opacity", 1);
  tempDot.attr("cx", xMain(year)).attr("cy", yMain(d.anomaly_c)).style("opacity", 1);

  if (event) {
    const sign = d.anomaly_c >= 0 ? "+" : "";
    tipDiv
      .html(`<b>${year}</b><br>Anomaly: <b>${sign}${d.anomaly_c.toFixed(3)} °C</b>`)
      .style("opacity", 1)
      .style("left", `${event.clientX + 14}px`)
      .style("top",  `${event.clientY - 18}px`);
  }
}

function clearHover() {
  crosshairLine.style("opacity", 0);
  tempDot.style("opacity", 0);
  stripeHoverLine.style("opacity", 0);
  tipDiv.style("opacity", 0);
}

// ─── Build: main line chart ────────────────────────────────────────────────────
function buildMain(root) {
  const svg = root.append("svg")
    .attr("viewBox", `0 0 ${MAIN_W} ${MAIN_H}`)
    .attr("width", "100%");

  svg.append("defs").append("clipPath").attr("id", "main-clip")
    .append("rect")
    .attr("x", M.left).attr("y", M.top)
    .attr("width",  MAIN_W - M.left - M.right)
    .attr("height", MAIN_H - M.top  - M.bottom);

  const g = svg.append("g");

  yGridG = g.append("g").attr("class", "grid").attr("transform", `translate(${M.left},0)`);

  zeroLine = g.append("line").attr("class", "zero-line")
    .attr("x1", M.left).attr("x2", MAIN_W - M.right)
    .attr("y1", yMain(0)).attr("y2", yMain(0));
  zeroLabel = g.append("text").attr("class", "zero-line-label")
    .attr("x", MAIN_W - M.right - 4)
    .attr("y", yMain(0) + 12)
    .attr("text-anchor", "end")
    .text("pre-industrial baseline");

  threshLine  = g.append("line").attr("class", "thresh-line");
  threshLabel = g.append("text").attr("class", "thresh-label");

  rawPath  = g.append("path").attr("class", "line raw-line")
    .attr("clip-path", "url(#main-clip)");
  rollPath = g.append("path").attr("class", "line roll-line")
    .attr("clip-path", "url(#main-clip)");

  crosshairLine = g.append("line").attr("class", "crosshair")
    .attr("y1", M.top).attr("y2", MAIN_H - M.bottom)
    .style("opacity", 0).style("pointer-events", "none");
  tempDot = g.append("circle").attr("r", 5).attr("class", "hover-dot")
    .style("opacity", 0).style("pointer-events", "none");

  xAxisG = g.append("g").attr("class", "axis")
    .attr("transform", `translate(0,${MAIN_H - M.bottom})`);
  yAxisG = g.append("g").attr("class", "axis")
    .attr("transform", `translate(${M.left},0)`);

  g.append("text").attr("class", "label")
    .attr("x", (MAIN_W + M.left) / 2).attr("y", MAIN_H - 5)
    .attr("text-anchor", "middle").text("Year");
  g.append("text").attr("class", "label")
    .attr("transform", "rotate(-90)").attr("x", -(MAIN_H / 2)).attr("y", 16)
    .attr("text-anchor", "middle").text("Anomaly (°C)");

  // Brush for range selection (no x-axis zoom — just filters stats/histogram)
  mainBrush = d3.brushX()
    .extent([[M.left, M.top], [MAIN_W - M.right, MAIN_H - M.bottom]])
    .on("brush end", onMainBrush);
  mainBrushG = g.append("g").attr("class", "brush main-brush").call(mainBrush);

  // Hover via SVG-level mousemove — bubbles through the brush overlay
  const bisect = d3.bisector(d => d.year).left;
  svg.on("mousemove", function(event) {
    const [mx, my] = d3.pointer(event);
    if (mx < M.left || mx > MAIN_W - M.right || my < M.top || my > MAIN_H - M.bottom) {
      clearHover();
      return;
    }
    const hy = xMain.invert(mx);
    let i = bisect(allData, hy);
    i = Math.min(i, allData.length - 1);
    if (i > 0 && Math.abs(allData[i-1].year - hy) < Math.abs(allData[i].year - hy)) i--;
    applyHover(event, allData[i].year);
  }).on("mouseleave", clearHover);

  svg.on("dblclick", resetSelection);
}

function onMainBrush(event) {
  // Skip programmatic clears
  if (!event.selection) return;

  brushYears = event.selection.map(v => Math.round(xMain.invert(v)));
  updateStripeHighlight();
  updateHistogram();
  updateStats();
  updateRangeLabel();
  document.getElementById("reset-zoom").disabled = false;
}

function resetSelection() {
  brushYears = null;
  mainBrushG.call(mainBrush.move, null);
  updateStripeHighlight();
  updateHistogram();
  updateStats();
  updateRangeLabel();
  document.getElementById("reset-zoom").disabled = true;
}

// ─── Build: warming stripes ────────────────────────────────────────────────────
function buildStripes(root) {
  const legendH = 20;
  const totalH  = STRIPES_H + legendH;

  const svg = root.append("svg")
    .attr("class", "stripes-svg")
    .attr("viewBox", `0 0 ${MAIN_W} ${totalH}`)
    .attr("width", "100%");

  const innerW  = MAIN_W - M.left - M.right;
  const stripeW = innerW / allData.length;

  const stripesG = svg.append("g");
  stripesRects = stripesG.selectAll(".stripe")
    .data(allData)
    .enter().append("rect")
    .attr("class", "stripe")
    .attr("x", d => xStripe(d.year) - stripeW / 2)
    .attr("y", 0)
    .attr("width",  stripeW + 0.6)
    .attr("height", STRIPES_H)
    .attr("fill", d => stripeColorFn(d.anomaly_c));

  const defs = svg.append("defs");
  const grad = defs.append("linearGradient").attr("id", "stripe-grad");
  grad.append("stop").attr("offset", "0%").attr("stop-color", "#053061");
  grad.append("stop").attr("offset", "50%").attr("stop-color", "#f7f7f7");
  grad.append("stop").attr("offset", "100%").attr("stop-color", "#67001f");

  const lx = M.left, ly = STRIPES_H + 3, lw = 140;
  svg.append("rect").attr("x", lx).attr("y", ly).attr("width", lw).attr("height", 8)
    .attr("fill", "url(#stripe-grad)");
  svg.append("text").attr("class", "legend-label").attr("x", lx).attr("y", ly + 17).text("Cooler");
  svg.append("text").attr("class", "legend-label").attr("x", lx + lw).attr("y", ly + 17)
    .attr("text-anchor", "end").text("Warmer");

  // Border around the stripe area
  svg.append("rect")
    .attr("x", M.left).attr("y", 0)
    .attr("width", MAIN_W - M.left - M.right)
    .attr("height", STRIPES_H)
    .attr("fill", "none")
    .attr("stroke", "#9ca3af")
    .attr("stroke-width", 1)
    .style("pointer-events", "none");

  // Selection highlight mirror
  stripeSelectionRect = svg.append("rect").attr("class", "stripe-selection")
    .attr("y", 0).attr("height", STRIPES_H)
    .style("display", "none").style("pointer-events", "none");

  stripeHoverLine = svg.append("rect").attr("class", "stripe-hover-line")
    .attr("y", 0).attr("width", 1.5).attr("height", STRIPES_H)
    .style("pointer-events", "none").style("opacity", 0);

  svg.on("mousemove", function(event) {
    const [mx, my] = d3.pointer(event);
    if (my > STRIPES_H || mx < M.left || mx > MAIN_W - M.right) return;
    const [y0, y1] = d3.extent(allData, d => d.year);
    const year = Math.max(y0, Math.min(y1, Math.round(xStripe.invert(mx))));
    applyHover(event, year);
  }).on("mouseleave", clearHover);
}

// ─── Update: stripe selection highlight ───────────────────────────────────────
function updateStripeHighlight() {
  if (!brushYears) {
    stripeSelectionRect.style("display", "none");
    stripesRects.attr("opacity", 1);
    return;
  }
  const x0 = xStripe(brushYears[0]);
  const x1 = xStripe(brushYears[1]);
  stripeSelectionRect
    .attr("x", x0).attr("width", Math.max(0, x1 - x0))
    .style("display", null);
  stripesRects.attr("opacity", d =>
    (d.year >= brushYears[0] && d.year <= brushYears[1]) ? 1 : 0.3
  );
}

// ─── Build: histogram ─────────────────────────────────────────────────────────
function buildHistogram(root) {
  histSvg = root.append("svg")
    .attr("viewBox", `0 0 ${HIST_W} ${HIST_H}`)
    .attr("width", "100%");
  histXAxisG = histSvg.append("g").attr("class", "axis")
    .attr("transform", `translate(0,${HIST_H - M.bottom})`);
  histYAxisG = histSvg.append("g").attr("class", "axis")
    .attr("transform", `translate(${M.left},0)`);
  histSvg.append("text").attr("class", "label")
    .attr("x", (HIST_W + M.left) / 2).attr("y", HIST_H - 5)
    .attr("text-anchor", "middle").text("Anomaly (°C)");
  histSvg.append("text").attr("class", "label")
    .attr("transform", "rotate(-90)").attr("x", -(HIST_H / 2)).attr("y", 16)
    .attr("text-anchor", "middle").text("Years");
}

// ─── Update: main chart ────────────────────────────────────────────────────────
function updateMain() {
  yMain.domain(yDomain());

  const rolled = rollingMean(allData, windowSize);
  rawPath.datum(allData).transition().duration(T).attr("d", rawLineGen);
  rollPath.datum(rolled).transition().duration(T).attr("d", rollLineGen);

  yAxisG.transition().duration(T).call(d3.axisLeft(yMain).ticks(6));
  yGridG.transition().duration(T).call(
    d3.axisLeft(yMain).ticks(6)
      .tickSize(-(MAIN_W - M.left - M.right)).tickFormat("")
  );

  zeroLine.transition().duration(T).attr("y1", yMain(0)).attr("y2", yMain(0));
  zeroLabel.transition().duration(T).attr("y", yMain(0) + 12);

  threshLine
    .attr("x1", M.left).attr("x2", MAIN_W - M.right)
    .attr("y1", yMain(1.5)).attr("y2", yMain(1.5))
    .style("display", showThresh ? null : "none");
  threshLabel
    .attr("x", M.left + 6).attr("y", yMain(1.5) - 5)
    .text("Paris Agreement target")
    .style("display", showThresh ? null : "none");

  xAxisG.call(d3.axisBottom(xMain).ticks(6).tickFormat(d3.format("d")));
}

// ─── Update: range label ──────────────────────────────────────────────────────
function updateRangeLabel() {
  const [y0, y1] = brushYears
    ? brushYears
    : d3.extent(allData, d => d.year);
  d3.select("#range-label")
    .text(brushYears ? `Selected: ${y0}–${y1}` : `All years: ${y0}–${y1}`);
}

// ─── Update: histogram ────────────────────────────────────────────────────────
function updateHistogram() {
  const vis  = visibleData();
  const gExt = d3.extent(allData, d => d.anomaly_c);

  const bins = d3.bin()
    .domain([gExt[0] - 0.05, gExt[1] + 0.05]).thresholds(14)
    (vis.map(d => d.anomaly_c));

  const xH = d3.scaleLinear()
    .domain([bins[0].x0, bins[bins.length - 1].x1])
    .range([M.left, HIST_W - M.right]);
  const yH = d3.scaleLinear()
    .domain([0, d3.max(bins, d => d.length) || 1]).nice()
    .range([HIST_H - M.bottom, M.top]);

  const colorFn = d => d3.interpolateRdYlBu(
    1 - ((d.x0 + d.x1) / 2 - gExt[0]) / (gExt[1] - gExt[0])
  );

  histXAxisG.call(d3.axisBottom(xH).ticks(6));
  histYAxisG.transition().duration(T).call(d3.axisLeft(yH).ticks(5));

  histSvg.selectAll(".hist-bar")
    .data(bins, d => d.x0)
    .join(
      enter => enter.append("rect").attr("class", "hist-bar")
        .attr("x", d => xH(d.x0) + 1).attr("y", HIST_H - M.bottom)
        .attr("width", d => Math.max(0, xH(d.x1) - xH(d.x0) - 2))
        .attr("height", 0).attr("fill", colorFn),
      update => update,
      exit => exit.transition().duration(T)
        .attr("y", HIST_H - M.bottom).attr("height", 0).remove()
    )
    .transition().duration(T)
    .attr("x", d => xH(d.x0) + 1)
    .attr("y", d => yH(d.length))
    .attr("width", d => Math.max(0, xH(d.x1) - xH(d.x0) - 2))
    .attr("height", d => yH(0) - yH(d.length))
    .attr("fill", colorFn);

  const mean = d3.mean(vis, d => d.anomaly_c);
  d3.select("#hist-subtitle")
    .text(`${vis.length} years · mean ${mean >= 0 ? "+" : ""}${mean.toFixed(3)} °C`);
}

// ─── Update: stats ────────────────────────────────────────────────────────────
function updateStats() {
  const vis = visibleData();
  if (!vis.length) return;

  const mean   = d3.mean(vis, d => d.anomaly_c);
  const maxRow = vis.reduce((a, b) => b.anomaly_c > a.anomaly_c ? b : a);
  const xMu    = d3.mean(vis, d => d.year);
  const num    = d3.sum(vis, d => (d.year - xMu) * (d.anomaly_c - mean));
  const den    = d3.sum(vis, d => (d.year - xMu) ** 2);
  const trend  = (num / den) * 10;

  d3.select("#stat-mean").text(`${mean >= 0 ? "+" : ""}${mean.toFixed(3)} °C`);
  d3.select("#stat-max").text(`+${maxRow.anomaly_c.toFixed(3)} °C (${maxRow.year})`);
  d3.select("#stat-trend").text(`${trend >= 0 ? "+" : ""}${trend.toFixed(3)} °C / decade`);
}

function updateAll() {
  updateMain();
  updateStripeHighlight();
  updateHistogram();
  updateStats();
  updateRangeLabel();
}

// ─── Controls ─────────────────────────────────────────────────────────────────
function setupControls() {
  const slider = document.getElementById("window-slider");
  const val    = document.getElementById("window-val");
  slider.addEventListener("input", () => {
    windowSize = +slider.value;
    val.textContent = slider.value;
    updateMain();
  });

  document.getElementById("toggle-thresholds").addEventListener("change", e => {
    showThresh = e.target.checked;
    updateMain();
  });

  document.getElementById("reset-zoom").addEventListener("click", resetSelection);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init(csv) {
  allData = csv
    .map(d => ({ year: +d.year, anomaly_c: +d.anomaly_c }))
    .filter(d => Number.isFinite(d.year) && Number.isFinite(d.anomaly_c))
    .sort((a, b) => a.year - b.year);

  if (!allData.length) {
    d3.select("#viz-root").append("p").text("No data found.");
    return;
  }

  dataMap = new Map(allData.map(d => [d.year, d]));

  const yExt = d3.extent(allData, d => d.anomaly_c);
  const xExt = d3.extent(allData, d => d.year);

  xMain   = d3.scaleLinear().domain(xExt).range([M.left, MAIN_W - M.right]);
  yMain   = d3.scaleLinear().domain(yDomain()).range([MAIN_H - M.bottom, M.top]);
  xStripe = d3.scaleLinear().domain(xExt).range([M.left, MAIN_W - M.right]);

  stripeColorFn = d3.scaleLinear()
    .domain([yExt[0], 0, yExt[1]])
    .range(["#053061", "#f7f7f7", "#67001f"])
    .clamp(true);

  rawLineGen  = d3.line().x(d => xMain(d.year)).y(d => yMain(d.anomaly_c));
  rollLineGen = d3.line().x(d => xMain(d.year)).y(d => yMain(d.value));

  tipDiv = d3.select("body").append("div").attr("class", "tooltip");

  const root = d3.select("#viz-root");
  buildMain(root);

  root.append("p").attr("class", "over-hint")
    .html("<b>Drag on the chart</b> to select a period · Double-click to clear · Hover to read values");

  buildStripes(root);

  const bottom = root.append("div").attr("class", "bottom-row");

  const histCol = bottom.append("div").attr("class", "hist-col");
  histCol.append("h3").text("Distribution of anomaly values");
  histCol.append("p").attr("class", "subtitle").attr("id", "hist-subtitle").text("—");
  buildHistogram(histCol);

  const statsCol = bottom.append("div").attr("class", "stats-col");
  statsCol.append("h3").text("Period statistics");
  statsCol.append("dl").html(`
    <dt>Mean anomaly</dt><dd id="stat-mean">—</dd>
    <dt>Warmest year</dt><dd id="stat-max">—</dd>
    <dt>Warming rate</dt><dd id="stat-trend">—</dd>
  `);

  setupControls();
  updateAll();
}

// ─── Load ──────────────────────────────────────────────────────────────────────
async function loadAndRender() {
  try {
    init(await d3.csv(TEMP_PATH));
  } catch (_) {
    init(await d3.csv(SAMP_PATH));
  }
}

loadAndRender();
