export default class Robots {
  data() {
    return {
      permalink: "/robots.txt",
      eleventyExcludeFromCollections: true,
    };
  }

  render(data) {
    const baseUrl = String(data.site?.url || "https://moview.com").replace(/\/+$/, "");
    return `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`;
  }
}
