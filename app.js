const chartWidth = 500;
const chartHeight = 280;
const margin = { top: 22, right: 20, bottom: 40, left: 56 };

const samplePath = "./data/cmip6_sample.csv";
const primaryPath = "./data/cmip6_timeseries.csv";

function parseRow(d) {
  return {
    year: +d.year,
    anomaly_c: +d.anomaly_c,
  };
}

function chartInnerWidth() {
  return chartWidth - margin.left - margin.right;
}

function chartInnerHeight() {
  return chartHeight - margin.top - margin.bottom;
}

function createCard(root, title, subtitle) {
  const card = root.append("section").attr("class", "chart-card");
  card.append("h2").text(title);
  card.append("p").attr("class", "subtitle").text(subtitle);
  const svg = card
    .append("svg")
    .attr("viewBox", `0 0 ${chartWidth} ${chartHeight}`)
    .attr("width", "100%")
    .attr("height", chartHeight);
  return svg;
}

function addAxes(svg, x, y, xFormat = null) {
  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${chartHeight - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat(xFormat || ((d) => d)));

  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(6));
}

function addYGrid(svg, y) {
  const yGrid = d3
    .axisLeft(y)
    .ticks(6)
    .tickSize(-(chartWidth - margin.left - margin.right))
    .tickFormat("");

  svg
    .append("g")
    .attr("class", "grid")
    .attr("transform", `translate(${margin.left},0)`)
    .call(yGrid);
}

function addAxisLabels(svg, xLabel, yLabel) {
  svg
    .append("text")
    .attr("class", "label")
    .attr("x", chartWidth / 2)
    .attr("y", chartHeight - 6)
    .attr("text-anchor", "middle")
    .text(xLabel);

  svg
    .append("text")
    .attr("class", "label")
    .attr("transform", "rotate(-90)")
    .attr("x", -chartHeight / 2)
    .attr("y", 14)
    .attr("text-anchor", "middle")
    .text(yLabel);
}

function getTooltip() {
  let tip = d3.select("body").select(".tooltip");
  if (tip.empty()) {
    tip = d3.select("body").append("div").attr("class", "tooltip");
  }
  return tip;
}

function bindTooltip(selection, contentFn) {
  const tip = getTooltip();
  selection
    .attr("class", function () {
      const prev = d3.select(this).attr("class") || "";
      return `${prev} data-point`.trim();
    })
    .on("mousemove", (event, d) => {
      tip
        .style("opacity", 1)
        .style("transform", "translateY(0)")
        .style("left", `${event.clientX + 12}px`)
        .style("top", `${event.clientY - 14}px`)
        .html(contentFn(d));
    })
    .on("mouseleave", () => {
      tip.style("opacity", 0).style("transform", "translateY(2px)");
    });
}

function renderLineChart(root, cleaned) {
  const svg = createCard(root, "1) Yearly Anomaly (Line)", "Trend over time");
  const x = d3
    .scaleLinear()
    .domain(d3.extent(cleaned, (d) => d.year))
    .range([margin.left, chartWidth - margin.right]);

  const yExtent = d3.extent(cleaned, (d) => d.anomaly_c);
  const y = d3
    .scaleLinear()
    .domain([yExtent[0] - 0.1, yExtent[1] + 0.1])
    .nice()
    .range([chartHeight - margin.bottom, margin.top]);

  addYGrid(svg, y);
  addAxes(svg, x, y, d3.format("d"));
  svg
    .append("line")
    .attr("class", "zero-line")
    .attr("x1", margin.left)
    .attr("x2", chartWidth - margin.right)
    .attr("y1", y(0))
    .attr("y2", y(0));

  const line = d3
    .line()
    .x((d) => x(d.year))
    .y((d) => y(d.anomaly_c));

  svg.append("path").datum(cleaned).attr("class", "line").attr("d", line);
  const points = svg
    .selectAll(".line-point")
    .data(cleaned)
    .enter()
    .append("circle")
    .attr("class", "line-point")
    .attr("r", 2.6)
    .attr("cx", (d) => x(d.year))
    .attr("cy", (d) => y(d.anomaly_c))
    .attr("fill", "#dc2626");
  bindTooltip(points, (d) => `Year: <b>${d.year}</b><br/>Anomaly: <b>${d.anomaly_c.toFixed(3)} °C</b>`);
  addAxisLabels(svg, "Year", "Anomaly (°C)");
}

