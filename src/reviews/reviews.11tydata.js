export default {
  layout: "layouts/review.njk",
  permalink: (data) => {
    const slug =
      data.slug ||
      String(data.title || "review")
        .toLowerCase()
        .trim()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return `/reviews/${slug}/index.html`;
  },
};
