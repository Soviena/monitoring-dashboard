// Simulated monitoring metrics — swap this out for a real data source
// (database, Prometheus, CloudWatch, etc.) when one is available.

function hashNoise(x) {
  const s = Math.sin(x * 12.9898) * 43758.5453;
  return s - Math.floor(s); // 0..1, stable for a given x
}

function wave(t, periodMs, amplitude, mid, phase = 0) {
  return mid + amplitude * Math.sin((2 * Math.PI * t) / periodMs + phase);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function metricAt(name, t) {
  const n = hashNoise(Math.floor(t / 1000) * (name.seed || 1));
  const jitter = (n - 0.5) * 2 * name.noise;
  return clamp(wave(t, name.period, name.amp, name.mid, name.phase) + jitter, name.min, name.max);
}

const SERIES = {
  cpu: { period: 60000, amp: 18, mid: 42, phase: 0, noise: 8, min: 2, max: 98, seed: 0.00031 },
  memory: { period: 150000, amp: 10, mid: 58, phase: 1.2, noise: 5, min: 10, max: 95, seed: 0.00047 },
  network: { period: 40000, amp: 70, mid: 140, phase: 2.1, noise: 35, min: 5, max: 500, seed: 0.00061 },
  requests: { period: 30000, amp: 160, mid: 320, phase: 0.6, noise: 90, min: 0, max: 1000, seed: 0.00083 },
};

function buildHistory(now, points, stepMs) {
  const history = [];
  for (let i = points - 1; i >= 0; i--) {
    const t = now - i * stepMs;
    history.push({
      t,
      cpu: Math.round(metricAt(SERIES.cpu, t) * 10) / 10,
      memory: Math.round(metricAt(SERIES.memory, t) * 10) / 10,
      network: Math.round(metricAt(SERIES.network, t) * 10) / 10,
      requests: Math.round(metricAt(SERIES.requests, t)),
    });
  }
  return history;
}

function buildServices(now, cpu, memory) {
  const flip = hashNoise(Math.floor(now / 45000));
  return [
    { name: "API Gateway", status: cpu > 90 ? "critical" : cpu > 75 ? "warning" : "good" },
    { name: "Database", status: memory > 88 ? "warning" : "good" },
    { name: "Cache", status: "good" },
    { name: "Auth Service", status: flip > 0.93 ? "warning" : "good" },
    { name: "Worker Queue", status: flip > 0.97 ? "serious" : "good" },
  ];
}

function buildLogs(now) {
  const levels = ["info", "info", "info", "warning", "info", "error", "info"];
  const messages = [
    "Health check passed",
    "Deployment rolled out",
    "Cache warmed for region eu-west-1",
    "Elevated response time on /checkout",
    "Scheduled backup completed",
    "Database connection retried",
    "Autoscaler added 1 instance",
  ];
  const logs = [];
  for (let i = 0; i < 7; i++) {
    const t = now - i * 90000 - Math.floor(hashNoise(now - i) * 20000);
    const idx = (i + Math.floor(hashNoise(now + i) * levels.length)) % levels.length;
    logs.push({ t, level: levels[idx], message: messages[idx] });
  }
  return logs.sort((a, b) => b.t - a.t);
}

module.exports = (req, res) => {
  const now = Date.now();
  const cpu = Math.round(metricAt(SERIES.cpu, now) * 10) / 10;
  const memory = Math.round(metricAt(SERIES.memory, now) * 10) / 10;
  const network = Math.round(metricAt(SERIES.network, now) * 10) / 10;
  const requests = Math.round(metricAt(SERIES.requests, now));

  const payload = {
    timestamp: now,
    stats: { cpu, memory, network, requests },
    history: buildHistory(now, 30, 5000),
    services: buildServices(now, cpu, memory),
    logs: buildLogs(now),
  };

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(payload);
};
