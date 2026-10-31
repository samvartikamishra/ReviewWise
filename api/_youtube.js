// YouTube source for ReviewWise AI (free YouTube Data API v3).
// Finds review videos for the product, then collects comments where viewers describe owning it.
// Needs YOUTUBE_API_KEY in Vercel. Uses about 110 of the 10,000 free daily quota units per search.

const API = "https://www.googleapis.com/youtube/v3/";
const VIDEOS = 8;          // videos to read comments from
const PER_VIDEO = 100;     // comments fetched per video (the most YouTube returns in one call)
const KEEP = 50;           // comments kept in total

// Comments that sound like someone who owns or bought the product, in English or Hinglish
const OWNER = /\b(i (have )?(bought|purchased|got|ordered|own|use)|i'?m using|i am using|been using|using (it|this|the)|my (tv|unit|set|one|phone|laptop|device)|after \d+ (days?|weeks?|months?|years?)|\d+ (days?|weeks?|months?|years?) (of use|now|later|in)|installed|installation|delivered|delivery|service cent(er|re)|warranty|kharid|liya|le liya|use kar|chala raha)\b/i;

// Longer comments that describe the product's qualities also count, even without "I bought"
const EXPERIENCE = /\b(picture|display|screen|colou?rs?|brightness|sound|audio|speakers?|bass|remote|software|apps?|lag|heat(ing)?|battery|build|quality|performance|service|price|worth|value|problem|issue|defect|faulty|replace(d|ment)?|repair)\b/i;

function looksUseful(text) {
  if (text.length < 40 || text.length > 1200) return false;
  if (/\?\s*$/.test(text) && text.length < 120) return false;          // short questions, e.g. "Which is better?"
  if (/\b(sir|bhai|brother)\b.*\b(reply|suggest|tell)\b/i.test(text)) return false; // asking the creator for advice
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
    const found = await get("search", { part: "snippet", type: "video", maxResults: "20", regionCode: "IN", relevanceLanguage: "en", q: productName + " review" });
    const videos = (found.items || [])
      .filter((v) => v.id && v.id.videoId && matchesProduct(v.snippet && v.snippet.title, productName))
      .slice(0, VIDEOS);
    if (!videos.length) return { label: "YouTube", reviews: [], problem: "no matching review videos" };

    const lists = await Promise.all(videos.map((v) =>
      get("commentThreads", { part: "snippet", videoId: v.id.videoId, maxResults: String(PER_VIDEO), order: "relevance", textFormat: "plainText" })
        .then((d) => ({ video: v, items: d.items || [] }))
        .catch(() => ({ video: v, items: [] })) // comments turned off on this video
    ));

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

module.exports = { youtubeReviews };
