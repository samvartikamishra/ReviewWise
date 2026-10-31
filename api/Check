// ReviewWise AI health check: open /api/check in your browser.
// It tests the Gemini key in small steps and shows what works and what doesn't.
// It never shows your key. The search test uses one Google search.

const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const API = "https://generativelanguage.googleapis.com/v1beta/models/";

async function call(body) {
  const started = Date.now();
  const res = await fetch(API + MODEL + ":generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  const seconds = ((Date.now() - started) / 1000).toFixed(1) + "s";
  if (!res.ok) return { ok: false, seconds, error: "HTTP " + res.status + ": " + ((data.error && data.error.message) || "no details") };
  const cand = (data.candidates || [])[0] || {};
  const text = ((cand.content && cand.content.parts) || []).filter((p) => !p.thought).map((p) => p.text || "").join("").trim();
  const gm = cand.groundingMetadata || {};
  return { ok: true, seconds, text, queries: gm.webSearchQueries || [], sources: (gm.groundingChunks || []).map((c) => c.web).filter(Boolean) };
}

module.exports = async (req, res) => {
  const lines = [];
  const say = (ok, label, detail) => lines.push((ok ? "PASS  " : "FAIL  ") + label + (detail ? "\n      " + detail : ""));
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  lines.push("ReviewWise AI check", "Model: " + MODEL, "");

  const key = process.env.GEMINI_API_KEY || "";
  if (!key) {
    say(false, "1. Gemini key", "GEMINI_API_KEY isn't set for this deployment. Add it in Vercel > Settings > Environment Variables (tick Production), then redeploy.");
    return res.status(200).send(lines.join("\n"));
  }
  const trimmed = key.trim() !== key || /^["']|["']$/.test(key);
  say(!trimmed, "1. Gemini key found (" + key.length + " characters)", trimmed ? "The key has spaces or quotes around it. Paste only the key itself in Vercel." : "");

  try {
    const basic = await call({ contents: [{ role: "user", parts: [{ text: "Reply with the single word: ready" }] }] });
    say(basic.ok, "2. Gemini answers (" + basic.seconds + ")", basic.ok ? "Reply: " + basic.text.slice(0, 60) : basic.error);
    if (!basic.ok) return res.status(200).send(lines.join("\n"));

    const structured = await call({
      contents: [{ role: "user", parts: [{ text: "Give the colour of the sky on a clear day." }] }],
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: { type: "object", properties: { colour: { type: "string" } }, required: ["colour"] } }
    });
    say(structured.ok, "3. Structured JSON answers (" + structured.seconds + ")", structured.ok ? "Reply: " + structured.text.slice(0, 80) : structured.error);

    const q = String((req.query && req.query.q) || "Sony BRAVIA 8 II 65-inch").slice(0, 120);
    const searched = await call({
      contents: [{ role: "user", parts: [{ text: "Use Google Search to find owner reviews of " + q + ". Name two websites where you found them." }] }],
      tools: [{ google_search: {} }]
    });
    if (!searched.ok) {
      say(false, "4. Google Search (" + searched.seconds + ")", searched.error +
        "\n      If this mentions search, grounding or billing: turn on billing for this key's project in Google AI Studio. Search isn't in the free tier.");
    } else {
      const ok = searched.queries.length > 0 && searched.sources.length > 0;
      say(ok, "4. Google Search (" + searched.seconds + ")",
        "Searched for: " + (searched.queries.join(" | ") || "nothing (the model answered without searching, open this page again)") +
        "\n      Sources found: " + searched.sources.length +
        (searched.sources.length ? "\n      " + searched.sources.slice(0, 6).map((s) => s.title || "untitled").join(", ") : ""));
    }
  } catch (err) {
    say(false, "Couldn't reach Gemini", String(err.message || err));
  }

  lines.push("", "If every line says PASS, run a search on the main page.");
  res.status(200).send(lines.join("\n"));
};
