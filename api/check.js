// ReviewWise AI health check: open /api/check in your browser.
// It tests the Gemini key in small steps and shows what works and what doesn't.
// It never shows your keys. The search test uses one Google search.

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

  // Optional review sources
  lines.push("", "OPTIONAL REVIEW SOURCES");
  if (!process.env.YOUTUBE_API_KEY) {
    lines.push("SKIP  5. YouTube comments: YOUTUBE_API_KEY isn't set, so YouTube is switched off.");
  } else {
    try {
      const r = await fetch("https://www.googleapis.com/youtube/v3/videos?part=id&id=jNQXAC9IVRw&key=" + encodeURIComponent(process.env.YOUTUBE_API_KEY));
      const d = await r.json().catch(() => ({}));
      say(r.ok, "5. YouTube comments", r.ok ? "Key works (this test used 1 of 10,000 daily units)." : "HTTP " + r.status + ": " + ((d.error && d.error.message) || "no details") +
        "\n      Check that YouTube Data API v3 is enabled for the key's Google Cloud project.");
    } catch (err) { say(false, "5. Couldn't reach YouTube", String(err.message || err)); }
  }
  if (!process.env.APIFY_TOKEN) {
    lines.push("SKIP  6. Flipkart and Amazon.in (Apify): APIFY_TOKEN isn't set, so they're switched off.");
  } else {
    try {
      const auth = { headers: { Authorization: "Bearer " + process.env.APIFY_TOKEN } };
      const r = await fetch("https://api.apify.com/v2/users/me", auth);
      const d = await r.json().catch(() => ({}));
      let usage = "";
      try {
        const l = await (await fetch("https://api.apify.com/v2/users/me/limits", auth)).json();
        const used = l.data && l.data.current && l.data.current.monthlyUsageUsd;
        const cap = l.data && l.data.limits && l.data.limits.maxMonthlyUsageUsd;
        if (used != null && cap != null) usage = " Used $" + Number(used).toFixed(2) + " of $" + Number(cap).toFixed(2) + " this month.";
      } catch (e) {}
      say(r.ok, "6. Flipkart and Amazon.in (Apify)", r.ok ? "Signed in as " + ((d.data && d.data.username) || "your account") + "." + usage : "HTTP " + r.status + ": the Apify token isn't valid.");
    } catch (err) { say(false, "6. Couldn't reach Apify", String(err.message || err)); }
  }

  if (!process.env.TAVILY_API_KEY) {
    lines.push("SKIP  7. Croma, Reliance Digital, Tata CLiQ, Vijay Sales (Tavily): TAVILY_API_KEY isn't set, so they're switched off.");
  } else {
    try {
      const r = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.TAVILY_API_KEY },
        body: JSON.stringify({ query: "Sony BRAVIA TV", search_depth: "basic", max_results: 1, include_domains: ["croma.com", "reliancedigital.in", "tatacliq.com", "vijaysales.com"] })
      });
      const d = await r.json().catch(() => ({}));
      say(r.ok, "7. Croma, Reliance Digital, Tata CLiQ, Vijay Sales (Tavily)", r.ok ? "Key works (this test used 1 of 1,000 monthly credits). Found: " + ((d.results && d.results[0] && d.results[0].url) || "no page") :
        "HTTP " + r.status + ": " + (r.status === 401 ? "the Tavily key isn't valid." : r.status === 432 ? "monthly free credits are used up." : JSON.stringify(d.detail || d).slice(0, 150)));
    } catch (err) { say(false, "7. Couldn't reach Tavily", String(err.message || err)); }
  }

  const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!kvUrl || !kvToken) {
    lines.push("SKIP  8. Saved results: no Upstash Redis database is connected, so each search runs fresh and results can differ.");
  } else {
    try {
      const r = await fetch(kvUrl, { method: "POST", headers: { Authorization: "Bearer " + kvToken, "Content-Type": "application/json" }, body: JSON.stringify(["PING"]) });
      const d = await r.json().catch(() => ({}));
      say(r.ok && d.result === "PONG", "8. Saved results (Upstash Redis)", r.ok ? "Connected. Results are kept for 7 days." : "HTTP " + r.status + ": " + (d.error || "couldn't connect"));
    } catch (err) { say(false, "8. Couldn't reach the saved-results database", String(err.message || err)); }
  }

  lines.push("", "If lines 1 to 4 say PASS, run a search on the main page. Lines 5 to 8 are optional.");
  res.status(200).send(lines.join("\n"));
};
