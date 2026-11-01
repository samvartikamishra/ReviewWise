// ReviewWise AI backend: GET /api/search?q=<product name or link>
//
// India-focused: Indian stores, India warranty terms, products sold in India.
// The work is split into four Gemini tasks:
//   Task 1  Identify the product: official listing, warranty, close competitors (Gemini + Google Search)
//   Task 2  Collect buyer reviews from public pages, with source links          (Gemini + Google Search)
//           Runs as 4 searches at once, each aimed at a different kind of source, then merged.
//   Task 3  Pick the topics, then tag reviews in batches of 30 at once          (Gemini, structured JSON)
//   Task 4  Write the insights: headline, explanations, disagreements           (Gemini, structured JSON)
// Task 1 and the four Task 2 searches all run at the same time. All counts and percentages are calculated here in code,
// not by the AI, because language models are unreliable at counting.
//
// Extra review sources, each switched on by its own key in Vercel (skipped when the key isn't set):
//   YOUTUBE_API_KEY  owner comments on Indian review videos (free, see _youtube.js)
//   APIFY_TOKEN      Flipkart and Amazon.in reviews from store collectors (free credit, see _apify.js)
//   TAVILY_API_KEY   Croma, Reliance Digital, Tata CLiQ and Vijay Sales only (free, see _tavily.js)
//
// Saved results (optional, free): connect an Upstash Redis database from Vercel's Storage tab.
//   Results are kept for 7 days, so the same product always gives the same answer.
//   Add ?fresh=1 to the /api/search address to force a new analysis.
//
// Needs one environment variable in Vercel: GEMINI_API_KEY
// Google Search needs billing turned on in Google AI Studio (it isn't in the free tier).
// Optional: GEMINI_MODEL (defaults to gemini-3.5-flash-lite)
// Without a key, the page shows the fictional sample so the site still works.

const SAMPLE = require("./_sample.json");
const { youtubeReviews, isHindi } = require("./_youtube.js");
const { flipkartReviews, amazonReviews, amazonLink, flipkartLink } = require("./_apify.js");
const { tavilyReviews, findStoreLinks, findProductPage } = require("./_tavily.js");

const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const API = "https://generativelanguage.googleapis.com/v1beta/models/";
const MAX_REVIEWS = 200;  // after merging every source
const TAG_BATCH = 30;     // reviews tagged per Gemini call in Task 3
const PER_SEARCH = 20;    // asked of each Task 2 search
const cache = new Map(); // fastest copy, while this server copy stays warm

// Saved results in Upstash Redis (Vercel adds these variables when you connect the database)
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEEP_DAYS = 7;
async function kv(command) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const r = await fetch(KV_URL, { method: "POST", headers: { Authorization: "Bearer " + KV_TOKEN, "Content-Type": "application/json" }, body: JSON.stringify(command) });
    const d = await r.json().catch(() => ({}));
    return d.result == null ? null : d.result;
  } catch (e) { return null; }
}
async function cacheGet(key) {
  if (cache.has(key)) return cache.get(key);
  const saved = await kv(["GET", "reviewwise:" + key]);
  if (!saved) return null;
  try { const o = JSON.parse(saved); cache.set(key, o); return o; } catch (e) { return null; }
}
async function cacheSet(key, value) {
  cache.set(key, value);
  await kv(["SET", "reviewwise:" + key, JSON.stringify(value), "EX", String(KEEP_DAYS * 86400)]);
}
// Same product, any wording: "Sony BRAVIA 7 II 75" and "sony bravia 7ii 75 inch" share one key
const productKey = (info) => "product:" + [info.brand, info.name].filter(Boolean).join(" ").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 100);
const queryKey = (q) => "query:" + q.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 200);

/* ------------------------------------------------------------------ */
/* Talking to Gemini                                                   */
/* ------------------------------------------------------------------ */

