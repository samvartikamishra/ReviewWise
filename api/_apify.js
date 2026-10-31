// Flipkart and Amazon.in source for ReviewWise AI, using ready-made review collectors on Apify.
// Needs APIFY_TOKEN in Vercel. Apify's free plan includes $5 of usage a month.
// Optional settings in Vercel:
//   APIFY_FLIPKART_ACTOR  (default automation-lab~flipkart-product-reviews-scraper)
//   APIFY_AMAZON_ACTOR    (default scrapeai~amazon-reviews-scraper)
//   APIFY_MAX_REVIEWS     reviews per store per search (default 20)
// These collectors are built by independent developers on Apify, so they can stop working when the
// stores change their sites. If one fails, the search continues with the other sources.

const FLIPKART_ACTOR = process.env.APIFY_FLIPKART_ACTOR || "automation-lab~flipkart-product-reviews-scraper";
const AMAZON_ACTOR = process.env.APIFY_AMAZON_ACTOR || "scrapeai~amazon-reviews-scraper";
const MAX = Math.max(1, Math.min(50, Number(process.env.APIFY_MAX_REVIEWS) || 20));

/* ---------- Product links ---------- */

// Amazon.in product link, cleaned to https://www.amazon.in/dp/ASIN
function amazonLink(url) {
  const m = String(url || "").match(/amazon\.in\/(?:[^?#]*\/)?(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  return m ? "https://www.amazon.in/dp/" + m[1].toUpperCase() : null;
}

// Flipkart product link; the collector needs the /p/itm… part and pid=
function flipkartLink(url) {
  const s = String(url || "");
  const m = s.match(/flipkart\.com\/([^?#]*\/p\/itm[a-z0-9]+)[^#]*?[?&]pid=([A-Z0-9]+)/i);
  return m ? "https://www.flipkart.com/" + m[1] + "?pid=" + m[2].toUpperCase() : null;
}

/* ---------- Helpers ---------- */

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, "0");

// "2025-03-12", "12 March 2025", "Reviewed in India on 12 March 2025", "Apr, 2024" -> YYYY-MM-DD or YYYY-MM
function toDate(value) {
  const s = String(value || "");
  let m = s.match(/(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (m) return m[3] ? m[1] + "-" + m[2] + "-" + m[3] : m[1] + "-" + m[2];
  m = s.match(/(\d{1,2})(?:st|nd|rd|th)? ([A-Za-z]{3})[a-z]*,? (\d{4})/);
  if (m && MONTHS[m[2].toLowerCase()]) return m[3] + "-" + pad(MONTHS[m[2].toLowerCase()]) + "-" + pad(m[1]);
  m = s.match(/([A-Za-z]{3})[a-z]* (\d{1,2}),? (\d{4})/);
  if (m && MONTHS[m[1].toLowerCase()]) return m[3] + "-" + pad(MONTHS[m[1].toLowerCase()]) + "-" + pad(m[2]);
  m = s.match(/([A-Za-z]{3})[a-z]*,? (\d{4})/);
  if (m && MONTHS[m[1].toLowerCase()]) return m[2] + "-" + pad(MONTHS[m[1].toLowerCase()]);
  return "";
}

// Most of the product name's key words appear in the collector's product title
function sameProduct(title, name) {
  if (!title) return true; // the collector didn't say, so we can't check
  const words = String(name).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !/^(inch|inches|the|and|with|for|tv|smart)$/.test(w));
  const t = String(title).toLowerCase();
  return !words.length || words.filter((w) => t.includes(w)).length >= Math.ceil(words.length * 0.5);
}

// Run a collector and wait for its results (up to about 2.5 minutes)
async function runActor(actor, input) {
  const res = await fetch("https://api.apify.com/v2/acts/" + actor + "/run-sync-get-dataset-items?timeout=150", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.APIFY_TOKEN },
    body: JSON.stringify(input)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || "HTTP " + res.status;
    throw new Error(res.status === 401 ? "Apify token isn’t valid" : res.status === 402 ? "Apify monthly free credit is used up" : res.status === 408 ? "the collector took too long" : msg);
  }
  return Array.isArray(data) ? data : [];
}

// Turn a collector's row into a ReviewWise review
function toReview(item, site, fallbackUrl) {
  const title = String(item.title || item.reviewTitle || "").trim();
  const body = String(item.text || item.body || item.reviewText || item.reviewBody || item.content || item.review || "").replace(/\s+/g, " ").trim();
  let text = body || title;
  if (title && body && !body.toLowerCase().startsWith(title.toLowerCase()) && title.length < 80) text = title + ". " + body;
  return {
    site, trusted: true,
    url: item.reviewUrl || item.url || fallbackUrl,
    rating: Math.max(0, Math.min(5, Math.round(Number(item.rating || item.stars || item.ratingValue || item.reviewRating) || 0))),
    date: toDate(item.date || item.reviewDate || item.displayedDate || item.dateText),
    verified: Boolean(item.verifiedPurchase || item.certifiedBuyer || item.verified),
    text: text.slice(0, 1200)
  };
}

/* ---------- The two stores ---------- */

async function flipkartReviews(url, productName) {
  const link = flipkartLink(url);
  if (!process.env.APIFY_TOKEN) return { label: "Flipkart (Apify)", reviews: [], skipped: true, problem: "not connected" };
  if (!link) return { label: "Flipkart (Apify)", reviews: [], problem: "no Flipkart product link found" };
  try {
    const rows = await runActor(FLIPKART_ACTOR, { startUrls: [{ url: link }], maxItems: MAX, maxPagesPerProduct: Math.ceil(MAX / 10) });
    const reviews = rows.map((r) => toReview(r, "Flipkart", link)).filter((r) => r.text.length >= 15);
    return { label: "Flipkart (Apify)", reviews, problem: reviews.length ? "" : "collector returned no reviews" };
  } catch (err) {
    return { label: "Flipkart (Apify)", reviews: [], problem: err.message };
  }
}

async function amazonReviews(url, productName) {
  const link = amazonLink(url);
  if (!process.env.APIFY_TOKEN) return { label: "Amazon (Apify)", reviews: [], skipped: true, problem: "not connected" };
  if (!link) return { label: "Amazon (Apify)", reviews: [], problem: "no Amazon.in product link found" };
  try {
    const rows = await runActor(AMAZON_ACTOR, { productUrls: [link], maxReviewsPerProduct: MAX, headless: true, proxyConfiguration: { useApifyProxy: true } });
    const named = rows.find((r) => r.productTitle || r.productName);
    if (named && !sameProduct(named.productTitle || named.productName, productName)) {
      return { label: "Amazon (Apify)", reviews: [], problem: "the Amazon link was for a different product" };
    }
    const reviews = rows.map((r) => toReview(r, "Amazon", link)).filter((r) => r.text.length >= 15);
    return { label: "Amazon (Apify)", reviews, problem: reviews.length ? "" : "collector returned no reviews" };
  } catch (err) {
    return { label: "Amazon (Apify)", reviews: [], problem: err.message };
  }
}

module.exports = { flipkartReviews, amazonReviews, amazonLink, flipkartLink };
