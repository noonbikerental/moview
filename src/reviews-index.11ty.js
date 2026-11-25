export default class ReviewsIndex {
  data() {
    return {
      permalink: "/assets/reviews-index.json",
      eleventyExcludeFromCollections: true,
    };
  }

  render(data) {
    const reviews = data.collections?.reviews || [];
    const tmdbMap = data.tmdb || {};
    const indexMap = {};

    for (const review of reviews) {
      const id = review.data?.tmdb_id;
      const type = review.data?.type || "movie";
      if (!id) continue;

      const tmdbItem = tmdbMap[`${type}:${id}`] || null;
      const year =
        tmdbItem?.year ||
        (review.data?.date ? new Date(review.data.date).getUTCFullYear().toString() : "");

      indexMap[`${type}:${id}`] = {
        url: review.url,
        title: review.data?.title || tmdbItem?.title || "",
        rating: review.data?.rating ?? null,
        verdict: review.data?.verdict || "",
        platform: review.data?.platform || "",
        year,
        posterUrl: tmdbItem?.posterUrl || null,
      };
    }

    return JSON.stringify(indexMap);
  }
}
