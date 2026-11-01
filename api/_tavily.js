// Large Indian retailers source for ReviewWise AI, using Tavily (free plan: 1,000 credits a month).
// Searches only Croma, Reliance Digital, Tata CLiQ and Vijay Sales, reads the product pages,
// and keeps customer reviews that appear word for word on those pages.
// Needs TAVILY_API_KEY in Vercel. Each product search uses 2 credits, so about 500 a month free.

const RETAILERS = {
  "croma.com": "Croma",
  "reliancedigital.in": "Reliance Digital",
  "tatacliq.com": "Tata CLiQ",
  "vijaysales.com": "Vijay Sales"
};
const PAGES = 6;          // product pages read at most
const PAGE_TEXT = 25000;  // characters of each page given to Gemini

const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch (e) { return ""; } };
const retailerOf = (url) => { const h = hostOf(url); const d = Object.keys(RETAILERS).find((k) => h === k || h.endsWith("." + k)); return d ? RETAILERS[d] : null; };
const squash = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Most of the product name's key words appear in the page title or address
function samePage(result, name) {
  const words = String(name).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !/^(inch|inches|the|and|with|for|tv|smart|cm)$/.test(w));
  const hay = (String(result.title || "") + " " + String(result.url || "")).toLowerCase();
  return !words.length || words.filter((w) => hay.includes(w)).length >= Math.ceil(words.length * 0.6);
}

// Give Gemini the part of the page around the reviews, not the menus and specs before it
function reviewPart(text) {
  const t = String(text || "");
  if (t.length <= PAGE_TEXT) return t;
  const m = t.search(/(customer reviews|ratings (&|and) reviews|user reviews|reviews \(\d|\d+ reviews|write a review)/i);
  const start = m > 0 ? Math.max(0, m - 500) : 0;
  return t.slice(start, start + PAGE_TEXT);
}

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    isThisProduct: { type: "boolean", description: "true only if the page sells exactly this product (same model; size may differ)" },
    reviews: { type: "array", items: { type: "object", properties: {
      text: { type: "string", description: "the review copied exactly as it appears on the page" },
      rating: { type: "integer", description: "1 to 5, or 0 if not shown" },
      date: { type: "string", description: "YYYY-MM-DD, or YYYY-MM if only the month is shown, or empty" },
      verified: { type: "boolean", description: "true if the review is marked as a verified or certified buyer" }
    }, required: ["text", "rating", "date", "verified"] } }
  },
  required: ["isThisProduct", "reviews"]
};

const extractPrompt = (name, retailer, page) => `This is the text of a ${retailer} web page. The shopper wants reviews of: "${name}".
First say whether this page is for exactly that product. Then list every customer review on the page, copying each review's words exactly as they appear. Leave out the product description, specifications, questions and answers, and anything written by ${retailer} itself. If there are no customer reviews, return an empty list.
Page text:
${page}`;

async function tavilyReviews(productName, extract) {
  const label = "Large retailers (Tavily)";
  if (!process.env.TAVILY_API_KEY) return { label, reviews: [], skipped: true, problem: "not connected" };
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.TAVILY_API_KEY },
      body: JSON.stringify({
        query: productName + " customer reviews ratings",
        search_depth: "advanced",            // 2 credits; finds the right product pages more reliably
        include_domains: Object.keys(RETAILERS),
        include_domains_mode: "restrict",    // only these four sites
        include_raw_content: "text",         // the page text, so reviews can be read and checked
        max_results: 10,
        country: "india"
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data.detail && data.detail.error) || "HTTP " + res.status;
      return { label, reviews: [], problem: res.status === 401 ? "Tavily key isn’t valid" : res.status === 432 ? "Tavily monthly free credits are used up" : msg };
    }

    const pages = (data.results || [])
      .filter((r) => retailerOf(r.url) && r.raw_content && samePage(r, productName))
      .slice(0, PAGES);
    if (!pages.length) return { label, reviews: [], problem: "no matching product pages on these retailers" };

    const perPage = await Promise.all(pages.map(async (p) => {
      const retailer = retailerOf(p.url);
      try {
        const out = await extract(extractPrompt(productName, retailer, reviewPart(p.raw_content)), EXTRACT_SCHEMA);
        if (!out || out.isThisProduct === false) return [];
        const pageText = squash(p.raw_content);
        return (out.reviews || [])
          .filter((r) => r && typeof r.text === "string" && r.text.trim().length >= 15)
          .filter((r) => pageText.includes(squash(r.text)))   // keep only reviews found word for word on the page
          .map((r) => ({
            site: retailer, trusted: true, url: p.url,
            rating: Math.max(0, Math.min(5, Math.round(Number(r.rating) || 0))),
            date: /^\d{4}-\d{2}(-\d{2})?$/.test(r.date || "") ? r.date : "",
            verified: r.verified === true,
            text: r.text.replace(/\s+/g, " ").trim().slice(0, 1200)
          }));
      } catch (e) { return []; }
    }));

    const reviews = [].concat(...perPage);
    const sites = [...new Set(pages.map((p) => retailerOf(p.url)))].join(", ");
    return { label, reviews, problem: reviews.length ? "" : "read " + pages.length + " product pages (" + sites + ") but found no customer reviews in their text" };
  } catch (err) {
    return { label, reviews: [], problem: err.message || "Tavily request failed" };
  }
}

