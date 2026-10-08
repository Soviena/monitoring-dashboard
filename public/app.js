(() => {
  "use strict";

  const css = getComputedStyle(document.documentElement);
  const modelColor = {
    "Random Forest": css.getPropertyValue("--series-cpu").trim(),
    "SVM": css.getPropertyValue("--series-memory").trim(),
  };

  const DEFAULT_INPUT = "pemeriksaan otomatis saat memuat dashboard";
  const MAX_HISTORY = 8;
  const history = [];
  let heroEverSucceeded = false;

  // ---------- clock ----------

  function tickClock() {
    const el = document.getElementById("clock");
    el.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  tickClock();
  setInterval(tickClock, 1000);

  function fmtTime(t) {
    return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function truncate(str, n = 60) {
    return str.length > n ? `${str.slice(0, n)}…` : str;
  }

  // ---------- log console ----------

  const MAX_CONSOLE_LINES = 200;

  function logConsole({ tag, dir, text, level = "info" }) {
    const log = document.getElementById("consoleLog");
    const empty = document.getElementById("consoleEmpty");
    if (empty) empty.hidden = true;

    const line = document.createElement("div");
    line.className = "console-line";

    const now = new Date();
    const time = document.createElement("span");
    time.className = "console-time";
    time.textContent = `${fmtTime(now.getTime())}.${String(now.getMilliseconds()).padStart(3, "0")}`;

    const tagEl = document.createElement("span");
    tagEl.className = `console-tag ${tag}`;
    tagEl.textContent = tag.toUpperCase();

    const dirEl = document.createElement("span");
    dirEl.className = "console-dir";
    dirEl.textContent = dir === "req" ? "→" : "←";

    const msgEl = document.createElement("span");
    msgEl.className = `console-msg ${level}`;
    msgEl.textContent = text;

    line.append(time, tagEl, dirEl, msgEl);
    log.appendChild(line);

    while (log.children.length > MAX_CONSOLE_LINES) {
      log.removeChild(log.firstChild);
    }
    log.scrollTop = log.scrollHeight;
  }

  document.getElementById("consoleClearBtn").addEventListener("click", () => {
    document.getElementById("consoleLog").replaceChildren(document.getElementById("consoleEmpty"));
    document.getElementById("consoleEmpty").hidden = false;
  });

  // ---------- hero (STATUS KEAMANAN SISTEM) ----------

  function applyHeroState(verdict, timestamp) {
    const hero = document.getElementById("securityHero");
    const title = document.getElementById("heroTitle");
    const subtitle = document.getElementById("heroSubtitle");
    const checked = document.getElementById("heroChecked");
    const overallDot = document.getElementById("overallDot");
    const overallLabel = document.getElementById("overallLabel");

    const isAman = verdict === "AMAN";
    hero.classList.toggle("state-aman", isAman);
    hero.classList.toggle("state-bahaya", !isAman);

    title.textContent = isAman ? "SYSTEM SECURED" : "LEVEL ALERT : CRITICAL";
    subtitle.textContent = isAman
      ? "Tidak ada ancaman terdeteksi dari pemeriksaan terakhir."
      : "Ancaman terdeteksi — segera lakukan tindak lanjut.";
    checked.textContent = `Diperiksa ${fmtTime(timestamp)}`;

    overallDot.className = `status-dot status-${isAman ? "good" : "critical"}`;
    overallLabel.textContent = isAman ? "Aman" : "Bahaya terdeteksi";

    heroEverSucceeded = true;
  }

  // ---------- result rendering (shared shape with test-ai.js) ----------

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

  function renderSyncResult(data, latencyMs) {
    const metaWrap = document.getElementById("syncResultMeta");
    const pill = document.getElementById("syncStatusPill");
    const latencyEl = document.getElementById("syncLatency");
    const body = document.getElementById("syncResultBody");

    metaWrap.hidden = false;
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
  }

  function renderHistory() {
    const wrap = document.getElementById("aiHistoryWrap");
    const list = document.getElementById("aiHistoryList");
    if (!history.length) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    list.replaceChildren();

    history.forEach((entry) => {
      const li = document.createElement("li");

      const dot = document.createElement("span");
      dot.className = `status-dot status-${entry.dotStatus}`;

      const time = document.createElement("span");
      time.className = "history-time";
      time.textContent = fmtTime(entry.t);

      const input = document.createElement("span");
      input.className = "history-input";
      input.textContent = entry.verdictLabel ? `${entry.input} · ${entry.verdictLabel}` : entry.input;

      const latency = document.createElement("span");
      latency.className = "history-latency";
      latency.textContent = `${entry.latencyMs} ms`;

      li.append(dot, time, input, latency);
      list.appendChild(li);
    });
  }

  // ---------- run the 2 synchronous AI calls ----------

  async function runSync(input, { isAuto = false, allowRetry = true } = {}) {
    const btn = document.getElementById("syncSubmitBtn");
    btn.disabled = true;
    btn.textContent = "Memproses…";

    const start = performance.now();
    logConsole({ tag: "ai", dir: "req", text: `GET /api/proses_ai?input="${truncate(input)}"` });

    try {
      const res = await fetch(`/api/proses_ai?input=${encodeURIComponent(input)}`);
      const data = await res.json();
      const latencyMs = Math.round(performance.now() - start);
      const waitPart = data.wait_time_ms != null ? `wait ${data.wait_time_ms}ms · ` : "";

      if (data.status === "success") {
        const [rf, svm] = data.result;
        logConsole({
          tag: "ai",
          dir: "res",
          level: "success",
          text: `${res.status} success · RF=${rf.prediction} ${Math.round(rf.confidence * 100)}% · SVM=${svm.prediction} ${Math.round(svm.confidence * 100)}% · ${waitPart}rtt ${latencyMs}ms`,
        });
      } else {
        logConsole({
          tag: "ai",
          dir: "res",
          level: "error",
          text: `${res.status} error · ${data.message} · ${waitPart}rtt ${latencyMs}ms`,
        });
      }

      renderSyncResult(data, latencyMs);

      if (data.status === "success") {
        const verdict = data.result.some((r) => r.prediction === "BAHAYA") ? "BAHAYA" : "AMAN";
        applyHeroState(verdict, Date.now());
        history.unshift({ t: Date.now(), input, dotStatus: verdict === "AMAN" ? "good" : "critical", verdictLabel: verdict, latencyMs });
      } else if (isAuto && !heroEverSucceeded && allowRetry) {
        // initial load hit the simulated failure path — retry once silently
        btn.disabled = false;
        btn.textContent = "Jalankan analisis";
        return runSync(input, { isAuto: true, allowRetry: false });
      } else {
        history.unshift({ t: Date.now(), input, dotStatus: "warning", verdictLabel: "ERROR", latencyMs });
      }

      if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
      renderHistory();
    } catch (err) {
      const latencyMs = Math.round(performance.now() - start);
      logConsole({ tag: "ai", dir: "res", level: "error", text: `network error · ${err.message} · rtt ${latencyMs}ms` });
      renderSyncResult({ status: "error", message: `Request failed: ${err.message}`, result: [] }, latencyMs);
      history.unshift({ t: Date.now(), input, dotStatus: "warning", verdictLabel: "ERROR", latencyMs });
      if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
      renderHistory();
    } finally {
      btn.disabled = false;
      btn.textContent = "Jalankan analisis";
    }
  }

  document.getElementById("syncForm").addEventListener("submit", (evt) => {
    evt.preventDefault();
    const input = document.getElementById("syncInput").value.trim();
    if (!input) return;
    runSync(input);
  });

  // initial automatic check so the dashboard isn't empty on load
  runSync(DEFAULT_INPUT, { isAuto: true });

  // ---------- webhook test card ----------

  const webhookHistory = [];

  async function hmacSha256Hex(secret, message) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(message));
    return Array.from(new Uint8Array(sigBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function updateSignaturePreview() {
    const secret = document.getElementById("hmacSecret").value;
    const text = document.getElementById("webhookText").value;
    const preview = document.getElementById("sigPreview");
    if (!secret || !text) {
      preview.textContent = "—";
      return;
    }
    preview.textContent = await hmacSha256Hex(secret, text);
  }

  document.getElementById("hmacSecret").addEventListener("input", updateSignaturePreview);
  document.getElementById("webhookText").addEventListener("input", updateSignaturePreview);

  function renderWebhookResult(data, latencyMs, ok) {
    const metaWrap = document.getElementById("webhookResultMeta");
    const pill = document.getElementById("webhookStatusPill");
    const latencyEl = document.getElementById("webhookLatency");
    const body = document.getElementById("webhookResultBody");

    metaWrap.hidden = false;
    latencyEl.textContent = `${latencyMs} ms round-trip`;
    pill.replaceChildren();
    body.replaceChildren();

    pill.className = `status-pill ${ok ? "success" : "error"}`;
    const dot = document.createElement("span");
    dot.className = `status-dot status-${ok ? "good" : "critical"}`;
    pill.append(dot, document.createTextNode(ok ? "Success" : "Error"));

    const box = document.createElement("div");
    box.className = "result-error-box";
    box.style.borderLeftColor = ok ? "var(--status-good)" : "var(--status-critical)";
    const msg = document.createElement("span");
    msg.textContent = data.message || (ok ? "Terkirim ke Telegram" : "Unknown error");
    box.appendChild(msg);
    body.appendChild(box);
  }

  function renderWebhookHistory() {
    const wrap = document.getElementById("webhookHistoryWrap");
    const list = document.getElementById("webhookHistoryList");
    if (!webhookHistory.length) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    list.replaceChildren();

    webhookHistory.forEach((entry) => {
      const li = document.createElement("li");

      const dot = document.createElement("span");
      dot.className = `status-dot status-${entry.ok ? "good" : "critical"}`;

      const time = document.createElement("span");
      time.className = "history-time";
      time.textContent = fmtTime(entry.t);

      const input = document.createElement("span");
      input.className = "history-input";
      input.textContent = entry.textSnippet;

      const latency = document.createElement("span");
      latency.className = "history-latency";
      latency.textContent = `${entry.latencyMs} ms`;

      li.append(dot, time, input, latency);
      list.appendChild(li);
    });
  }

  document.getElementById("webhookForm").addEventListener("submit", async (evt) => {
    evt.preventDefault();
    const secret = document.getElementById("hmacSecret").value;
    const text = document.getElementById("webhookText").value;
    if (!secret || !text) return;

    const btn = document.getElementById("webhookSubmitBtn");
    btn.disabled = true;
    btn.textContent = "Mengirim…";

    const start = performance.now();
    try {
      const signature = await hmacSha256Hex(secret, text);
      document.getElementById("sigPreview").textContent = signature;

      logConsole({
        tag: "webhook",
        dir: "req",
        text: `POST /api/webhook · sig=${signature.slice(0, 12)}… · text="${truncate(text)}"`,
      });

      const res = await fetch("/api/webhook", {
        method: "POST",
        headers: { "Content-Type": "text/plain", "X-Signature": signature },
        body: text,
      });
      const data = await res.json().catch(() => ({}));
      const latencyMs = Math.round(performance.now() - start);
      const ok = res.ok && data.status === "success";

      logConsole({
        tag: "webhook",
        dir: "res",
        level: ok ? "success" : "error",
        text: `${res.status} ${ok ? "success" : data.message || "error"} · rtt ${latencyMs}ms`,
      });

      renderWebhookResult(data, latencyMs, ok);
      webhookHistory.unshift({
        t: Date.now(),
        textSnippet: text.length > 60 ? `${text.slice(0, 60)}…` : text,
        ok,
        latencyMs,
      });
      if (webhookHistory.length > MAX_HISTORY) webhookHistory.length = MAX_HISTORY;
      renderWebhookHistory();
    } catch (err) {
      const latencyMs = Math.round(performance.now() - start);
      logConsole({ tag: "webhook", dir: "res", level: "error", text: `network error · ${err.message} · rtt ${latencyMs}ms` });
      renderWebhookResult({ message: `Request failed: ${err.message}` }, latencyMs, false);
      webhookHistory.unshift({ t: Date.now(), textSnippet: text, ok: false, latencyMs });
      if (webhookHistory.length > MAX_HISTORY) webhookHistory.length = MAX_HISTORY;
      renderWebhookHistory();
    } finally {
      btn.disabled = false;
      btn.textContent = "Sign & send";
    }
  });
})();
