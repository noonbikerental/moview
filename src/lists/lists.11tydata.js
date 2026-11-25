export default {
  layout: "layouts/list.njk",
  permalink: (data) => {
    const slug =
      data.slug ||
      String(data.title || "list")
        .toLowerCase()
        .trim()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return `/lists/${slug}/index.html`;
  },
};