// Finds the product's real Amazon.in and Flipkart page addresses, so the Apify collectors know where
// to look. Gemini's search returns Google redirect links, which the collectors can't use.
// Two basic searches, 2 credits.
async function findStoreLinks(productName) {
  if (!process.env.TAVILY_API_KEY) return {};
  const look = async (domain, pattern) => {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.TAVILY_API_KEY },
        body: JSON.stringify({ query: productName, search_depth: "basic", include_domains: [domain], include_domains_mode: "restrict", max_results: 8, country: "india" })
      });
      const data = await res.json().catch(() => ({}));
      const hit = (data.results || []).find((r) => pattern.test(String(r.url || "")) && samePage(r, productName));
      return hit ? hit.url : null;
    } catch (e) { return null; }
  };
  const [amazon, flipkart] = await Promise.all([
    look("amazon.in", /amazon\.in\/(?:[^?#]*\/)?(?:dp|gp\/product)\/[A-Z0-9]{10}/i),
    look("flipkart.com", /flipkart\.com\/[^?#]*\/p\/itm[a-z0-9]+[^#]*[?&]pid=/i)
  ]);
  return { amazon, flipkart };
}

/* ---------- Variants: screen size, storage, capacity ---------- */

// Common TV and monitor sizes, used to read sizes from model codes like QA65S90H or OLED65C5
const SCREEN_SIZES = new Set([24, 27, 32, 40, 42, 43, 48, 50, 55, 58, 60, 65, 70, 75, 77, 83, 85, 86, 98, 100]);

// Every variant mentioned in a piece of text, by kind
function variantsIn(text) {
  const t = String(text || "").toLowerCase();
  const out = { inch: new Set(), gb: new Set(), kg: new Set(), ton: new Set(), litre: new Set() };
  for (const m of t.matchAll(/(\d{2,3})(?:\.\d)?\s*(?:-\s*)?(?:inch(?:es)?|in\b|"|”|'')/g)) out.inch.add(Number(m[1]));
  for (const m of t.matchAll(/(\d{2,3}(?:\.\d+)?)\s*cm\b/g)) out.inch.add(Math.round(Number(m[1]) / 2.54));
  for (const m of t.matchAll(/(?:^|[^a-z0-9])([a-z]{0,5}-?)(\d{2,3})(?=[a-z])([a-z0-9-]*)/g)) {
    const n = Number(m[2]), token = m[1] + m[2] + m[3];
    if (SCREEN_SIZES.has(n) && token.length >= 7) out.inch.add(n);      // a model code, e.g. qa65s90haelxl
  }
  for (const m of t.matchAll(/(\d{2,4})\s*gb\b/g)) out.gb.add(Number(m[1]));
  for (const m of t.matchAll(/(\d)\s*tb\b/g)) out.gb.add(Number(m[1]) * 1024);
  for (const m of t.matchAll(/(\d{1,2}(?:\.\d)?)\s*kg\b/g)) out.kg.add(Number(m[1]));
  for (const m of t.matchAll(/(\d(?:\.\d)?)\s*ton\b/g)) out.ton.add(Number(m[1]));
  for (const m of t.matchAll(/(\d{2,4})\s*(?:l|ltr|litres?|liters?)\b/g)) out.litre.add(Number(m[1]));
  return out;
}

// False if the page names a different variant than the one wanted (for a kind the wanted variant specifies).
// Only the page's title and address are checked: page text often lists every size in a size picker.
function sameVariant(result, wanted) {
  if (!wanted) return true;
  const want = variantsIn(wanted);
  const has = variantsIn(String(result.title || "") + " " + String(result.url || "").replace(/[-_/]/g, " "));
  // Storage like "8 GB RAM, 256 GB" lists two numbers, so storage needs only one to match
  for (const kind of Object.keys(want)) {
    if (!want[kind].size || !has[kind].size) continue;
    if (![...has[kind]].some((v) => want[kind].has(v))) return false;
  }
  return true;
}

// Brands' Indian websites: the domain to search, and the path an Indian page must have
const BRAND_SITES = {
  samsung: ["samsung.com", "/in/"], lg: ["lg.com", "/in/"], sony: ["sony.co.in", ""],
  xiaomi: ["mi.com", "/in/"], mi: ["mi.com", "/in/"], redmi: ["mi.com", "/in/"],
  oneplus: ["oneplus.in", ""], panasonic: ["panasonic.com", "/in/"], philips: ["philips.co.in", ""],
  haier: ["haier.com", "/in/"], tcl: ["tcl.com", "/in/"], apple: ["apple.com", "/in/"]
};
// Stores used when the brand's own site doesn't have the page
const STORES = ["croma.com", "reliancedigital.in", "tatacliq.com", "vijaysales.com", "amazon.in", "flipkart.com"];
// Search, category and listing pages aren't product pages
const NOT_PRODUCT = /([?&](q|query|text|search)=|\/search|\/s\?|\/c\/|\/category|\/compare|\/all-|\/offers|\/deals)/i;

async function searchPages(query, domains, withText) {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.TAVILY_API_KEY },
      body: JSON.stringify(Object.assign({ query, search_depth: "basic", include_domains: domains, include_domains_mode: "restrict", max_results: 8, country: "india" },
        withText ? { include_raw_content: "text" } : {}))
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? data.results || [] : [];
  } catch (e) { return []; }
}

// The exact product page for a model: the brand's Indian site first, then a large Indian store.
// Returns { url, text } (the page's text, for reading its price), or null. 1 or 2 basic searches.
const pickPage = (results, words, mustHave, variant) => {
  const hit = results.find((r) => {
    const url = String(r.url || "");
    return url && !NOT_PRODUCT.test(url) && (!mustHave || url.toLowerCase().includes(mustHave)) && samePage(r, words) && sameVariant(r, variant);
  });
  return hit ? { url: hit.url, text: hit.raw_content || "" } : null;
};
// variant: text naming the exact size or model, e.g. "65-inch, QA65S90HAELXL"; pages for other sizes are skipped
async function findProductPage(brand, words, variant) {
  if (!process.env.TAVILY_API_KEY || !words) return null;
  const site = BRAND_SITES[String(brand || "").toLowerCase().replace(/[^a-z]/g, "")];
  const query = [words, variant].filter(Boolean).join(" ");
  if (site) {
    const onBrand = pickPage(await searchPages(query + " India", [site[0]], true), words, site[1], variant);
    if (onBrand) return onBrand;
  }
  return pickPage(await searchPages(query, STORES, true), words, "", variant);
}

/* ---------- Prices ---------- */

const PRICE_SCHEMA = {
  type: "object",
  properties: {
    isThisProduct: { type: "boolean", description: "true only if the page sells exactly this model" },
    price: { type: "integer", description: "the current selling price in rupees as shown on the page, or 0 if no price is shown" },
    mrp: { type: "integer", description: "the MRP or list price in rupees if shown separately, or 0" }
  },
  required: ["isThisProduct", "price", "mrp"]
};
const pricePrompt = (words, page, variant) => `This is the text of an Indian web page. Find the current selling price of exactly this product: "${words}"${variant ? `, in this exact variant: ${variant}` : ""}.
Use the price the page is selling this exact size or variant for now, not other sizes, EMI amounts, exchange offers, bank-offer prices, accessories or other models. If the page doesn't show a price for this exact variant, use 0, and set isThisProduct to false if the page is for a different size or variant.
Page text:
${String(page).slice(0, 20000)}`;

// A price is used only if its digits appear on the page, written with or without commas
const onPage = (n, text) => {
  if (!n || n < 100) return false;
  const plain = String(n), indian = n.toLocaleString("en-IN"), western = n.toLocaleString("en-US");
  return [plain, indian, western].some((f) => text.indexOf(f) >= 0);
};

async function priceFromPage(page, words, extract, variant) {
  if (!page || !page.text) return null;
  try {
    const out = await extract(pricePrompt(words, page.text, variant), PRICE_SCHEMA);
    if (!out || out.isThisProduct === false || !onPage(out.price, page.text)) return null;
    return { amount: out.price, mrp: out.mrp > out.price && onPage(out.mrp, page.text) ? out.mrp : 0, url: page.url };
  } catch (e) { return null; }
}

// Current price for a model: from its page if that shows one, otherwise from a large Indian store
async function findPrice(page, words, extract, variant) {
  if (!process.env.TAVILY_API_KEY || !words) return null;
  const fromPage = await priceFromPage(page, words, extract, variant);
  if (fromPage) return fromPage;
  const isStore = page && STORES.some((d) => String(page.url).includes(d));
  if (isStore) return null; // already tried a store page
  const query = [words, variant, "price"].filter(Boolean).join(" ");
  return priceFromPage(pickPage(await searchPages(query, STORES, true), words, "", variant), words, extract, variant);
}

module.exports = { tavilyReviews, findStoreLinks, findProductPage, findPrice, sameVariant, variantsIn, RETAILERS };
