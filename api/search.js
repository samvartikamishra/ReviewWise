// Returns review insights for a TV model.
// For now this sends sample data. Later it will fetch real reviews.
export default function handler(req, res) {
  const model = req.query.model || "Unknown model";

  res.status(200).json({
    model,
    reviewCount: 1000,
    sources: [
      { name: "Amazon", count: 412 },
      { name: "Google Reviews", count: 298 },
      { name: "Best Buy", count: 186 },
      { name: "Reddit", count: 104 }
    ],
    summary: "Buyers love the picture and brightness. Complaints focus on speakers and smart TV software.",
    features: [
      { name: "Picture quality", score: 4.7 },
      { name: "Sound", score: 2.9 }
    ],
    recurring: [
      { title: "Weak built-in speakers", detail: "Raised in 26% of reviews." }
    ],
    strengths: [
      "Excellent contrast and deep blacks (praised in 71% of reviews)"
    ],
    quotes: [
      "The picture is worth every rupee, but plan on buying a soundbar."
    ]
  });
}
