// YouTube source for ReviewWise AI (free YouTube Data API v3).
// Finds review videos for the product, then collects comments where viewers describe owning it.
// Needs YOUTUBE_API_KEY in Vercel.
// Quota: each video search costs 100 units and each page of comments costs 1, out of 10,000 free a day.
// With the defaults below, one product search uses about 225 units, so roughly 44 searches a day.
// Optional settings in Vercel:
//   YOUTUBE_MAX_COMMENTS  comments kept per product search (default 100)
//   YOUTUBE_VIDEOS        videos read (default 12)
//   YOUTUBE_PAGES         pages of 100 comments read per video (default 2)
//   YOUTUBE_SEARCHES      video searches run: 1 = "review", 2 adds "long term review",
//                         3 adds "user review" (default 2)
// Hindi and Hinglish videos and comments are left out.

const API = "https://www.googleapis.com/youtube/v3/";
const num = (v, d, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || d));
const KEEP = num(process.env.YOUTUBE_MAX_COMMENTS, 100, 1, 300);
const VIDEOS = num(process.env.YOUTUBE_VIDEOS, 12, 1, 25);
const PAGES = num(process.env.YOUTUBE_PAGES, 2, 1, 5);
const SEARCHES = num(process.env.YOUTUBE_SEARCHES, 2, 1, 3);
const QUERIES = [" review", " long term review", " user review"];

// Hindi script, or Hindi typed in English letters (Hinglish). Two or more common Hindi words counts.
const HINGLISH = /\b(hai|hain|nahi|nahin|kya|kyu|kyun|bahut|bohot|accha|acha|achha|liya|kharida|kharid|mera|meri|mujhe|maine|humne|raha|rahi|chal|chala|bhi|yaar|bhai|kaafi|kafi|lekin|par|aur|ekdum|bilkul|jaisa|wala|wali|karo|karna|karta)\b/gi;
function isHindi(text) {
  const t = String(text || "");
  if (/[\u0900-\u097F]/.test(t)) return true;
  return (t.match(HINGLISH) || []).length >= 2;
}

// Comments that sound like someone who owns or bought the product
const OWNER = /\b(i (have )?(bought|purchased|got|ordered|own|use)|i'?m using|i am using|been using|using (it|this|the)|my (tv|unit|set|one|phone|laptop|device)|after \d+ (days?|weeks?|months?|years?)|\d+ (days?|weeks?|months?|years?) (of use|now|later|in)|installed|installation|delivered|delivery|service cent(er|re)|warranty)\b/i;

// Longer comments that describe the product's qualities also count, even without "I bought"
const EXPERIENCE = /\b(picture|display|screen|colou?rs?|brightness|sound|audio|speakers?|bass|remote|software|apps?|lag|heat(ing)?|battery|build|quality|performance|service|price|worth|value|problem|issue|defect|faulty|replace(d|ment)?|repair)\b/i;

// Ordered or planning to buy, but not using it yet
const NOT_YET = /\b(can'?t wait|cannot wait|waiting for (it|delivery|the delivery|installation)|yet to (be )?(deliver|arriv|install|receiv|use)|(will|to) (be )?(arrive|delivered) (on|by|tomorrow|next)|arriving (on|tomorrow|next)|planning to (buy|get|order)|thinking (of|about) (buying|getting)|should i (buy|get)|going to (buy|get|order)|will (buy|get|order) (it|this|one)|in my cart|pre-?ordered)\b/i;

function looksUseful(text) {
  if (text.length < 40 || text.length > 1200 || isHindi(text)) return false;
  if (/\?\s*$/.test(text) && text.length < 120) return false;          // short questions, e.g. "Which is better?"
  if (/\b(sir|bhai|brother)\b.*\b(reply|suggest|tell)\b/i.test(text)) return false; // asking the creator for advice
  if (NOT_YET.test(text)) return false;                                   // hasn't used it yet
  return OWNER.test(text) || (text.length >= 80 && EXPERIENCE.test(text));
}

async function get(path, params) {
  const url = API + path + "?" + new URLSearchParams(Object.assign({ key: process.env.YOUTUBE_API_KEY }, params));
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = data.error && data.error.errors && data.error.errors[0] && data.error.errors[0].reason;
    const err = new Error(reason === "quotaExceeded" ? "YouTube daily quota used up, resets at midnight Pacific time" : (data.error && data.error.message) || "YouTube request failed");
    err.reason = reason;
    throw err;
  }
  return data;
}

// Loose check that a video is about this product: most of the name's key words appear in its title
function matchesProduct(title, name) {
  const words = String(name).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !/^(inch|inches|review|reviews|the|and|with|for|tv|smart)$/.test(w));
  if (!words.length) return true;
  const t = String(title).toLowerCase();
  return words.filter((w) => t.includes(w)).length >= Math.ceil(words.length * 0.6);
}

