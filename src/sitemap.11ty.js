export default class Sitemap {
  data() {
    return {
      permalink: "/sitemap.xml",
      eleventyExcludeFromCollections: true,
    };
  }

  render(data) {
    const baseUrl = String(data.site?.url || "https://moview.com").replace(/\/+$/, "");
    const collections = data.collections || {};
    const urls = new Map();

    const addUrl = (pathStr, lastmod) => {
      let cleanPath = String(pathStr || "/");
      if (!cleanPath.startsWith("/")) cleanPath = `/${cleanPath}`;
      cleanPath = cleanPath.replace(/index\.html$/, "");
      if (cleanPath !== "/" && !cleanPath.endsWith("/")) {
        cleanPath = `${cleanPath}/`;
      }
      const loc = `${baseUrl}${cleanPath}`;
      const mod = lastmod
        ? new Date(lastmod).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      if (!urls.has(loc)) {
        urls.set(loc, mod);
      }
    };

    // Indexable static & hub pages (never include /search/, /title/, /sign-in/, /u/, /my-watchlist/, /settings/, /admin-moderation/, /404.html)
    const staticPaths = [
      "/",
      "/reviews/",
      "/movies/",
      "/web-series/",
      "/lists/",
      "/about/",
      "/community-guidelines/",
      "/contact/",
      "/privacy-policy/",
      "/disclaimer/",
      "/about-data/",
    ];
    for (const p of staticPaths) {
      addUrl(p);
    }

    // All reviews
    for (const review of collections.reviews || []) {
      addUrl(review.url, review.date);
    }

    // All lists
    for (const list of collections.lists || []) {
      addUrl(list.url, list.date);
    }

    // Platforms
    for (const platform of collections.platforms || []) {
      addUrl(`/platform/${platform.slug}/`);
    }

    // Indexable genres only (3+ reviews)
    for (const genre of collections.genres || []) {
      if (genre.isIndexable) {
        addUrl(`/genre/${genre.slug}/`);
      }
    }

    const entries = Array.from(urls.entries())
      .map(
        ([loc, lastmod]) =>
          `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`
      )
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
  }
}
