// ReviewWise AI backend: GET /api/search?q=<product name or link>
//
// The work is split into four AI tasks:
//   Task 1  Identify the product: official listing, warranty, close competitors (Gemini + Google Search)
//   Task 2  Collect buyer reviews from public pages, with source links          (Gemini + Google Search)
//   Task 3  Tag each review: sentiment, themes, exact sentences, usage situation (Gemini, structured JSON)
//   Task 4  Write the insights: headline, explanations, disagreements           (Gemini, structured JSON)
// Tasks 1 and 2 run at the same time. All counts and percentages are calculated here in code,
// not by the AI, because language models are unreliable at counting.
//
// Needs one environment variable in Vercel: GEMINI_API_KEY
// Optional: GEMINI_MODEL (defaults to gemini-3.5-flash-lite)
// Without a key, the page shows the fictional sample so the site still works.

const SAMPLE = require("./_sample.json");

const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const API = "https://generativelanguage.googleapis.com/v1beta/models/";
const MAX_REVIEWS = 40;
const cache = new Map(); // repeat searches reuse results while this server copy stays warm

/* ------------------------------------------------------------------ */
/* Talking to Gemini                                                   */
/* ------------------------------------------------------------------ */

async function gemini({ prompt, search = false, schema = null }) {
  const body = { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: {} };
  if (search) body.tools = [{ google_search: {} }];
  if (schema) {
    body.generationConfig.responseMimeType = "application/json";
    body.generationConfig.responseJsonSchema = schema;
  }

  let res;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(API + MODEL + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify(body)
    });
    if (res.status !== 429 && res.status < 500) break;
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); // busy or rate-limited: wait, then retry
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error && data.error.message) || "Gemini request failed";
    const err = new Error(res.status === 429 ? "The free Gemini limit was reached. Wait a minute and try again." : msg);
    err.status = res.status;
    throw err;
  }
  const cand = (data.candidates || [])[0] || {};
  const text = ((cand.content && cand.content.parts) || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
  const sources = ((cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || [])
    .map((c) => c.web).filter(Boolean).map((w) => ({ uri: w.uri, title: (w.title || "").toLowerCase() }));
  return { text, sources };
}

// Search-grounded answers can't be forced into a schema, so read the JSON out of the text.
function readJson(text) {
  const clean = String(text || "").replace(/```json|```/g, "");
  const a = clean.indexOf("{"), b = clean.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("The AI answer couldn't be read. Try the search again.");
  return JSON.parse(clean.slice(a, b + 1));
}

/* ------------------------------------------------------------------ */
/* Checking sources                                                    */
/* ------------------------------------------------------------------ */

const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch (e) { return ""; } };

// A link is kept only if Google Search actually returned a page from that website.
function confirmedLink(url, sources) {
  const host = hostOf(url);
  if (!host) return null;
  const hit = sources.find((s) => s.title && (host === s.title || host.endsWith("." + s.title) || s.title.endsWith(host)));
  return hit ? url : null;
}

/* ------------------------------------------------------------------ */
/* Task 1: identify the product                                        */
/* ------------------------------------------------------------------ */

function task1Prompt(q) {
  return `You are researching a product for a shopper in the USA. The shopper searched for: "${q}".
Use Google Search. Identify the exact product, then find its official product page, its manufacturer warranty, and 3 close competitors.
Reply with only this JSON object, no other text:
{
 "found": true or false,
 "brand": "manufacturer name",
 "name": "model name without the brand",
 "category": "short category, e.g. OLED TV",
 "description": "one short line, e.g. 65-inch 4K OLED TV, 2025 model",
 "officialUrl": "URL of the official product page on the manufacturer's site, or empty",
 "warranty": { "summary": "e.g. 1-year limited warranty", "covered": ["..."], "notCovered": ["..."], "sourceUrl": "URL" },
 "competitors": [ { "brand": "", "name": "", "model": "size and model number", "tags": ["year", "panel type", "one key feature"], "url": "official page URL" } ]
}
Only include facts you found in search results. Use empty strings or empty lists when unsure.`;
}

/* ------------------------------------------------------------------ */
/* Task 2: collect reviews                                             */
/* ------------------------------------------------------------------ */