async function gemini({ prompt, search = false, readPages = false, schema = null }) {
  const body = { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: {} };
  if (search) body.tools = [{ google_search: {} }];
  if (search && readPages) body.tools.push({ url_context: {} }); // lets Gemini open the pages it finds
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
  if (!res.ok && readPages && res.status === 400) {
    return gemini({ prompt, search, readPages: false, schema }); // page reading not available: search only
  }
  if (!res.ok) {
    const msg = (data.error && data.error.message) || "Gemini request failed";
    const err = new Error(
      res.status === 429 ? "The Gemini rate limit was reached. Wait a minute and try again." :
      search && /search|grounding|tool/i.test(msg) ? "Google Search isn’t available for this Gemini key. Turn on billing for its project in Google AI Studio. (" + msg + ")" :
      msg);
    err.status = res.status;
    throw err;
  }
  const cand = (data.candidates || [])[0] || {};
  const text = ((cand.content && cand.content.parts) || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
  const sources = ((cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || [])
    .map((c) => c.web).filter(Boolean).map((w) => ({ uri: w.uri, title: (w.title || "").toLowerCase() }));
  // Pages Gemini opened and read successfully also count as confirmed sources
  ((cand.urlContextMetadata && cand.urlContextMetadata.urlMetadata) || []).forEach((m) => {
    if (m.retrievedUrl && /SUCCESS/i.test(m.urlRetrievalStatus || "")) sources.push({ uri: m.retrievedUrl, title: hostOf(m.retrievedUrl) });
  });
  const queries = (cand.groundingMetadata && cand.groundingMetadata.webSearchQueries) || [];
  return { text, sources, queries, finishReason: cand.finishReason || (data.promptFeedback && data.promptFeedback.blockReason) || "" };
}

// Reviews from stores outside India are left out. YouTube and Reddit are global, so they stay.
const ABROAD_URL = /(\bamazon\.(com|co\.uk|ca|de|com\.au)(\/|$)|bestbuy\.|walmart\.|target\.com|costco\.com|crutchfield\.|abt\.com|bhphotovideo\.|newegg\.|currys\.|argos\.|samsung\.com\/(us|uk|ca|au)\/|lg\.com\/(us|uk|ca|au)\/|electronics\.sony\.com|sony\.com\/en\/|apple\.com\/(?!in\/)[a-z]{2}\/)/i;
const ABROAD_SITE = /\b(US|USA|UK|U\.S\.|Canada|Australia|Best ?Buy|Walmart|Target|Costco|Crutchfield)\b/;
const fromAbroad = (r) => ABROAD_URL.test(String(r.url || "")) || ABROAD_SITE.test(String(r.site || ""));

// ---------- Pasted product links ----------
// Looks like a web address rather than a product name
const isLink = (q) => /^(https?:\/\/|www\.)|^[a-z0-9-]+(\.[a-z0-9-]+)+\/\S*$/i.test(q.trim());
const SHORT_LINK = /^(amzn\.(in|to|eu)|a\.co|dl\.flipkart\.com|fkrt\.(it|cc|to)|bit\.ly|tinyurl\.com)$/i;

// Short links (amzn.in/d/…, dl.flipkart.com/s/…) point to the full product page; follow them
async function fullLink(raw) {
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  for (let hop = 0; hop < 4; hop++) {
    let host = "";
    try { host = new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return url; }
    if (!SHORT_LINK.test(host)) return url;
    try {
      const r = await fetch(url, { method: "GET", redirect: "manual", headers: { "User-Agent": "Mozilla/5.0 (compatible; ReviewWise)" } });
      const next = r.headers.get("location");
      if (!next) return url;
      url = new URL(next, url).toString();
    } catch (e) { return url; }
  }
  return url;
}

// The product name written into most product page addresses, e.g.
// amazon.in/Samsung-Crystal-Vision-55-inch/dp/B0… -> "Samsung Crystal Vision 55 inch"
function nameFromLink(url) {
  let u;
  try { u = new URL(url); } catch (e) { return ""; }
  const parts = u.pathname.split("/").map((p) => { try { return decodeURIComponent(p); } catch (e) { return p; } })
    .filter((p) => /[a-z]/i.test(p) && /[-_+ ]/.test(p))                       // words joined by - or _
    .filter((p) => !/^(dp|gp|product|products|p|s|in|en|en-in|buy|shop|item|itm[a-z0-9]+)$/i.test(p));
  if (!parts.length) {
    const q = u.searchParams.get("q") || u.searchParams.get("k") || u.searchParams.get("query") || "";
    return q.trim();
  }
  const best = parts.sort((a, b) => b.split(/[-_+ ]/).length - a.split(/[-_+ ]/).length)[0];
  return best.replace(/\.(html?|aspx?|php)$/i, "").split(/[-_+ ]+/)
    .filter((w) => w && !/^(itm[a-z0-9]+|[A-Z0-9]{10}|\d{6,}|p\d+)$/.test(w))  // product ids
    .slice(0, 14).join(" ").trim();
}

// Product kinds for the page icon; Task 1 picks one (the page has a matching icon for each)
const PRODUCT_KINDS = ["smartphone", "tablet", "laptop", "desktop computer", "monitor", "television", "projector", "headphones", "earbuds", "smartwatch or fitness band", "speaker or soundbar", "camera", "drone", "gaming console or controller", "keyboard", "mouse", "printer", "router or wifi device", "hard drive or SSD", "pen drive or memory card", "power bank", "charger or adapter", "cable", "refrigerator", "washing machine", "air conditioner", "fan or air cooler", "heater or geyser", "microwave or oven", "mixer, blender or juicer", "cookware or kitchen appliance", "coffee machine", "water purifier", "vacuum cleaner", "light or bulb", "lamp", "trimmer or grooming", "toothbrush", "weighing scale", "furniture", "bed or mattress", "clothing", "shoes", "bag or luggage", "eyewear", "jewellery", "book", "toy", "baby product", "bicycle", "car or car accessory", "fitness equipment", "musical instrument", "health product", "calculator", "solar panel", "flashlight", "other"];

// YouTube comments may make up about 40% of the reviews at most (at least 25 when stores have few)
const youtubeCap = (storeReviews) => Math.max(25, Math.round(storeReviews * 2 / 3));

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

const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch (e) { return ""; } };

// Google Search grounding returns sources as { uri, title }, where title is usually the site's domain
// and uri is often a Google redirect link. A review is kept only if its website was among those sources.
const REDIRECT = /(^|\.)vertexaisearch\.cloud\.google\.com$|(^|\.)google\.com$/;
const norm = (s) => String(s || "").toLowerCase().replace(/^www\./, "").replace(/[^a-z0-9.]/g, "");

function sourceFor(url, site, sources) {
  const host = hostOf(url);
  // 1. The link itself is a Google redirect that search produced
  if (host && REDIRECT.test(host)) {
    const hit = sources.find((s) => s.uri === url);
    return hit ? hit.uri : (sources.length ? url : null);
  }
  // 2. The link's website matches a source's domain
  if (host) {
    const hit = sources.find((s) => s.title && (host === norm(s.title) || host.endsWith("." + norm(s.title)) || norm(s.title).endsWith(host)));
    if (hit) return url;
  }
  // 3. The store name matches a source's domain, e.g. "Best Buy" and "bestbuy.com"
  const name = norm(site).replace(/\./g, "");
  if (name.length >= 3) {
    const hit = sources.find((s) => {
      const domain = norm(s.title).split(".")[0]; // "bestbuy.com" becomes "bestbuy"
      return domain.length >= 3 && (domain.indexOf(name) >= 0 || name.indexOf(domain) >= 0);
    });
    if (hit) return hit.uri;
  }
  return null;
}
const confirmedLink = (url, sources) => sourceFor(url, "", sources);

/* ------------------------------------------------------------------ */
/* Website links for the product and competitors                       */
/* ------------------------------------------------------------------ */

// Indian homepages of common brands, used when a confirmed product page isn't available
const BRAND_SITES = {
  samsung: "https://www.samsung.com/in/", lg: "https://www.lg.com/in/", sony: "https://www.sony.co.in/",
  xiaomi: "https://www.mi.com/in/", mi: "https://www.mi.com/in/", redmi: "https://www.mi.com/in/",
  oneplus: "https://www.oneplus.in/", panasonic: "https://www.panasonic.com/in/", philips: "https://www.philips.co.in/",
  haier: "https://www.haier.com/in/", tcl: "https://www.tcl.com/in/en", apple: "https://www.apple.com/in/"
};

// Store pages are labelled with the store's name rather than as the brand's official listing
const STORE_NAMES = { "croma.com": "Croma", "reliancedigital.in": "Reliance Digital", "tatacliq.com": "Tata CLiQ", "vijaysales.com": "Vijay Sales", "amazon.in": "Amazon.in", "flipkart.com": "Flipkart" };
function storeName(url) { const h = hostOf(url); const d = Object.keys(STORE_NAMES).find((k) => h === k || h.endsWith("." + k)); return d ? STORE_NAMES[d] : ""; }

// "https://www.samsung.com/in/tvs/x" becomes "samsung.com/in"
function siteLabel(url) {
  const host = hostOf(url);
  let first = "";
  try { first = new URL(url).pathname.split("/").filter(Boolean)[0] || ""; } catch (e) {}
  return /^(in|en-in|in-en)$/i.test(first) ? host + "/" + first : host;
}

// Best working link: a confirmed page, else the brand's India site, else a web search
function bestLink(url, brand, words, sources) {
  const confirmed = url ? confirmedLink(url, sources) : null;
  if (confirmed && !REDIRECT.test(hostOf(confirmed))) return { url: confirmed, label: siteLabel(confirmed), kind: "page" };
  if (confirmed) return { url: confirmed, label: siteLabel(url) || "Product page", kind: "page" };
  const site = BRAND_SITES[String(brand || "").toLowerCase().replace(/[^a-z]/g, "")];
  if (site) return { url: site, label: siteLabel(site), kind: "brand" };
  return { url: "https://www.google.com/search?q=" + encodeURIComponent(words + " India"), label: "Search the web", kind: "search" };
}

/* ------------------------------------------------------------------ */
/* Task 1: identify the product                                        */
/* ------------------------------------------------------------------ */

function task1Prompt(q, link) {
  const asked = link
    ? `The shopper pasted this product page link: ${link}
The words in the link suggest the product is: "${q}".`
    : `The shopper searched for: "${q}".`;
  return `You are researching a product for a shopper in India. ${asked}
You must use Google Search before answering; don't answer from memory. Identify the exact product as sold in India, then find its official product page on the manufacturer's Indian website (for example sony.co.in, samsung.com/in or lg.com/in), the manufacturer warranty offered in India, and 3 close competitors that are sold in India.
Reply with only this JSON object, no other text:
{
 "found": true or false,
 "brand": "manufacturer name",
 "name": "model name without the brand",
 "category": "short category, e.g. OLED TV",
 "kind": "the closest of these product kinds: ${PRODUCT_KINDS.join(", ")}",
 "description": "one short line, e.g. 65-inch 4K OLED TV, 2025 model, Indian model number if different",
 "officialUrl": "URL of the official product page on the manufacturer's Indian site, or empty",
 "amazonUrl": "the product's amazon.in page, a URL containing /dp/ and the 10-character ASIN, or empty",
 "flipkartUrl": "the product's flipkart.com page, a URL containing /p/itm and pid=, or empty",
 "warranty": { "summary": "warranty in India, e.g. 1-year comprehensive warranty, plus any extra panel warranty", "covered": ["..."], "notCovered": ["..."], "sourceUrl": "URL" },
 "competitors": [ { "brand": "", "name": "", "model": "size and Indian model number", "tags": ["year", "panel type", "one key feature"], "url": "official Indian page URL" } ]
}
Only include facts and links you found in search results; never make up a link. Use empty strings or empty lists when unsure.`;
}

/* ------------------------------------------------------------------ */
/* Task 2: collect reviews                                             */
/* ------------------------------------------------------------------ */

// Each Task 2 search looks at a different kind of source, so together they cover more ground.
const REVIEW_SEARCHES = [
  { label: "Google search: Amazon", focus: "Amazon India (amazon.in) customer reviews", queries: (q) => [`"${q}" reviews site:amazon.in`, `${q} amazon.in customer review`] },
  { label: "Google search: Flipkart", focus: "Flipkart (flipkart.com) customer reviews and ratings", queries: (q) => [`"${q}" reviews site:flipkart.com`, `${q} flipkart ratings and reviews`] },
  { label: "Google search: Croma and Reliance Digital", retailers: true, focus: "customer reviews on Croma (croma.com) and Reliance Digital (reliancedigital.in)", queries: (q) => [`${q} reviews site:croma.com`, `${q} reviews site:reliancedigital.in`] },
  { label: "Google search: Other stores", retailers: true, focus: "customer reviews on Vijay Sales, Tata CLiQ, JioMart and the brand's Indian website", queries: (q) => [`${q} customer reviews vijay sales`, `${q} reviews tata cliq`, `${q} reviews ratings india`] },
  { label: "Google search: Indian tech sites", focus: "user reviews and owner comments on Indian tech sites such as 91mobiles, Smartprix, MySmartPrice and Gadgets 360 (user reviews only, not the editors' reviews)", queries: (q) => [`${q} user reviews 91mobiles`, `${q} user reviews smartprix`, `${q} owner review india`] },
  { label: "Google search: Forums", focus: "Reddit threads, Quora answers and Indian forums where owners in India describe their experience, including delivery, installation, after-sales service and long-term use", queries: (q) => [`${q} reddit india owner experience`, `${q} quora experience`, `${q} review after months india`] }
];
const BROAD_SEARCH = { label: "Google search: Any Indian site", focus: "owner reviews from buyers in India on any website", queries: (q) => [`${q} review india`, `${q} owner review`, `${q} user reviews`] };

function task2Prompt(q, search, summarise) {
  const how = summarise
    ? `For each review, write a one or two sentence summary in your own words of what the owner reported, in the third person (for example: "The owner says the picture is sharp but the speakers are weak."). Don't quote them.`
    : `For each review, copy one or two short sentences (under 25 words) exactly as the owner wrote them, choosing the part that says the most about their experience. Never write, combine or paraphrase a review. If you can't see the owner's exact words, leave that review out.`;
  return `Find real reviews by buyers of this product: "${q}".
Focus on: ${search.focus}.
You must use Google Search before answering; don't answer from memory. Run searches such as:
${search.queries(q).map((x) => "- " + x).join("\n")}
Prefer reviews by buyers in India.
Collect up to ${PER_SEARCH} separate reviews written by owners, not by professional reviewers or the shop. Search snippets that show an owner's words count.
${how}
Reply with only this JSON object, no other text:
{
 "reviews": [
  { "site": "store or website name, e.g. Amazon", "url": "page where the review appears", "rating": 1-5 or 0 if not given, "date": "YYYY-MM-DD, or YYYY-MM if only the month is shown, or empty", "verified": true if marked Verified Purchase (Amazon) or Certified Buyer (Flipkart), "text": "${summarise ? "your summary of the review" : "the owner's exact words"}" }
 ]
}`;
}

// One Task 2 search. Tries exact quotes first. If Gemini skipped searching, it asks again;
// if quotes are blocked or nothing comes back, it asks for short summaries, which the page labels.
async function collectReviews(q, search) {
  const notes = [];
  let sources = [];
  const attempt = async (summarise) => {
    const r = await gemini({ prompt: task2Prompt(q, search, summarise), search: true });
    sources = sources.concat(r.sources);
    let reviews = [], problem = "";
    if (!r.text) problem = "empty answer" + (r.finishReason ? " (" + r.finishReason + ")" : "");
    else { try { reviews = readJson(r.text).reviews || []; } catch (e) { problem = "answer wasn't readable" + (r.finishReason && r.finishReason !== "STOP" ? " (" + r.finishReason + ")" : ""); } }
    if (!problem && !reviews.length) problem = "no reviews found";
    notes.push((summarise ? "summaries" : "quotes") + ": " + (problem || reviews.length + " reviews") + ", " + r.queries.length + " searches run");
    reviews.forEach((x) => { if (x) x.summarised = summarise; });
    return { reviews, searched: r.queries.length > 0 };
  };
  try {
    let r = await attempt(false);
    if (!r.reviews.length && !r.searched) r = await attempt(false); // Gemini answered without searching: ask again
    if (!r.reviews.length) r = await attempt(true);
    return { label: search.label, reviews: r.reviews, sources, problem: r.reviews.length ? "" : notes.join("; ") };
  } catch (err) {
    return { label: search.label, reviews: [], sources, problem: err.message || "failed" };
  }
}

/* ------------------------------------------------------------------ */
/* Task 3: tag every review                                            */
/* ------------------------------------------------------------------ */

// Step 1: pick the topics (themes) and situations from all the reviews
const THEME_SCHEMA = {
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
    }, required: ["label", "keywords"] } }
  },
  required: ["themes", "situations"]
};

