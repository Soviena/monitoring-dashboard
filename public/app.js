(() => {
  "use strict";

  const REFRESH_MS = 5000;

  const css = getComputedStyle(document.documentElement);
  const colors = {
    cpu: css.getPropertyValue("--series-cpu").trim(),
    memory: css.getPropertyValue("--series-memory").trim(),
    network: css.getPropertyValue("--series-network").trim(),
    requests: css.getPropertyValue("--series-requests").trim(),
    grid: css.getPropertyValue("--grid").trim(),
    baseline: css.getPropertyValue("--baseline").trim(),
    textMuted: css.getPropertyValue("--text-muted").trim(),
    textSecondary: css.getPropertyValue("--text-secondary").trim(),
    surface1: css.getPropertyValue("--surface-1").trim(),
    good: css.getPropertyValue("--status-good").trim(),
    warning: css.getPropertyValue("--status-warning").trim(),
    serious: css.getPropertyValue("--status-serious").trim(),
    critical: css.getPropertyValue("--status-critical").trim(),
  };

  const statusLabel = { good: "Operational", warning: "Degraded", serious: "Impaired", critical: "Outage" };
  const statusColor = { good: colors.good, warning: colors.warning, serious: colors.serious, critical: colors.critical };

  let previousStats = null;
  let latestHistory = [];

  // ---------- clock ----------

  function tickClock() {
    const el = document.getElementById("clock");
    el.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  tickClock();
  setInterval(tickClock, 1000);

  // ---------- formatting ----------

  function fmtPercent(v) {
    return `${v.toFixed(1)}%`;
  }
  function fmtUnit(v, unit) {
    return `${Math.round(v)} ${unit}`;
  }
  function fmtDelta(curr, prev, unit) {
    if (prev == null) return "";
    const d = curr - prev;
    if (Math.abs(d) < 0.05) return `· flat`;
    const sign = d > 0 ? "+" : "";
    return `${sign}${d.toFixed(1)}${unit}`;
  }
  function fmtTime(t) {
    return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  // ---------- sparklines (stat tiles) ----------

  function drawSparkline(canvas, series, color) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 120;
    const h = canvas.clientHeight || 36;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (!series.length) return;

    const pad = 3;
    const min = Math.min(...series);
    const max = Math.max(...series);
    const range = max - min || 1;

    const toX = (i) => pad + (i / (series.length - 1 || 1)) * (w - pad * 2);
    const toY = (v) => h - pad - ((v - min) / range) * (h - pad * 2);

    // area wash under the line
    ctx.beginPath();
    ctx.moveTo(toX(0), h);
    series.forEach((v, i) => ctx.lineTo(toX(i), toY(v)));
    ctx.lineTo(toX(series.length - 1), h);
    ctx.closePath();
    ctx.fillStyle = color + "1a"; // ~10% opacity
    ctx.fill();

    // line
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = color;
    series.forEach((v, i) => {
      const x = toX(i), y = toY(v);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // end marker with surface ring
    const lastX = toX(series.length - 1);
    const lastY = toY(series[series.length - 1]);
    ctx.beginPath();
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fillStyle = colors.surface1;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lastX, lastY, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // ---------- stat tiles ----------

  function updateStatTile(key, value, unit, isPercent) {
    const valueEl = document.getElementById(`${key}Value`);
    const deltaEl = document.getElementById(`${key}Delta`);
    valueEl.textContent = isPercent ? fmtPercent(value) : fmtUnit(value, unit);

    const prev = previousStats ? previousStats[key] : null;
    const deltaText = fmtDelta(value, prev, isPercent ? "%" : "");
    deltaEl.textContent = deltaText;
    deltaEl.className = "stat-delta " + (prev != null && value > prev ? "up" : prev != null && value < prev ? "down" : "");

    const spark = document.getElementById(`${key}Spark`);
    const series = latestHistory.map((p) => p[key]);
    drawSparkline(spark, series, colors[key]);
  }

  // ---------- main chart ----------

  const chartCanvas = document.getElementById("mainChart");
  const tooltip = document.getElementById("chartTooltip");
  let chartGeometry = null;

  function layoutMainChart() {
    const dpr = window.devicePixelRatio || 1;
    const w = chartCanvas.clientWidth;
    const h = chartCanvas.clientHeight;
    chartCanvas.width = w * dpr;
    chartCanvas.height = h * dpr;
    const ctx = chartCanvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  function drawMainChart() {
    const { ctx, w, h } = layoutMainChart();
    ctx.clearRect(0, 0, w, h);
    if (!latestHistory.length) return;

    const pad = { left: 34, right: 10, top: 10, bottom: 22 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const toX = (i) => pad.left + (i / (latestHistory.length - 1 || 1)) * plotW;
    const toY = (v) => pad.top + plotH - (v / 100) * plotH;

    // gridlines + y labels at 0 / 50 / 100
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.fillStyle = colors.textMuted;
    ctx.font = "11px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    [0, 50, 100].forEach((v) => {
      const y = toY(v);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillText(String(v), pad.left - 8, y);
    });

    // baseline
    ctx.strokeStyle = colors.baseline;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top + plotH);
    ctx.lineTo(w - pad.right, pad.top + plotH);
    ctx.stroke();

    // x labels: first, middle, last — edge labels anchor inward so they never clip
    ctx.textBaseline = "top";
    const labelY = pad.top + plotH + 6;
    ctx.textAlign = "left";
    ctx.fillText(fmtTime(latestHistory[0].t), toX(0), labelY);
    ctx.textAlign = "center";
    const midIdx = Math.floor((latestHistory.length - 1) / 2);
    ctx.fillText(fmtTime(latestHistory[midIdx].t), toX(midIdx), labelY);
    ctx.textAlign = "right";
    ctx.fillText(fmtTime(latestHistory[latestHistory.length - 1].t), toX(latestHistory.length - 1), labelY);

    function drawSeries(key, color) {
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = color;
      latestHistory.forEach((p, i) => {
        const x = toX(i), y = toY(p[key]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // end dot with surface ring
      const last = latestHistory[latestHistory.length - 1];
      const x = toX(latestHistory.length - 1), y = toY(last[key]);
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = colors.surface1;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }

    drawSeries("memory", colors.memory);
    drawSeries("cpu", colors.cpu);

    chartGeometry = { pad, plotW, plotH, toX, toY, w, h };
  }

  function onChartPointerMove(evt) {
    if (!chartGeometry || !latestHistory.length) return;
    const rect = chartCanvas.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const { pad, plotW } = chartGeometry;
    const ratio = Math.max(0, Math.min(1, (x - pad.left) / plotW));
    const idx = Math.round(ratio * (latestHistory.length - 1));
    const point = latestHistory[idx];
    if (!point) return;

    const px = chartGeometry.toX(idx);
    tooltip.hidden = false;
    tooltip.style.left = `${px}px`;
    tooltip.style.top = `${chartGeometry.pad.top}px`;

    tooltip.replaceChildren();
    const timeEl = document.createElement("div");
    timeEl.className = "tt-time";
    timeEl.textContent = fmtTime(point.t);
    tooltip.appendChild(timeEl);

    [["CPU", "cpu", colors.cpu], ["Memory", "memory", colors.memory]].forEach(([label, key, color]) => {
      const row = document.createElement("div");
      row.className = "tt-row";
      const keyEl = document.createElement("span");
      keyEl.className = "tt-key";
      keyEl.style.background = color;
      const labelEl = document.createElement("span");
      labelEl.textContent = label;
      const valueEl = document.createElement("span");
      valueEl.className = "tt-value";
      valueEl.textContent = `${point[key].toFixed(1)}%`;
      row.append(keyEl, labelEl, valueEl);
      tooltip.appendChild(row);
    });
  }

  function onChartPointerLeave() {
    tooltip.hidden = true;
  }

  chartCanvas.addEventListener("pointermove", onChartPointerMove);
  chartCanvas.addEventListener("pointerleave", onChartPointerLeave);

  // data table fallback (keeps values reachable without hovering)

  function renderChartTable() {
    const body = document.getElementById("chartTableBody");
    body.replaceChildren();
    latestHistory.forEach((p) => {
      const tr = document.createElement("tr");
      const tTime = document.createElement("td");
      tTime.textContent = fmtTime(p.t);
      const tCpu = document.createElement("td");
      tCpu.textContent = p.cpu.toFixed(1);
      const tMem = document.createElement("td");
      tMem.textContent = p.memory.toFixed(1);
      tr.append(tTime, tCpu, tMem);
      body.appendChild(tr);
    });
  }

  document.getElementById("toggleTable").addEventListener("click", (evt) => {
    const wrap = document.getElementById("chartTableWrap");
    const show = wrap.hidden;
    wrap.hidden = !show;
    evt.currentTarget.setAttribute("aria-expanded", String(show));
    evt.currentTarget.textContent = show ? "Hide data" : "View data";
  });

  // ---------- services & logs ----------

  function renderServices(services) {
    const list = document.getElementById("serviceList");
    list.replaceChildren();
    services.forEach((s) => {
      const li = document.createElement("li");
      const dot = document.createElement("span");
      dot.className = `status-dot status-${s.status}`;
      const name = document.createElement("span");
      name.className = "service-name";
      name.textContent = s.name;
      const status = document.createElement("span");
      status.className = "service-status";
      status.textContent = statusLabel[s.status] || s.status;
      li.append(dot, name, status);
      list.appendChild(li);
    });

    const worst = services.reduce((acc, s) => {
      const rank = { good: 0, warning: 1, serious: 2, critical: 3 };
      return rank[s.status] > rank[acc] ? s.status : acc;
    }, "good");
    document.getElementById("overallDot").className = `status-dot status-${worst}`;
    document.getElementById("overallLabel").textContent =
      worst === "good" ? "All systems operational" : `${statusLabel[worst]} — check services`;
  }

  function renderLogs(logs) {
    const list = document.getElementById("logList");
    list.replaceChildren();
    logs.forEach((log) => {
      const li = document.createElement("li");
      const time = document.createElement("span");
      time.className = "log-time";
      time.textContent = fmtTime(log.t);
      const badge = document.createElement("span");
      badge.className = `log-badge ${log.level}`;
      badge.textContent = log.level;
      const msg = document.createElement("span");
      msg.className = "log-message";
      msg.textContent = log.message;
      li.append(time, badge, msg);
      list.appendChild(li);
    });
  }

  // ---------- fetch loop ----------

  async function refresh() {
    try {
      const res = await fetch("/api/metrics", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      latestHistory = data.history;

      updateStatTile("cpu", data.stats.cpu, "%", true);
      updateStatTile("memory", data.stats.memory, "%", true);
      updateStatTile("network", data.stats.network, "Mbps", false);
      updateStatTile("requests", data.stats.requests, "req/s", false);

      drawMainChart();
      renderChartTable();
      renderServices(data.services);
      renderLogs(data.logs);

      previousStats = data.stats;
    } catch (err) {
      document.getElementById("overallLabel").textContent = "Connection lost — retrying…";
      document.getElementById("overallDot").className = "status-dot status-warning";
      console.error("metrics refresh failed", err);
    }
  }

  window.addEventListener("resize", () => {
    drawMainChart();
    ["cpu", "memory", "network", "requests"].forEach((key) => {
      const series = latestHistory.map((p) => p[key]);
      drawSparkline(document.getElementById(`${key}Spark`), series, colors[key]);
    });
  });

  refresh();
  setInterval(refresh, REFRESH_MS);
})();