function task2Prompt(q) {
  return `Find real buyer and owner reviews of this product: "${q}".
Use Google Search. Look at retailer reviews (Amazon, Best Buy, Walmart, Target), the manufacturer's own site, Reddit owner discussions, and Google reviews.
Collect up to ${MAX_REVIEWS} separate reviews written by owners, not by professional reviewers or the shop.
Copy each review's words exactly as written. Never write, combine or paraphrase a review. If you can't find the exact words, leave that review out.
Reply with only this JSON object, no other text:
{
 "reviews": [
  { "site": "store or website name, e.g. Amazon", "url": "page where the review appears", "rating": 1-5 or 0 if not given, "date": "YYYY-MM-DD or empty", "verified": true or false, "text": "the review's exact words" }
 ]
}`;
}

/* ------------------------------------------------------------------ */
/* Task 3: tag every review                                            */
/* ------------------------------------------------------------------ */

const TAG_SCHEMA = {
  type: "object",
  properties: {
    themes: { type: "array", description: "5 to 12 aspects buyers talk about", items: { type: "object", properties: {
      id: { type: "string", description: "short lowercase id, letters only, e.g. picture" },
      title: { type: "string", description: "plain name, e.g. Picture quality" },
      keywords: { type: "array", items: { type: "string" }, description: "4 to 8 lowercase words a shopper might type about this, e.g. glare, sunny, bright room" }
    }, required: ["id", "title", "keywords"] } },
    situations: { type: "array", description: "2 to 6 ways people use the product, e.g. Bright rooms, Gaming", items: { type: "object", properties: {
      label: { type: "string" },
      keywords: { type: "array", items: { type: "string" } }
    }, required: ["label", "keywords"] } },
    reviews: { type: "array", items: { type: "object", properties: {
      id: { type: "string" },
      sentiment: { type: "string", enum: ["positive", "mixed", "negative"] },
      offTopic: { type: "boolean", description: "true if it isn't about owning this product" },
      suspicious: { type: "boolean", description: "true if it reads like an ad, a fake, or a paid review" },
      situations: { type: "array", items: { type: "string" } },
      mentions: { type: "array", items: { type: "object", properties: {
        theme: { type: "string" },
        stance: { type: "string", enum: ["positive", "mixed", "negative"] },
        sentences: { type: "array", items: { type: "string" }, description: "sentences copied exactly from the review" },
        later: { type: "boolean", description: "true if the review says this appeared after months of use or after an update" }
      }, required: ["theme", "stance", "sentences", "later"] } }
    }, required: ["id", "sentiment", "offTopic", "suspicious", "situations", "mentions"] } }
  },
  required: ["themes", "situations", "reviews"]
};

function task3Prompt(product, reviews) {
  return `These are buyer reviews of ${product}. Tag every review.
Pick the themes buyers actually discuss. For each review, list the themes it mentions, its stance on each, and copy the exact sentences that mention the theme, character for character.
Mark reviews that are off-topic or look fake. Situations describe how the reviewer uses the product.
Reviews:
${reviews.map((r) => r.id + " [" + r.site + ", " + (r.rating || "no") + " stars]: " + r.text).join("\n")}`;
}

/* ------------------------------------------------------------------ */
/* Task 4: write the insights                                          */
/* ------------------------------------------------------------------ */

const INSIGHT_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "one or two short sentences summing up what buyers say. No buying advice." },
    themes: { type: "array", items: { type: "object", properties: {
      id: { type: "string" },
      summary: { type: "string", description: "one sentence on what reviewers say" },
      goodToKnow: { type: "string", description: "a useful caveat, or empty" },
      whatReviewersDid: { type: "string", description: "fixes or workarounds owners mention, citing review ids like (R4), or empty" },
      howToAvoid: { type: "string", description: "practical advice drawn from the reviews, or empty" },
      whenItShowsUp: { type: "string", description: "e.g. After about 6 months, or empty" }
    }, required: ["id", "summary", "goodToKnow", "whatReviewersDid", "howToAvoid", "whenItShowsUp"] } },
    disagreements: { type: "array", description: "up to 3 themes where reviewers clearly split", items: { type: "object", properties: {
      theme: { type: "string" },
      positiveTitle: { type: "string", description: "e.g. Bright enough" },
      positiveText: { type: "string", description: "what these reviewers have in common" },
      negativeTitle: { type: "string", description: "e.g. Too dim" },
      negativeText: { type: "string" },
      explanation: { type: "string", description: "a possible reason they differ, suggested by the reviews" }
    }, required: ["theme", "positiveTitle", "positiveText", "negativeTitle", "negativeText", "explanation"] } },
    situationNotes: { type: "array", items: { type: "object", properties: {
      label: { type: "string" }, note: { type: "string", description: "what owners in this situation report, or empty" }
    }, required: ["label", "note"] } },
    suggestions: { type: "array", items: { type: "string" }, description: "4 short first-person situations a shopper might ask about, e.g. I have a bright living room" }
  },
  required: ["headline", "themes", "disagreements", "situationNotes", "suggestions"]
};