function themePrompt(product, reviews) {
  return `These are buyer reviews of ${product}. Read them all and pick the 5 to 12 themes buyers actually discuss most, and 2 to 6 situations describing how reviewers use the product. Don't tag individual reviews yet.
Reviews:
${reviews.map((r) => r.id + " [" + r.site + "]: " + r.text).join("\n")}`;
}

// Step 2: tag one batch of reviews against that fixed list, so every batch uses the same topics
function tagSchema(themeIds, situationLabels) {
  return {
    type: "object",
    properties: {
      reviews: { type: "array", items: { type: "object", properties: {
        id: { type: "string" },
        sentiment: { type: "string", enum: ["positive", "mixed", "negative"] },
        offTopic: { type: "boolean", description: "true unless the writer has actually used this product and describes that experience. True for questions, comments about a video or its creator, comments about other models, and posts from people who have only ordered it, are waiting for delivery, or are planning to buy" },
        suspicious: { type: "boolean", description: "true if it reads like an ad, a fake, or a paid review" },
        situations: { type: "array", items: { type: "string", enum: situationLabels.length ? situationLabels : ["none"] } },
        mentions: { type: "array", items: { type: "object", properties: {
          theme: { type: "string", enum: themeIds },
          stance: { type: "string", enum: ["positive", "mixed", "negative"] },
          sentences: { type: "array", items: { type: "string" }, description: "sentences copied exactly from the review" },
          later: { type: "boolean", description: "true if the review says this appeared after months of use or after an update" }
        }, required: ["theme", "stance", "sentences", "later"] } }
      }, required: ["id", "sentiment", "offTopic", "suspicious", "situations", "mentions"] } }
    },
    required: ["reviews"]
  };
}

