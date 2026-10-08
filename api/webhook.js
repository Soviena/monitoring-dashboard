const crypto = require("crypto");

// Needed so the raw request bytes are preserved for HMAC verification —
// the default body parser can re-decode/transform the payload before we see it.
async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ status: "error", message: "method not allowed, use POST" });
  }

  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    return res.status(500).json({ status: "error", message: "webhook secret is not configured" });
  }

  const rawBody = await getRawBody(req);
  if (!rawBody.length) {
    return res.status(400).json({ status: "error", message: "empty request body" });
  }

  const signature = req.headers["x-signature"];
  if (!verifySignature(rawBody, signature, secret)) {
    return res.status(401).json({ status: "error", message: "invalid signature" });
  }

  const text = rawBody.toString("utf8");

  try {
    await sendToTelegram(text);
  } catch (err) {
    return res.status(502).json({ status: "error", message: err.message });
  }

  return res.status(200).json({ status: "success", message: "forwarded to telegram" });
}

handler.config = {
  api: { bodyParser: false },
};

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length) return Buffer.concat(chunks);

  // Fallback in case the platform already parsed the body despite bodyParser:false.
  if (typeof req.body === "string") return Buffer.from(req.body, "utf8");
  if (Buffer.isBuffer(req.body)) return req.body;
  if (req.body != null) return Buffer.from(JSON.stringify(req.body), "utf8");
  return Buffer.alloc(0);
}

function verifySignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const receivedBuf = Buffer.from(String(signatureHeader), "utf8");

  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

async function sendToTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error("Telegram is not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)");
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.description || `Telegram API responded with ${res.status}`);
  }
  return data;
}

module.exports = handler;