async function youtubeReviews(productName) {
  if (!process.env.YOUTUBE_API_KEY) return { label: "YouTube", reviews: [], skipped: true, problem: "not connected" };
  try {
    // Run the video searches and merge them, skipping videos that aren't about this product
    const results = await Promise.all(QUERIES.slice(0, SEARCHES).map((suffix) =>
      get("search", { part: "snippet", type: "video", maxResults: "25", regionCode: "IN", relevanceLanguage: "en", q: productName + suffix })
        .then((d) => d.items || [])
        .catch((err) => { if (err.reason === "quotaExceeded") throw err; return []; })));
    const seenVideos = new Set();
    const videos = [];
    results.forEach((items) => items.forEach((v) => {
      const id = v.id && v.id.videoId;
      const title = v.snippet && v.snippet.title;
      if (!id || seenVideos.has(id) || !matchesProduct(title, productName) || isHindi(title) || /\bhindi\b/i.test(title)) return;
      seenVideos.add(id);
      videos.push(v);
    }));
    videos.splice(VIDEOS);
    if (!videos.length) return { label: "YouTube", reviews: [], problem: "no matching review videos" };

    // Read up to PAGES pages of comments from each video, all videos at the same time
    const readVideo = async (v) => {
      const items = [];
      let pageToken = "";
      for (let page = 0; page < PAGES; page++) {
        const params = { part: "snippet", videoId: v.id.videoId, maxResults: "100", order: "relevance", textFormat: "plainText" };
        if (pageToken) params.pageToken = pageToken;
        let d;
        try { d = await get("commentThreads", params); } catch (e) { break; } // comments turned off on this video
        items.push.apply(items, d.items || []);
        if (!d.nextPageToken) break;
        pageToken = d.nextPageToken;
      }
      return { video: v, items };
    };
    const lists = await Promise.all(videos.map(readVideo));

    const comments = [];
    lists.forEach(({ video, items }) => items.forEach((t) => {
      const c = t.snippet && t.snippet.topLevelComment && t.snippet.topLevelComment.snippet;
      if (!c) return;
      const text = String(c.textOriginal || c.textDisplay || "").replace(/\s+/g, " ").trim();
      if (!looksUseful(text)) return;
      comments.push({ owner: OWNER.test(text),
        site: "YouTube", sourceKind: "comment", trusted: true,
        url: "https://www.youtube.com/watch?v=" + video.id.videoId + "&lc=" + t.id,
        rating: 0, date: String(c.publishedAt || "").slice(0, 10), verified: false,
        text, likes: c.likeCount || 0
      });
    }));
    comments.sort((a, b) => (b.owner - a.owner) || (b.likes - a.likes)); // owners first, then most liked
    const reviews = comments.slice(0, KEEP);
    return { label: "YouTube", reviews, problem: reviews.length ? "" : "no owner comments on " + videos.length + " videos" };
  } catch (err) {
    return { label: "YouTube", reviews: [], problem: err.message };
  }
}

module.exports = { youtubeReviews, isHindi };