function tagPrompt(product, themes, situations, batch) {
  return `These are buyer reviews of ${product}. Tag every review in this list.
Themes (use these ids only): ${themes.map((t) => t.id + " = " + t.title).join("; ")}
Situations (use these labels only): ${situations.map((x) => x.label).join("; ") || "none"}
For each review, list the themes it mentions, its stance on each, and copy the exact sentences that mention the theme, character for character.
Mark reviews that are off-topic or look fake. A review is off-topic unless the writer has used the product, so "just ordered it, can't wait" is off-topic. A review can mention no themes.
Be strict with entries marked [YouTube]: they are comments under videos, not reviews. Mark a YouTube comment off-topic unless the commenter clearly owns or has used this exact model (not another model, size or brand) and says something specific about it. Praise for the video, general opinions about the brand, and questions are off-topic.
Reviews:
${batch.map((r) => r.id + " [" + r.site + ", " + (r.rating || "no") + " stars]: " + r.text).join("\n")}`;
}

// Runs both steps: topics first, then all batches at the same time
async function tagReviews(product, reviews) {
  const t = await step("Task 3 (picking topics)", () => gemini({ prompt: themePrompt(product, reviews), schema: THEME_SCHEMA }));
  const picked = await step("Task 3 (reading the topics)", async () => readJson(t.text));
  const themes = (picked.themes || []).map((x) => Object.assign({}, x, { id: slug(x.id) })).filter((x) => x.id);
  const situations = picked.situations || [];
  if (!themes.length) throw new Error("Task 3 (picking topics) failed: no topics were found in the reviews");
  const schema = tagSchema(themes.map((x) => x.id), situations.map((x) => x.label));

  const batches = [];
  for (let i = 0; i < reviews.length; i += TAG_BATCH) batches.push(reviews.slice(i, i + TAG_BATCH));
  const tagged = await Promise.all(batches.map((batch, n) =>
    step("Task 3 (tagging batch " + (n + 1) + " of " + batches.length + ")", async () =>
      readJson((await gemini({ prompt: tagPrompt(product, themes, situations, batch), schema })).text).reviews || [])
      .catch(() => []) // one failed batch only loses its own tags; those reviews are left out
  ));
  return { themes, situations, reviews: [].concat(...tagged) };
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
      whatReviewersDid: { type: "string", description: "fixes or workarounds owners mention, or empty" },
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
    suggestions: { type: "array", items: { type: "string" }, description: "4 short first-person situations a shopper in India might ask about, based on what reviewers discuss, e.g. I have a bright living room, or My area has frequent power cuts" }
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
  return `You are writing a neutral summary of reviews by buyers in India of ${product}. Don't tell the reader whether to buy it.
Themes, with how many reviews were positive, mixed or negative (already counted, don't recount):
${lines}
Situations: ${situations.map((s) => s.label).join(", ")}
Reviews:
${reviews.map((r) => r.id + " [" + r.site + ", " + (r.rating || "no") + " stars, " + (r.date || "undated") + "]: " + r.text).join("\n")}
Write short, plain sentences. Only say what the reviews support. Don't mention review ids (like R3) in anything you write.`;
}

