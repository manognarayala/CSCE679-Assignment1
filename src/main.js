import * as d3 from "d3";
import "./style.css";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// 11 colors, purple = cold (0C) to dark red = hot (40C), same as the sample
const COLORS = [
  "#5e4fa2", "#3288bd", "#66c2a5", "#abdda4", "#e6f598",
  "#ffffbf", "#fee08b", "#fdae61", "#f46d43", "#d53e4f", "#9e0142",
];
const TEMP_MIN = 0;
const TEMP_MAX = 40;

// splits 0-40 into 11 equal steps and gives each step one color
const colorScale = d3.scaleQuantize().domain([TEMP_MIN, TEMP_MAX]).range(COLORS);

const MAX_LINE = "#31a354"; // green
const MIN_LINE = "#9ecae1"; // light blue

const tooltip = d3.select("#tooltip");
const status = document.getElementById("status");

d3.csv("temperature_daily.csv", (row) => ({
  date: d3.timeParse("%Y-%m-%d")(row.date),
  max: +row.max_temperature,
  min: +row.min_temperature,
}))
  .then(start)
  .catch((error) => {
    console.error(error);
    status.textContent = "Could not load temperature_daily.csv.";
    status.classList.add("error");
  });

function start(days) {
  // group the days by year then month. month 0 = January
  const grouped = d3.rollup(
    days,
    (rows) => ({
      max: d3.max(rows, (r) => r.max), // hottest day of the month
      min: d3.min(rows, (r) => r.min), // coldest night of the month
      days: rows,
    }),
    (r) => r.date.getFullYear(),
    (r) => r.date.getMonth(),
  );

  // turn it into a flat list, one item per cell
  const months = [];
  for (const [year, byMonth] of grouped) {
    for (const [month, info] of byMonth) {
      months.push({ year, month, ...info });
    }
  }

  const years = Array.from(grouped.keys()).sort(d3.ascending);

  status.remove();

  // level 1 uses all the years, small cells, no lines
  drawHeatmap({
    container: "#level1",
    years,
    months,
    cellWidth: 40,
    cellHeight: 28,
    lines: false,
  });

  // level 2 only uses the last 10 years, bigger cells with lines inside
  drawHeatmap({
    container: "#level2",
    years: years.slice(-10),
    months,
    cellWidth: 80,
    cellHeight: 58,
    lines: true,
  });
}

function drawHeatmap({ container, years, months, cellWidth, cellHeight, lines }) {
  const margin = { top: 40, right: 120, bottom: 10, left: 100 };
  const width = years.length * cellWidth;
  const height = 12 * cellHeight;

  const root = d3.select(container);
  let mode = "max"; // which temperature colors the cells

  // the Maximum / Minimum buttons
  const buttons = root.append("div").attr("class", "buttons");
  const buttonData = [
    { label: "Maximum", value: "max" },
    { label: "Minimum", value: "min" },
  ];

  const svg = root
    .append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  // x = year, y = month (january on top)
  const x = d3.scaleBand().domain(years).range([0, width]).padding(0.06);
  const y = d3.scaleBand().domain(d3.range(12)).range([0, height]).padding(0.06);

  g.append("g").call(d3.axisTop(x).tickSizeOuter(0));
  g.append("g").call(d3.axisLeft(y).tickFormat((m) => MONTHS[m]).tickSizeOuter(0));

  // only keep the cells for the years in this chart
  const cells = months.filter((m) => years.includes(m.year));

  const cellGroups = g
    .selectAll(".cell")
    .data(cells)
    .join("g")
    .attr("class", "cell")
    .attr("transform", (d) => `translate(${x(d.year)},${y(d.month)})`);

  const rects = cellGroups
    .append("rect")
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth())
    .attr("fill", (d) => colorScale(d[mode]));

  // small line chart inside each cell (level 2 only)
  if (lines) {
    const pad = 4;
    // x: day 1 to 31, y: 0C to 40C. same scales in every cell
    const dayScale = d3.scaleLinear().domain([1, 31]).range([pad, x.bandwidth() - pad]);
    const tempScale = d3.scaleLinear().domain([TEMP_MIN, TEMP_MAX]).range([y.bandwidth() - pad, pad]);

    const makeLine = (key) =>
      d3.line()
        .x((r) => dayScale(r.date.getDate()))
        .y((r) => tempScale(r[key]));

    // pointer-events none so the mouse still hits the rect under the line
    cellGroups
      .append("path")
      .attr("d", (d) => makeLine("max")(d.days))
      .attr("fill", "none")
      .attr("stroke", MAX_LINE)
      .attr("stroke-width", 1.5)
      .style("pointer-events", "none");

    cellGroups
      .append("path")
      .attr("d", (d) => makeLine("min")(d.days))
      .attr("fill", "none")
      .attr("stroke", MIN_LINE)
      .attr("stroke-width", 1.5)
      .style("pointer-events", "none");
  }

  // tooltip, shows the date and both temperatures like the sample
  rects
    .on("mouseenter mousemove", (event, d) => {
      const month = String(d.month + 1).padStart(2, "0");
      tooltip
        .text(`Date: ${d.year}-${month}, max: ${d.max} min: ${d.min}`)
        .style("left", `${event.clientX + 14}px`)
        .style("top", `${event.clientY + 14}px`)
        .style("opacity", 1);
    })
    .on("mouseleave", () => tooltip.style("opacity", 0));

  drawLegend(svg, width + margin.left + 30, margin.top);

  // buttons change the mode and recolor the cells
  buttons
    .selectAll("button")
    .data(buttonData)
    .join("button")
    .text((b) => b.label)
    .classed("active", (b) => b.value === mode)
    .on("click", (event, b) => {
      mode = b.value;
      buttons.selectAll("button").classed("active", (other) => other.value === mode);
      rects
        .transition()
        .duration(300)
        .attr("fill", (d) => colorScale(d[mode]));
    });
}

// vertical color bar: 0 Celsius (purple) on top, 40 Celsius (dark red) at the bottom
function drawLegend(svg, left, top) {
  const legendHeight = 220;
  const barWidth = 16;
  const scale = d3.scaleLinear().domain([TEMP_MIN, TEMP_MAX]).range([0, legendHeight]);

  const legend = svg.append("g").attr("transform", `translate(${left},${top})`);

  // each color covers one step of temperatures, invertExtent gives the start and end
  legend
    .selectAll("rect")
    .data(COLORS)
    .join("rect")
    .attr("width", barWidth)
    .attr("y", (c) => scale(colorScale.invertExtent(c)[0]))
    .attr("height", (c) => {
      const [low, high] = colorScale.invertExtent(c);
      return scale(high) - scale(low);
    })
    .attr("fill", (c) => c);

  legend
    .append("g")
    .attr("transform", `translate(${barWidth},0)`)
    .call(d3.axisRight(scale).tickValues([0, 10, 20, 30, 40]).tickSizeOuter(0));

  legend
    .append("text")
    .attr("x", 0)
    .attr("y", -10)
    .text("Celsius");
}