function task4Prompt(product, themes, panels, reviews, situations) {
  const lines = themes.map((t) => {
    const p = panels[t.id];
    const counts = p.groups.map((g) => g.label + " " + g.ids.length).join(", ");
    const evidence = p.groups.map((g) => g.label + ": " + g.ids.join(" ")).join("; ");
    return "- " + t.id + " (" + t.title + "): " + counts + ". Reviews: " + evidence;
  }).join("\n");
  return `You are writing a neutral summary of buyer reviews of ${product}. Don't tell the reader whether to buy it.
Themes, with how many reviews were positive, mixed or negative (already counted, don't recount):
${lines}
Situations: ${situations.map((s) => s.label).join(", ")}
Reviews:
${reviews.map((r) => r.id + " [" + r.site + ", " + (r.rating || "no") + " stars, " + (r.date || "undated") + "]: " + r.text).join("\n")}
Write short, plain sentences. Only say what the reviews support, and cite review ids like (R3) for specific claims.`;
}

/* ------------------------------------------------------------------ */
/* Turning the AI's work into the page's data                          */
/* ------------------------------------------------------------------ */

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const shortDate = (d) => { const p = d.split("-"); return MONTHS[+p[1] - 1] + " " + (+p[2]) + ", " + p[0]; };
const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z]/g, "").slice(0, 24);
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const avg = (ids, byId) => { const r = ids.map((id) => byId[id].rating).filter((x) => x > 0); return r.length ? (r.reduce((a, b) => a + b, 0) / r.length).toFixed(1) : "n/a"; };

function build(q, info, infoSources, rawReviews, reviewSources, tags, insight) {
  const allSources = infoSources.concat(reviewSources);

  // Reviews: keep the ones the tagger didn't flag, with highlights that really appear in the text
  const tagById = {};
  (tags.reviews || []).forEach((t) => { tagById[t.id] = t; });
  const themeIds = (tags.themes || []).map((t) => slug(t.id)).filter(Boolean);
  let suspicious = 0, offTopic = 0;
  const reviews = [];
  rawReviews.forEach((r) => {
    const t = tagById[r.id];
    if (!t) return;
    if (t.suspicious) { suspicious++; return; }
    if (t.offTopic) { offTopic++; return; }
    const hl = {}, stances = {}, later = {};
    (t.mentions || []).forEach((m) => {
      const id = slug(m.theme);
      if (themeIds.indexOf(id) < 0) return;
      const sentences = (m.sentences || []).filter((s) => s && r.text.indexOf(s) >= 0);
      if (!sentences.length) return;
      hl[id] = sentences; stances[id] = m.stance; if (m.later) later[id] = true;
    });
    reviews.push(Object.assign({}, r, { sentiment: t.sentiment, contexts: t.situations || [], hl, stances, later }));
  });
  if (!reviews.length) throw new Error("No usable reviews were found for this product. Try a more specific product name.");
  const byId = {}; reviews.forEach((r) => { byId[r.id] = r; });

  // Panels: for each theme, which reviews are positive, mixed or negative (counted in code)
  const panels = {};
  const themes = [];
  (tags.themes || []).forEach((t) => {
    const id = slug(t.id);
    if (!id || panels[id]) return;
    const groups = ["positive", "mixed", "negative"].map((s) => ({ label: s.charAt(0).toUpperCase() + s.slice(1), ids: reviews.filter((r) => r.stances[id] === s).map((r) => r.id) })).filter((g) => g.ids.length);
    if (!groups.length) return;
    panels[id] = { title: t.title, theme: id, groups };
    themes.push({ id, title: t.title, keywords: t.keywords || [] });
  });

  return { panels, themes, reviews, byId, suspicious, offTopic, allSources, finish: (ins) => finish(q, info, ins, reviews, byId, panels, themes, tags, suspicious, offTopic, allSources) };
}