/* ------------------------------------------------------------------ */
/* Turning the AI's work into the page's data                          */
/* ------------------------------------------------------------------ */

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const shortDate = (d) => { const p = d.split("-"); return p[2] ? MONTHS[+p[1] - 1] + " " + (+p[2]) + ", " + p[0] : MONTHS[+p[1] - 1] + " " + p[0]; };
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
    const mentionsTopic = (t.mentions || []).some((m) => themeIds.indexOf(slug(m.theme)) >= 0 && (m.sentences || []).length);
    if (r.sourceKind === "comment" && !mentionsTopic) { offTopic++; return; } // a comment that says nothing about any topic
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
  // The real YouTube cap, now that off-topic comments are gone
  const storeKept = reviews.filter((r) => r.sourceKind !== "comment").length;
  let ytKept = 0;
  for (let i = 0; i < reviews.length; i++) {
    if (reviews[i].sourceKind === "comment" && ++ytKept > youtubeCap(storeKept)) { reviews.splice(i, 1); i--; }
  }
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
    return (g ? g.ids : []).slice(0, 2).map((rid) => ({ text: byId[rid].hl[id][0], ref: byId[rid].site }));
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
  const dates = reviews.map((r) => r.date).filter((d) => /^\d{4}-\d{2}(-\d{2})?$/.test(d)).sort();
  const removed = suspicious + offTopic;

  const brand = info.brand || "";
  const official = info.officialPage
    ? { url: info.officialPage, label: siteLabel(info.officialPage), kind: "page" }
    : bestLink(info.officialUrl, brand, [brand, info.name].filter(Boolean).join(" "), allSources);
  const w = info.warranty || {};
  const warrantyLink = w.sourceUrl ? confirmedLink(w.sourceUrl, allSources) : null;

  return {
    query: q,
    sample: false,
    product: {
      kicker: [brand, info.category].filter(Boolean).join(" / ").toUpperCase(),
      category: info.category || "",
      kind: PRODUCT_KINDS.find((k) => k.toLowerCase() === String(info.kind || "").trim().toLowerCase()) || "",
      brand, name: info.name || q, description: info.description || "",
      short: [brand, info.description].filter(Boolean).join(" · "),
      url: official.url,
      urlLabel: official.kind === "page"
        ? (storeName(official.url) ? "View on " + storeName(official.url) : "Official " + (brand || "product") + " listing")
        : official.kind === "brand" ? (brand || "Brand") + " India website" : "Search for this product"
    },
    summary: {
      headline: ins.headline,
      stats: [
        { value: String(reviews.length), label: "reviews analyzed" },
        { value: Object.keys(perSite).length + (Object.keys(perSite).length === 1 ? " source" : " sources"), label: Object.keys(perSite).map((s) => s + " " + perSite[s]).join(" · ") },
        { value: dates.length ? shortDate(dates[0]) + " – " + shortDate(dates[dates.length - 1]) : "Not dated", label: "review dates" }
      ],
      note: (reviews.length + removed) + " reviews collected." +
        (removed ? " Removed " + [suspicious && suspicious + " suspicious", offTopic && offTopic + " off-topic"].filter(Boolean).join(" and ") + (removed === 1 ? " review." : " reviews.") : "")
    },
    likes, concerns, concernsShown: 5,
    disagreements,
    warranty: (w.covered && w.covered.length) || (w.notCovered && w.notCovered.length) ? {
      note: (w.summary ? w.summary + ". " : "") + (warrantyLink ? "From the manufacturer’s terms." : "Found by AI search. Check the official terms."),
      covered: w.covered || [], notCoveredTitle: "Not covered", notCovered: (w.notCovered || []).map((t) => ({ text: t }))
    } : null,
    competitors: (info.competitors || []).slice(0, 3).filter((c) => c.name).map((c, i) => {
      const page = info.competitorPages && info.competitorPages[i];   // exact page found by Tavily
      const link = page ? { url: page, label: storeName(page) || siteLabel(page), kind: "page" }
        : bestLink(c.url, c.brand, [c.brand, c.name, c.model].filter(Boolean).join(" "), allSources);
      return { brand: (c.brand || "").toUpperCase(), name: c.name, model: c.model || "", tags: c.tags || [], url: link.url, site: link.label };
    }),
    competitorsNote: "Their reviews haven’t been analyzed here, so no ratings or claims are shown for them.",
    reviews: reviews.map((r) => ({ id: r.id, site: r.site, date: r.date, rating: r.rating, verified: r.verified, url: r.url, sentiment: r.sentiment, summarised: r.summarised, sourceKind: r.sourceKind, text: r.text, contexts: r.contexts, hl: r.hl })),
    panels,
    ask: { suggestions: (ins.suggestions || []).slice(0, 4), topics, themePanels: {} }
  };
}