function renderDecadeBarChart(root, cleaned) {
  const decadeData = d3
    .rollups(
      cleaned,
      (v) => d3.mean(v, (d) => d.anomaly_c),
      (d) => Math.floor(d.year / 10) * 10
    )
    .map(([decade, mean]) => ({ decade, mean }))
    .sort((a, b) => a.decade - b.decade);

  const svg = createCard(root, "2) Decade Mean (Bars)", "Average anomaly per decade");
  const x = d3
    .scaleBand()
    .domain(decadeData.map((d) => d.decade))
    .range([margin.left, chartWidth - margin.right])
    .padding(0.15);

  const y = d3
    .scaleLinear()
    .domain([
      Math.min(0, d3.min(decadeData, (d) => d.mean) - 0.05),
      d3.max(decadeData, (d) => d.mean) + 0.05,
    ])
    .nice()
    .range([chartHeight - margin.bottom, margin.top]);

  addYGrid(svg, y);
  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${chartHeight - margin.bottom})`)
    .call(d3.axisBottom(x).tickFormat((d) => `${d}s`).tickValues(x.domain().filter((_, i) => i % 2 === 0)));
  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(6));

  svg
    .append("line")
    .attr("class", "zero-line")
    .attr("x1", margin.left)
    .attr("x2", chartWidth - margin.right)
    .attr("y1", y(0))
    .attr("y2", y(0));

  const bars = svg
    .selectAll(".decade-bar")
    .data(decadeData)
    .enter()
    .append("rect")
    .attr("class", (d) => (d.mean < 0 ? "bar bar-negative" : "bar"))
    .attr("x", (d) => x(d.decade))
    .attr("y", (d) => Math.min(y(0), y(d.mean)))
    .attr("height", (d) => Math.abs(y(d.mean) - y(0)))
    .attr("width", x.bandwidth());
  bindTooltip(bars, (d) => `Decade: <b>${d.decade}s</b><br/>Mean anomaly: <b>${d.mean.toFixed(3)} °C</b>`);
  addAxisLabels(svg, "Decade", "Mean anomaly (°C)");
}

function renderRollingMeanChart(root, cleaned) {
  const rolling = cleaned.map((d, i) => {
    const start = Math.max(0, i - 9);
    const window = cleaned.slice(start, i + 1);
    return {
      year: d.year,
      rolling: d3.mean(window, (w) => w.anomaly_c),
    };
  });

  const svg = createCard(root, "3) 10-Year Rolling Mean", "Smoothed warming signal");
  const x = d3
    .scaleLinear()
    .domain(d3.extent(rolling, (d) => d.year))
    .range([margin.left, chartWidth - margin.right]);
  const y = d3
    .scaleLinear()
    .domain(d3.extent(rolling, (d) => d.rolling))
    .nice()
    .range([chartHeight - margin.bottom, margin.top]);

  addYGrid(svg, y);
  addAxes(svg, x, y, d3.format("d"));

  const line = d3
    .line()
    .x((d) => x(d.year))
    .y((d) => y(d.rolling));

  svg
    .append("path")
    .datum(rolling)
    .attr("fill", "none")
    .attr("stroke", "#8b5cf6")
    .attr("stroke-width", 2.5)
    .attr("d", line);
  const points = svg
    .selectAll(".rolling-point")
    .data(rolling)
    .enter()
    .append("circle")
    .attr("class", "rolling-point")
    .attr("r", 2.4)
    .attr("cx", (d) => x(d.year))
    .attr("cy", (d) => y(d.rolling))
    .attr("fill", "#7c3aed");
  bindTooltip(points, (d) => `Year: <b>${d.year}</b><br/>10yr mean: <b>${d.rolling.toFixed(3)} °C</b>`);
  addAxisLabels(svg, "Year", "10-year mean (°C)");
}

function renderHistogram(root, cleaned) {
  const values = cleaned.map((d) => d.anomaly_c);
  const bins = d3.bin().domain(d3.extent(values)).thresholds(12)(values);

  const svg = createCard(root, "4) Distribution (Histogram)", "Frequency of anomaly values");
  const x = d3
    .scaleLinear()
    .domain([bins[0].x0, bins[bins.length - 1].x1])
    .nice()
    .range([margin.left, chartWidth - margin.right]);
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(bins, (d) => d.length)])
    .nice()
    .range([chartHeight - margin.bottom, margin.top]);

  addYGrid(svg, y);
  addAxes(svg, x, y);

  const bars = svg
    .selectAll(".hist")
    .data(bins)
    .enter()
    .append("rect")
    .attr("class", "hist-bar")
    .attr("x", (d) => x(d.x0) + 1)
    .attr("y", (d) => y(d.length))
    .attr("width", (d) => Math.max(0, x(d.x1) - x(d.x0) - 2))
    .attr("height", (d) => y(0) - y(d.length));
  bindTooltip(
    bars,
    (d) =>
      `Bin: <b>${d.x0.toFixed(2)} to ${d.x1.toFixed(2)} °C</b><br/>Count: <b>${d.length}</b>`
  );
  addAxisLabels(svg, "Anomaly (°C)", "Count");
}

function renderYearlyChangeChart(root, cleaned) {
  const deltas = cleaned.slice(1).map((d, i) => ({
    year: d.year,
    delta: d.anomaly_c - cleaned[i].anomaly_c,
  }));

  const svg = createCard(root, "5) Year-to-Year Change", "Annual anomaly difference");
  const x = d3
    .scaleLinear()
    .domain(d3.extent(deltas, (d) => d.year))
    .range([margin.left, chartWidth - margin.right]);
  const y = d3
    .scaleLinear()
    .domain([
      d3.min(deltas, (d) => d.delta) - 0.02,
      d3.max(deltas, (d) => d.delta) + 0.02,
    ])
    .nice()
    .range([chartHeight - margin.bottom, margin.top]);

  addYGrid(svg, y);
  addAxes(svg, x, y, d3.format("d"));
  svg
    .append("line")
    .attr("class", "zero-line")
    .attr("x1", margin.left)
    .attr("x2", chartWidth - margin.right)
    .attr("y1", y(0))
    .attr("y2", y(0));

  const bars = svg
    .selectAll(".delta-bar")
    .data(deltas)
    .enter()
    .append("rect")
    .attr("class", (d) => (d.delta >= 0 ? "delta-positive" : "delta-negative"))
    .attr("x", (d) => x(d.year) - 1.4)
    .attr("width", 2.8)
    .attr("y", (d) => Math.min(y(0), y(d.delta)))
    .attr("height", (d) => Math.abs(y(d.delta) - y(0)));
  bindTooltip(bars, (d) => `Year: <b>${d.year}</b><br/>Delta: <b>${d.delta.toFixed(3)} °C</b>`);
  addAxisLabels(svg, "Year", "Delta anomaly (°C)");
}

function renderWarmestYearsChart(root, cleaned) {
  const top = [...cleaned].sort((a, b) => b.anomaly_c - a.anomaly_c).slice(0, 10).reverse();
  const svg = createCard(root, "6) Top 10 Warmest Years", "Highest anomaly years");
  const x = d3
    .scaleLinear()
    .domain([0, d3.max(top, (d) => d.anomaly_c) + 0.05])
    .nice()
    .range([margin.left, chartWidth - margin.right]);
  const y = d3
    .scaleBand()
    .domain(top.map((d) => d.year))
    .range([chartHeight - margin.bottom, margin.top])
    .padding(0.18);

  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${chartHeight - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(6));
  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickFormat(d3.format("d")));

  const bars = svg
    .selectAll(".warmest-bar")
    .data(top)
    .enter()
    .append("rect")
    .attr("x", margin.left)
    .attr("y", (d) => y(d.year))
    .attr("height", y.bandwidth())
    .attr("width", (d) => x(d.anomaly_c) - margin.left)
    .attr("fill", "#f97316");

  svg
    .selectAll(".warmest-label")
    .data(top)
    .enter()
    .append("text")
    .attr("class", "label")
    .attr("x", (d) => x(d.anomaly_c) + 4)
    .attr("y", (d) => y(d.year) + y.bandwidth() / 2 + 4)
    .text((d) => d.anomaly_c.toFixed(2));
  bindTooltip(bars, (d) => `Year: <b>${d.year}</b><br/>Anomaly: <b>${d.anomaly_c.toFixed(3)} °C</b>`);
  addAxisLabels(svg, "Anomaly (°C)", "Year");
}

function render(data) {
  const cleaned = data
    .map(parseRow)
    .filter((d) => Number.isFinite(d.year) && Number.isFinite(d.anomaly_c))
    .sort((a, b) => a.year - b.year);

  if (!cleaned.length) {
    d3.select("#dashboard").append("p").text("No valid rows found.");
    return;
  }

  const root = d3.select("#dashboard");
  root.html("");

  renderLineChart(root, cleaned);
  renderDecadeBarChart(root, cleaned);
  renderRollingMeanChart(root, cleaned);
  renderHistogram(root, cleaned);
  renderYearlyChangeChart(root, cleaned);
  renderWarmestYearsChart(root, cleaned);
}

async function loadAndRender() {
  try {
    const data = await d3.csv(primaryPath);
    render(data);
    return;
  } catch (_) {
    // Fallback is useful before the user exports real CMIP6 data.
  }

  const fallback = await d3.csv(samplePath);
  render(fallback);
}

loadAndRender();
