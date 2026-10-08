(() => {
  "use strict";

  const css = getComputedStyle(document.documentElement);
  const modelColor = {
    "Random Forest": css.getPropertyValue("--series-cpu").trim(),
    "SVM": css.getPropertyValue("--series-memory").trim(),
  };

  const history = [];
  const MAX_HISTORY = 10;

  function tickClock() {
    const el = document.getElementById("clock");
    el.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  tickClock();
  setInterval(tickClock, 1000);

  function fmtTime(t) {
    return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function predBadgeClass(prediction) {
    return prediction === "BAHAYA" ? "bahaya" : "aman";
  }

  function renderModelCard(result) {
    const card = document.createElement("div");
    card.className = "model-card";

    const head = document.createElement("div");
    head.className = "model-card-head";

    const name = document.createElement("span");
    name.className = "model-name";
    name.textContent = result.model;

    const badge = document.createElement("span");
    badge.className = `pred-badge ${predBadgeClass(result.prediction)}`;
    badge.textContent = result.prediction;

    head.append(name, badge);

    const row = document.createElement("div");
    row.className = "confidence-row";

    const track = document.createElement("div");
    track.className = "confidence-track";
    const fill = document.createElement("div");
    fill.className = "confidence-fill";
    fill.style.setProperty("--model-color", modelColor[result.model] || "var(--series-cpu)");
    fill.style.width = `${Math.round(result.confidence * 100)}%`;
    track.appendChild(fill);

    const value = document.createElement("span");
    value.className = "confidence-value";
    value.textContent = `${Math.round(result.confidence * 100)}%`;

    row.append(track, value);
    card.append(head, row);
    return card;
  }

  function renderResult(data, latencyMs) {
    const section = document.getElementById("resultSection");
    const pill = document.getElementById("statusPill");
    const latencyEl = document.getElementById("resultLatency");
    const body = document.getElementById("resultBody");

    section.hidden = false;
    latencyEl.textContent = `${latencyMs} ms round-trip`;

    pill.replaceChildren();
    body.replaceChildren();

    if (data.status === "success") {
      pill.className = "status-pill success";
      const dot = document.createElement("span");
      dot.className = "status-dot status-good";
      pill.append(dot, document.createTextNode("Success"));

      const grid = document.createElement("div");
      grid.className = "model-grid";
      data.result.forEach((r) => grid.appendChild(renderModelCard(r)));
      body.appendChild(grid);
    } else {
      pill.className = "status-pill error";
      const dot = document.createElement("span");
      dot.className = "status-dot status-critical";
      pill.append(dot, document.createTextNode("Error"));

      const box = document.createElement("div");
      box.className = "result-error-box";
      const msg = document.createElement("span");
      msg.textContent = data.message || "Unknown error";
      box.appendChild(msg);
      body.appendChild(box);
    }

    document.getElementById("rawJson").textContent = JSON.stringify(data, null, 2);
  }

  function renderHistory() {
    const list = document.getElementById("historyList");
    const empty = document.getElementById("historyEmpty");
    list.replaceChildren();

    if (!history.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    history.forEach((entry) => {
      const li = document.createElement("li");

      const dot = document.createElement("span");
      dot.className = `status-dot status-${entry.ok ? "good" : "critical"}`;

      const time = document.createElement("span");
      time.className = "history-time";
      time.textContent = fmtTime(entry.t);

      const input = document.createElement("span");
      input.className = "history-input";
      input.textContent = entry.input;

      const latency = document.createElement("span");
      latency.className = "history-latency";
      latency.textContent = `${entry.latencyMs} ms`;

      li.append(dot, time, input, latency);
      list.appendChild(li);
    });
  }

  document.getElementById("toggleRaw").addEventListener("click", (evt) => {
    const wrap = document.getElementById("rawJsonWrap");
    const show = wrap.hidden;
    wrap.hidden = !show;
    evt.currentTarget.setAttribute("aria-expanded", String(show));
    evt.currentTarget.textContent = show ? "Hide raw response" : "View raw response";
  });

  document.getElementById("testForm").addEventListener("submit", async (evt) => {
    evt.preventDefault();
    const input = document.getElementById("inputText").value.trim();
    if (!input) return;

    const btn = document.getElementById("submitBtn");
    btn.disabled = true;
    btn.textContent = "Running…";

    const start = performance.now();
    try {
      const res = await fetch(`/api/proses_ai?input=${encodeURIComponent(input)}`);
      const data = await res.json();
      const latencyMs = Math.round(performance.now() - start);

      renderResult(data, latencyMs);

      history.unshift({ t: Date.now(), input, ok: data.status === "success", latencyMs });
      if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
      renderHistory();
    } catch (err) {
      const latencyMs = Math.round(performance.now() - start);
      renderResult({ status: "error", message: `Request failed: ${err.message}`, result: [] }, latencyMs);
      history.unshift({ t: Date.now(), input, ok: false, latencyMs });
      if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
      renderHistory();
    } finally {
      btn.disabled = false;
      btn.textContent = "Run test";
    }
  });

  renderHistory();
})();