/* ------------------------------------------------------------------ */
/* The request handler                                                 */
/* ------------------------------------------------------------------ */

// Runs one task and labels any error with the task's name, so failures are easy to trace.
async function step(name, fn) {
  try { return await fn(); }
  catch (err) { const e = new Error(name + " failed: " + (err.message || err)); e.status = err.status; throw e; }
}

module.exports = async (req, res) => {
  const q = String((req.query && req.query.q) || "").trim().slice(0, 200);
  if (!q) return res.status(400).json({ error: "Enter a product name or link." });
  res.setHeader("Cache-Control", "no-store");

  if (!process.env.GEMINI_API_KEY) return res.status(200).json(Object.assign({ query: q }, SAMPLE));

  const fresh = req.query && req.query.fresh === "1";
  const qKey = queryKey(q);
  if (!fresh) {
    const saved = await cacheGet(qKey);
    if (saved) return res.status(200).json(Object.assign({}, saved, { query: q }));
  }

  try {
    // A pasted link: follow short links, then read the product name from the address
    let link = null, text = q;
    if (isLink(q)) {
      link = await fullLink(q);
      text = nameFromLink(link);
      if (!text) {
        // No name in the address, but an Amazon or Flipkart product code is often enough for Google
        const asin = (link.match(/amazon\.[a-z.]+\/(?:[^?#]*\/)?(?:dp|gp\/product)\/([A-Z0-9]{10})/i) || [])[1];
        const pid = (link.match(/flipkart\.com\/[^#]*[?&]pid=([A-Z0-9]+)/i) || [])[1];
        if (asin) text = "Amazon.in product " + asin.toUpperCase();
        else if (pid) text = "Flipkart product " + pid.toUpperCase();
        else return res.status(400).json({ error: "That link doesn’t include the product’s name. Paste the full link from the product’s page, or type the product name instead." });
      }
    }

    // Task 1 first: identify the product, then reuse a saved analysis of it if there is one
    const t1Done = await step("Task 1 (identifying the product)", () => gemini({ prompt: task1Prompt(text, link), search: true }));
    const infoDone = await step("Task 1 (reading the product details)", async () => readJson(t1Done.text));
    // What the review searches look for: the shopper's words, or for a link, the product Task 1 identified
    const searchText = link ? ([infoDone.brand, infoDone.name].filter(Boolean).join(" ") || text) : q;
    if (infoDone.found === false) return res.status(404).json({ error: link
      ? "Couldn’t work out which product that link is for. Try pasting the full link from the product’s page, or type the product name."
      : "Couldn’t find that product. Try the brand and model number." });
    const pKey = productKey(infoDone);
    if (!fresh) {
      const saved = await cacheGet(pKey);
      if (saved) { await cacheSet(qKey, saved); return res.status(200).json(Object.assign({}, saved, { query: q })); }
    }

    // New product: collect reviews from every source. YouTube, the store collectors and the
    // product-page lookups use what Task 1 found; the Gemini review searches run alongside them.
    const t1Promise = Promise.resolve(t1Done);
    const infoPromise = Promise.resolve(infoDone);
    const extraPromise = infoPromise.then(async (info) => {
      const name = [info.brand, info.name].filter(Boolean).join(" ") || searchText;
      // Store links: a pasted link first, then one Tavily found, then one from Gemini's search
      const found = (amazonLink(link) && flipkartLink(link)) ? {} : await findStoreLinks(name);
      const amazon = amazonLink(link) || amazonLink(found.amazon) || amazonLink(info.amazonUrl);
      const flipkart = flipkartLink(link) || flipkartLink(found.flipkart) || flipkartLink(info.flipkartUrl);
      const extract = async (prompt, schema) => readJson((await gemini({ prompt, schema })).text); // Gemini reads Tavily's pages
      return Promise.all([flipkartReviews(flipkart, name), amazonReviews(amazon, name), tavilyReviews(name, extract), youtubeReviews(name)]);
    }).catch(() => []);
    // Exact product pages for this product and its competitors, looked up while reviews are collected
    const pagesPromise = infoPromise.then((info) => {
      info.competitors = (info.competitors || []).slice(0, 3).filter((c) => c && c.name);
      return Promise.all([
        findProductPage(info.brand, [info.brand, info.name].filter(Boolean).join(" ")),
        ...info.competitors.map((c) => findProductPage(c.brand, [c.brand, c.name, c.model].filter(Boolean).join(" ")))
      ]).then(([official, ...rivals]) => { info.officialPage = official; info.competitorPages = rivals; });
    }).catch(() => {});
    const [t1, info, extras, , ...geminiSearches] = await Promise.all([
      t1Promise, infoPromise, extraPromise, pagesPromise,
      ...REVIEW_SEARCHES
        .filter((search) => !(process.env.TAVILY_API_KEY && search.retailers)) // Tavily reads these retailers directly
        .map((search) => collectReviews(searchText, search))
    ]);
    if (info.found === false) return res.status(404).json({ error: "Couldn’t find that product. Try the brand and model number." });

    // Every source, most reliable first: store collectors, Tavily pages, Gemini searches, then YouTube comments
    const bySource = extras.slice(0, 3).concat(geminiSearches, extras.slice(3));
    if (!bySource.some((t) => t.reviews.length)) bySource.push(await collectReviews(searchText, BROAD_SEARCH)); // last try: any Indian site

    // Merge, dropping the same review found by two sources
    const sources = [].concat(...bySource.map((t) => t.sources || []), t1.sources);
    // Two texts are the same review if one contains the start of the other (a title may be added in front)
    const seen = [];
    const found = [];
    bySource.forEach((t) => t.reviews.forEach((r) => {
      if (!r || typeof r.text !== "string" || isHindi(r.text) || fromAbroad(r)) return; // English reviews from India only
      const key = r.text.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (key.length < 20) return;
      if (seen.some((k) => k.includes(key.slice(0, 60)) || key.includes(k.slice(0, 60)))) return;
      seen.push(key);
      found.push(Object.assign({}, r, { from: t.label })); // remember which source it came from
    }));
    // Before tagging, keep at most 1.5 times the YouTube cap (the real cap is applied after tagging,
    // once off-topic comments are gone). Comments are ordered owners-first, then by likes.
    const fromStores = found.filter((r) => r.sourceKind !== "comment").length;
    const ytCap = Math.round(youtubeCap(fromStores) * 1.5);
    let ytSeen = 0;
    for (let i = 0; i < found.length; i++) {
      if (found[i].sourceKind === "comment" && ++ytSeen > ytCap) { found.splice(i, 1); i--; }
    }

    const report = "Task 1 ran " + t1.queries.length + " searches | " +
      bySource.filter((t) => !t.skipped).map((t) => t.label + ": " + (t.problem || t.reviews.length + " reviews")).join(" | ");
    const usable = found.filter((r) => r && typeof r.text === "string" && r.text.trim().length > 20);
    const raw = usable
      .map((r) => Object.assign({}, r, { url: r.trusted ? r.url : sources.length ? sourceFor(r.url, r.site, sources) : null }))
      .filter((r) => r.trusted || !sources.length || r.url)
      .slice(0, MAX_REVIEWS)
      .map((r, i) => ({
        id: "R" + (i + 1), site: String(r.site || hostOf(r.url) || "Web").trim(), url: r.url,
        rating: Math.max(0, Math.min(5, Math.round(Number(r.rating) || 0))),
        date: /^\d{4}-\d{2}(-\d{2})?$/.test(r.date || "") ? r.date : "", verified: r.verified === true, summarised: r.summarised === true, sourceKind: r.sourceKind || "", from: r.from, text: r.text.trim().slice(0, 1200)
      }));
    if (raw.length < 3) {
      return res.status(404).json({ error: "Only " + raw.length + " usable reviews were found (" + found.length + " collected, " + sources.length + " search sources). Details: " + report + ". Try a more specific or more popular product." });
    }

    const productName = [info.brand, info.name].filter(Boolean).join(" ") || searchText;

    // Task 3
    const tags = await tagReviews(productName, raw);
    const b = await step("Task 3 (counting)", async () => build(q, info, t1.sources, raw, sources, tags));

    // Task 4
    const t4 = await step("Task 4 (writing insights)", () => gemini({ prompt: task4Prompt(productName, b.themes, b.panels, b.reviews, tags.situations || []), schema: INSIGHT_SCHEMA }));
    const result = await step("Task 4 (building the page)", async () => b.finish(readJson(t4.text)));
    // How each source did (kept in the data for troubleshooting, not shown on the page)
    // Counts only reviews that made it onto the page (after removing duplicates, Hindi, other countries and off-topic posts)
    const used = {};
    b.reviews.forEach((r) => { used[r.from] = (used[r.from] || 0) + 1; });
    const plain = (p) => /searches run|answer|RECITATION/.test(p || "") ? "no reviews found" : (p || "no reviews found");
    result.collection = bySource.map((t) => ({
      source: t.label,
      status: t.skipped ? "not connected" : used[t.label] ? plural(used[t.label], "review") + " used" : t.reviews.length ? "found " + plural(t.reviews.length, "review") + ", none usable" : plain(t.problem)
    }));

    result.analyzedAt = new Date().toISOString().slice(0, 10);
    result.category = infoDone.category || "";
    // Save under this product and this wording, for 7 days
    await Promise.all([cacheSet(pKey, result), cacheSet(qKey, result)]);
    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(err.status === 429 ? 429 : 500).json({ error: err.message || "Something went wrong while analysing reviews." });
  }
};
