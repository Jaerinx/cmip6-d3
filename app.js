const width = 900;
const height = 460;
const margin = { top: 30, right: 30, bottom: 48, left: 64 };

const samplePath = "./data/cmip6_sample.csv";
const primaryPath = "./data/cmip6_timeseries.csv";

function parseRow(d) {
  return {
    year: +d.year,
    anomaly_c: +d.anomaly_c,
  };
}

function render(data) {
  const cleaned = data
    .map(parseRow)
    .filter((d) => Number.isFinite(d.year) && Number.isFinite(d.anomaly_c))
    .sort((a, b) => a.year - b.year);

  if (!cleaned.length) {
    d3.select("#chart").append("p").text("No valid rows found.");
    return;
  }

  const svg = d3
    .select("#chart")
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("width", width)
    .attr("height", height);

  const x = d3
    .scaleLinear()
    .domain(d3.extent(cleaned, (d) => d.year))
    .range([margin.left, width - margin.right]);

  const yExtent = d3.extent(cleaned, (d) => d.anomaly_c);
  const yPadding = 0.1;
  const y = d3
    .scaleLinear()
    .domain([yExtent[0] - yPadding, yExtent[1] + yPadding])
    .nice()
    .range([height - margin.bottom, margin.top]);

  const yGrid = d3.axisLeft(y).tickSize(-(width - margin.left - margin.right)).tickFormat("");
  svg
    .append("g")
    .attr("class", "grid")
    .attr("transform", `translate(${margin.left},0)`)
    .call(yGrid);

  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")));

  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));

  const line = d3
    .line()
    .x((d) => x(d.year))
    .y((d) => y(d.anomaly_c));

  svg
    .append("path")
    .datum(cleaned)
    .attr("class", "line")
    .attr("d", line);

  svg
    .selectAll(".dot")
    .data(cleaned)
    .enter()
    .append("circle")
    .attr("class", "dot")
    .attr("r", 2.5)
    .attr("cx", (d) => x(d.year))
    .attr("cy", (d) => y(d.anomaly_c));

  svg
    .append("text")
    .attr("class", "label")
    .attr("x", width / 2)
    .attr("y", height - 8)
    .attr("text-anchor", "middle")
    .text("Year");

  svg
    .append("text")
    .attr("class", "label")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", 18)
    .attr("text-anchor", "middle")
    .text("Temperature Anomaly (°C)");
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