function finish(q, info, ins, reviews, byId, panels, themes, tags, suspicious, offTopic, allSources) {
  const words = {}; (ins.themes || []).forEach((t) => { words[slug(t.id)] = t; });
  const count = (id, label) => { const g = panels[id].groups.find((x) => x.label === label); return g ? g.ids.length : 0; };
  const total = (id) => panels[id].groups.reduce((n, g) => n + g.ids.length, 0);

  const quotesFor = (id, label) => {
    const g = panels[id].groups.find((x) => x.label === label);
    return (g ? g.ids : []).slice(0, 2).map((rid) => ({ text: byId[rid].hl[id][0], ref: rid + ", " + byId[rid].site }));
  };

  const likes = [], concerns = [];
  themes.slice().sort((a, b) => total(b.id) - total(a.id)).forEach((t) => {
    const pos = count(t.id, "Positive"), neg = count(t.id, "Negative");
    const w = words[t.id] || {};
    const positive = pos >= neg;
    const notes = positive
      ? [w.goodToKnow && { label: "Good to know", text: w.goodToKnow }]
      : [w.whatReviewersDid && { label: "What reviewers did", text: w.whatReviewersDid }, w.howToAvoid && { label: "How to avoid it", text: w.howToAvoid }];
    const item = {
      id: t.id, title: t.title, count: positive ? pos : neg, of: total(t.id), tone: positive ? "positive" : "negative",
      later: !positive && reviews.some((r) => r.later[t.id] && r.stances[t.id] === "negative"),
      text: w.summary || "", when: positive ? null : (w.whenItShowsUp || null),
      notes: notes.filter(Boolean), quotes: quotesFor(t.id, positive ? "Positive" : "Negative"), panel: t.id
    };
    (positive ? likes : concerns).push(item);
  });

  // Where reviewers disagree: only themes with real reviews on both sides
  const disagreements = [];
  (ins.disagreements || []).forEach((d) => {
    const id = slug(d.theme);
    if (!panels[id] || disagreements.length >= 3) return;
    const posIds = (panels[id].groups.find((g) => g.label === "Positive") || { ids: [] }).ids;
    const negIds = (panels[id].groups.find((g) => g.label === "Negative") || { ids: [] }).ids;
    if (!posIds.length || !negIds.length) return;
    const key = "d_" + id;
    panels[key] = { title: panels[id].title, theme: id, groups: [{ label: d.positiveTitle, ids: posIds }, { label: d.negativeTitle, ids: negIds }] };
    disagreements.push({
      theme: panels[id].title, count: (posIds.length + negIds.length) + " reviews discuss it", panel: key,
      a: { title: d.positiveTitle, text: d.positiveText, meta: posIds.length + (posIds.length === 1 ? " review" : " reviews") + " · avg. rating " + avg(posIds, byId) },
      b: { title: d.negativeTitle, text: d.negativeText, meta: negIds.length + (negIds.length === 1 ? " review" : " reviews") + " · avg. rating " + avg(negIds, byId) },
      explanation: d.explanation
    });
  });

  // Ask about your situation: match typed questions to themes and situations
  const notes = {}; (ins.situationNotes || []).forEach((s) => { notes[s.label] = s.note; });
  const topics = themes.map((t) => ({ pattern: t.keywords.concat([t.title.toLowerCase()]).filter(Boolean).map(escRe).join("|"), themes: [t.id] }))
    .concat((tags.situations || []).map((s) => ({ pattern: (s.keywords || []).concat([s.label.toLowerCase()]).map(escRe).join("|"), themes: [], context: s.label, note: notes[s.label] || undefined })))
    .filter((t) => t.pattern);

  // Summary numbers
  const perSite = {};
  reviews.forEach((r) => { perSite[r.site] = (perSite[r.site] || 0) + 1; });
  const dates = reviews.map((r) => r.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const removed = suspicious + offTopic;

  const brand = info.brand || "";
  const officialUrl = info.officialUrl ? confirmedLink(info.officialUrl, allSources) : null;
  const w = info.warranty || {};
  const warrantyLink = w.sourceUrl ? confirmedLink(w.sourceUrl, allSources) : null;

  return {
    query: q,
    sample: false,
    product: {
      kicker: [brand, info.category].filter(Boolean).join(" / ").toUpperCase(),
      brand, name: info.name || q, description: info.description || "",
      short: [brand, info.description].filter(Boolean).join(" · "),
      url: officialUrl, urlLabel: "Official " + (brand || "product") + " listing"
    },
    summary: {
      headline: ins.headline,
      stats: [
        { value: String(reviews.length), label: "reviews analyzed" },
        { value: Object.keys(perSite).length + (Object.keys(perSite).length === 1 ? " source" : " sources"), label: Object.keys(perSite).map((s) => s + " " + perSite[s]).join(" · ") },
        { value: dates.length ? shortDate(dates[0]) + " – " + shortDate(dates[dates.length - 1]) : "Not dated", label: "review dates" }
      ],
      note: (reviews.length + removed) + " reviews collected by AI search." +
        (removed ? " Removed " + [suspicious && suspicious + " suspicious", offTopic && offTopic + " off-topic"].filter(Boolean).join(" and ") + (removed === 1 ? " review." : " reviews.") : "") +
        " Counts are calculated from the reviews shown below."
    },
    likes, concerns, concernsShown: 5,
    disagreements,
    warranty: (w.covered && w.covered.length) || (w.notCovered && w.notCovered.length) ? {
      note: (w.summary ? w.summary + ". " : "") + (warrantyLink ? "From the manufacturer’s terms." : "Found by AI search. Check the official terms."),
      covered: w.covered || [], notCoveredTitle: "Not covered", notCovered: (w.notCovered || []).map((t) => ({ text: t }))
    } : null,
    competitors: (info.competitors || []).slice(0, 3).filter((c) => c.name).map((c) => {
      const url = c.url ? confirmedLink(c.url, allSources) : null;
      return { brand: (c.brand || "").toUpperCase(), name: c.name, model: c.model || "", tags: c.tags || [], url, site: url ? hostOf(url) : "" };
    }),
    competitorsNote: "Their reviews haven’t been analyzed here, so no ratings or claims are shown for them.",
    reviews: reviews.map((r) => ({ id: r.id, site: r.site, date: r.date, rating: r.rating, verified: r.verified, url: r.url, sentiment: r.sentiment, text: r.text, contexts: r.contexts, hl: r.hl })),
    panels,
    ask: { suggestions: (ins.suggestions || []).slice(0, 4), topics, themePanels: {} }
  };
}

/* ------------------------------------------------------------------ */
/* The request handler                                                 */
/* ------------------------------------------------------------------ */

module.exports = async (req, res) => {
  const q = String((req.query && req.query.q) || "").trim().slice(0, 200);
  if (!q) return res.status(400).json({ error: "Enter a product name or link." });
  res.setHeader("Cache-Control", "no-store");

  if (!process.env.GEMINI_API_KEY) return res.status(200).json(Object.assign({ query: q }, SAMPLE));

  const key = q.toLowerCase();
  if (cache.has(key)) return res.status(200).json(cache.get(key));

  try {
    // Tasks 1 and 2 at the same time
    const [t1, t2] = await Promise.all([
      gemini({ prompt: task1Prompt(q), search: true }),
      gemini({ prompt: task2Prompt(q), search: true })
    ]);
    const info = readJson(t1.text);
    if (info.found === false) return res.status(404).json({ error: "Couldn’t find that product. Try the brand and model number." });

    // Keep reviews whose website was really in the search results
    const sources = t2.sources.concat(t1.sources);
    const raw = (readJson(t2.text).reviews || [])
      .filter((r) => r && typeof r.text === "string" && r.text.trim().length > 20)
      .map((r) => Object.assign({}, r, { url: r.url ? confirmedLink(r.url, sources) : null }))
      .filter((r) => !sources.length || r.url)
      .slice(0, MAX_REVIEWS)
      .map((r, i) => ({
        id: "R" + (i + 1), site: String(r.site || hostOf(r.url) || "Web").trim(), url: r.url,
        rating: Math.max(0, Math.min(5, Math.round(Number(r.rating) || 0))),
        date: /^\d{4}-\d{2}-\d{2}$/.test(r.date || "") ? r.date : "", verified: r.verified === true, text: r.text.trim()
      }));
    if (raw.length < 3) return res.status(404).json({ error: "Not enough reviews with confirmed sources were found for this product yet." });

    const productName = [info.brand, info.name].filter(Boolean).join(" ") || q;

    // Task 3
    const t3 = await gemini({ prompt: task3Prompt(productName, raw), schema: TAG_SCHEMA });
    const tags = JSON.parse(t3.text);
    const b = build(q, info, t1.sources, raw, t2.sources, tags);

    // Task 4
    const t4 = await gemini({ prompt: task4Prompt(productName, b.themes, b.panels, b.reviews, tags.situations || []), schema: INSIGHT_SCHEMA });
    const result = b.finish(JSON.parse(t4.text));

    cache.set(key, result);
    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(err.status === 429 ? 429 : 500).json({ error: err.message || "Something went wrong while analysing reviews." });
  }
};

