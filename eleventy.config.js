import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function slugifyText(str = "") {
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getReviewGenresList(review, tmdbMap = {}) {
  const override = review?.data?.genres;
  if (Array.isArray(override) && override.length > 0) {
    return override.map((g) => String(g).trim()).filter(Boolean);
  }
  const type = review?.data?.type || "movie";
  const id = review?.data?.tmdb_id;
  const tmdbItem = tmdbMap?.[`${type}:${id}`];
  if (tmdbItem && Array.isArray(tmdbItem.genres) && tmdbItem.genres.length > 0) {
    return tmdbItem.genres;
  }
  return [];
}

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addWatchTarget("src/styles/");

  // Build Tailwind CSS cleanly as part of every `npx @11ty/eleventy` run
  eleventyConfig.on("eleventy.after", () => {
    const outDir = path.resolve("_site/assets");
    fs.mkdirSync(outDir, { recursive: true });
    const inputCss = path.resolve("src/styles/main.css");
    const outputCss = path.resolve("_site/assets/styles.css");
    const localBin = path.resolve("node_modules/.bin/tailwindcss");

    if (fs.existsSync(localBin)) {
      execFileSync(localBin, ["-i", inputCss, "-o", outputCss, "--minify"], {
        stdio: "inherit",
      });
    } else {
      execFileSync(
        "npx",
        ["@tailwindcss/cli", "-i", inputCss, "-o", outputCss, "--minify"],
        { stdio: "inherit" }
      );
    }
  });

  // Filters
  eleventyConfig.addFilter("slugify", (value) => slugifyText(value));

  eleventyConfig.addFilter("platformSlug", (value) => slugifyText(value));

  eleventyConfig.addFilter("readableDate", (dateObj) => {
    if (!dateObj) return "";
    const d = new Date(dateObj);
    if (Number.isNaN(d.getTime())) return String(dateObj);
    return new Intl.DateTimeFormat("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(d);
  });

  eleventyConfig.addFilter("isoDate", (dateObj) => {
    if (!dateObj) return new Date().toISOString().slice(0, 10);
    const d = new Date(dateObj);
    if (Number.isNaN(d.getTime())) return String(dateObj).slice(0, 10);
    return d.toISOString().slice(0, 10);
  });

  eleventyConfig.addFilter("yearFromDate", (dateStr) => {
    if (!dateStr) return "";
    if (dateStr === "now") return String(new Date().getUTCFullYear());
    const match = String(dateStr).match(/\d{4}/);
    return match ? match[0] : "";
  });

  eleventyConfig.addFilter("formatRating", (val) => {
    const num = Number(val);
    return Number.isFinite(num) ? num.toFixed(1) : "0.0";
  });

  eleventyConfig.addFilter("verdictMeta", (verdict) => {
    const map = {
      "Must Watch": {
        classes: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
        dotClass: "bg-emerald-400",
        label: "Must Watch",
      },
      "Worth Watching": {
        classes: "bg-sky-500/15 text-sky-300 border-sky-500/40",
        dotClass: "bg-sky-400",
        label: "Worth Watching",
      },
      "One-Time Watch": {
        classes: "bg-amber-500/15 text-amber-300 border-amber-500/40",
        dotClass: "bg-amber-400",
        label: "One-Time Watch",
      },
      "Skip It": {
        classes: "bg-rose-500/15 text-rose-300 border-rose-500/40",
        dotClass: "bg-rose-400",
        label: "Skip It",
      },
    };
    return (
      map[verdict] || {
        classes: "bg-zinc-500/15 text-zinc-300 border-zinc-500/40",
        dotClass: "bg-zinc-400",
        label: verdict || "Reviewed",
      }
    );
  });

  eleventyConfig.addFilter("tmdbLookup", (tmdbMap, type, id) => {
    if (!tmdbMap || !id) return null;
    const key = `${type || "movie"}:${id}`;
    return tmdbMap[key] || null;
  });

  eleventyConfig.addFilter("getReviewGenres", (review, tmdbMap) => {
    return getReviewGenresList(review, tmdbMap);
  });

  eleventyConfig.addFilter(
    "relatedReviews",
    (allReviews = [], currentReview, tmdbMap = {}, limit = 4) => {
      if (!Array.isArray(allReviews) || !currentReview) return [];
      const currentSlug = currentReview.url;
      const currentGenres = new Set(
        getReviewGenresList(currentReview, tmdbMap).map((g) => g.toLowerCase())
      );

      const candidates = allReviews
        .filter((item) => item.url !== currentSlug)
        .map((item) => {
          const itemGenres = getReviewGenresList(item, tmdbMap).map((g) =>
            g.toLowerCase()
          );
          const overlap = itemGenres.filter((g) => currentGenres.has(g)).length;
          return { item, overlap };
        })
        .sort((a, b) => {
          if (b.overlap !== a.overlap) return b.overlap - a.overlap;
          return new Date(b.item.date) - new Date(a.item.date);
        });

      return candidates.slice(0, limit).map((c) => c.item);
    }
  );

  eleventyConfig.addFilter("findReviewByTmdb", (allReviews = [], type, id) => {
    if (!Array.isArray(allReviews) || !id) return null;
    return (
      allReviews.find(
        (r) =>
          String(r.data.tmdb_id) === String(id) &&
          (r.data.type || "movie") === (type || "movie")
      ) || null
    );
  });

  eleventyConfig.addFilter("absoluteUrl", (urlPath = "/", baseUrl = "https://moview.com") => {
    const cleanBase = String(baseUrl).replace(/\/+$/, "");
    let cleanPath = String(urlPath || "/");
    if (!cleanPath.startsWith("/")) cleanPath = `/${cleanPath}`;
    cleanPath = cleanPath.replace(/index\.html$/, "");
    if (cleanPath !== "/" && !cleanPath.endsWith("/") && !cleanPath.includes(".")) {
      cleanPath = `${cleanPath}/`;
    }
    return `${cleanBase}${cleanPath}`;
  });

  eleventyConfig.addFilter("jsonLdScript", (obj) => {
    return JSON.stringify(obj, null, 2).replace(/<\//g, "<\\/");
  });

  eleventyConfig.addFilter("reviewJsonLd", (reviewData, tmdbItem, site, pageUrl) => {
    const type = reviewData?.type === "tv" ? "TVSeries" : "Movie";
    const canonical = `${String(site.url).replace(/\/+$/, "")}${pageUrl}`;
    const itemReviewed = {
      "@type": type,
      name: reviewData?.title || tmdbItem?.title || "",
    };

    if (tmdbItem?.posterUrl || tmdbItem?.backdropUrl) {
      itemReviewed.image = tmdbItem.backdropUrl || tmdbItem.posterUrl;
    }
    if (tmdbItem?.releaseDate) {
      itemReviewed.dateCreated = tmdbItem.releaseDate;
    }
    if (tmdbItem?.directorOrCreator) {
      const names = tmdbItem.directorOrCreator
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean)
        .map((name) => ({ "@type": "Person", name }));
      if (names.length > 0) {
        if (type === "Movie") {
          itemReviewed.director = names.length === 1 ? names[0] : names;
        } else {
          itemReviewed.creator = names.length === 1 ? names[0] : names;
        }
      }
    }
    if (Array.isArray(tmdbItem?.cast) && tmdbItem.cast.length > 0) {
      itemReviewed.actor = tmdbItem.cast.map((actor) => ({
        "@type": "Person",
        name: actor.name,
      }));
    }

    const schema = {
      "@context": "https://schema.org",
      "@type": "Review",
      url: canonical,
      headline: reviewData?.seo_title || `${reviewData?.title} Review: ${reviewData?.verdict}`,
      reviewBody: reviewData?.short_summary || "",
      datePublished: reviewData?.date
        ? new Date(reviewData.date).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      author: {
        "@type": "Person",
        name: reviewData?.author || site.author || "Moview Editorial",
      },
      publisher: {
        "@type": "Organization",
        name: site.name,
        url: site.url,
      },
      itemReviewed,
      reviewRating: {
        "@type": "Rating",
        ratingValue: Number(reviewData?.rating || 0).toFixed(1),
        bestRating: "10",
        worstRating: "0",
      },
    };

    return JSON.stringify(schema, null, 2).replace(/<\//g, "<\\/");
  });

  eleventyConfig.addFilter("listJsonLd", (listData, tmdbMap, allReviews, site, pageUrl) => {
    const baseUrl = String(site.url).replace(/\/+$/, "");
    const items = Array.isArray(listData?.items) ? listData.items : [];
    const listElements = items.map((entry, idx) => {
      const key = `${entry.type || "movie"}:${entry.tmdb_id}`;
      const tmdbItem = tmdbMap?.[key];
      const matchedReview = (allReviews || []).find(
        (r) =>
          String(r.data.tmdb_id) === String(entry.tmdb_id) &&
          (r.data.type || "movie") === (entry.type || "movie")
      );
      const itemName =
        matchedReview?.data?.title ||
        tmdbItem?.title ||
        `Title #${entry.tmdb_id}`;
      const itemObj = {
        "@type": entry.type === "tv" ? "TVSeries" : "Movie",
        name: itemName,
      };
      if (tmdbItem?.posterUrl) itemObj.image = tmdbItem.posterUrl;
      if (matchedReview?.url) itemObj.url = `${baseUrl}${matchedReview.url}`;

      return {
        "@type": "ListItem",
        position: idx + 1,
        item: itemObj,
      };
    });

    const schema = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: listData?.title || "",
      description: listData?.intro || "",
      url: `${baseUrl}${pageUrl}`,
      numberOfItems: listElements.length,
      itemListElement: listElements,
    };

    return JSON.stringify(schema, null, 2).replace(/<\//g, "<\\/");
  });

  eleventyConfig.addFilter("breadcrumbJsonLd", (crumbs = [], site) => {
    const baseUrl = String(site.url).replace(/\/+$/, "");
    const itemListElement = crumbs.map((crumb, index) => {
      const entry = {
        "@type": "ListItem",
        position: index + 1,
        name: crumb.name,
      };
      if (crumb.url) {
        entry.item = crumb.url.startsWith("http")
          ? crumb.url
          : `${baseUrl}${crumb.url}`;
      }
      return entry;
    });

    const schema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement,
    };

    return JSON.stringify(schema, null, 2).replace(/<\//g, "<\\/");
  });

  eleventyConfig.addFilter("formatRuntime", (minutes) => {
    const mins = Number(minutes);
    if (!Number.isFinite(mins) || mins <= 0) return "";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  });

  // Collections
  eleventyConfig.addCollection("reviews", (collectionApi) => {
    return collectionApi
      .getFilteredByGlob("src/reviews/*.md")
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  });

  eleventyConfig.addCollection("movies", (collectionApi) => {
    return collectionApi
      .getFilteredByGlob("src/reviews/*.md")
      .filter((item) => item.data.type === "movie")
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  });

  eleventyConfig.addCollection("webSeries", (collectionApi) => {
    return collectionApi
      .getFilteredByGlob("src/reviews/*.md")
      .filter((item) => item.data.type === "tv")
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  });

  eleventyConfig.addCollection("mustWatch", (collectionApi) => {
    return collectionApi
      .getFilteredByGlob("src/reviews/*.md")
      .filter((item) => item.data.verdict === "Must Watch")
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  });

  eleventyConfig.addCollection("lists", (collectionApi) => {
    return collectionApi
      .getFilteredByGlob("src/lists/*.md")
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  });

  eleventyConfig.addCollection("platforms", (collectionApi) => {
    const reviews = collectionApi
      .getFilteredByGlob("src/reviews/*.md")
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    const definitions = [
      {
        name: "Netflix",
        slug: "netflix",
        intro:
          "Original Hindi films, binge-worthy Indian thrillers, and prestige dramas streaming on Netflix India.",
      },
      {
        name: "Prime Video",
        slug: "prime-video",
        intro:
          "Acclaimed Hindi web series, heartland comedies, and post-theatrical Bollywood premieres on Amazon Prime Video.",
      },
      {
        name: "JioHotstar",
        slug: "jiohotstar",
        intro:
          "Big-ticket Hindi cinema, crime dramas, and original series streaming on JioHotstar.",
      },
      {
        name: "ZEE5",
        slug: "zee5",
        intro:
          "Direct-to-digital Hindi films, investigative thrillers, and regional crossovers on ZEE5.",
      },
      {
        name: "SonyLIV",
        slug: "sonyliv",
        intro:
          "Critically acclaimed Indian dramas, biographical series, and grounded cinema on SonyLIV.",
      },
      {
        name: "Theatre",
        slug: "theatre",
        intro:
          "Theatrical Bollywood releases reviewed from the big screen before they arrive on OTT.",
      },
      {
        name: "Other",
        slug: "other",
        intro:
          "Independent Hindi films and series streaming across boutique and specialty platforms.",
      },
    ];

    return definitions.map((def) => {
      const matched = reviews.filter(
        (r) =>
          String(r.data.platform || "").toLowerCase() === def.name.toLowerCase()
      );
      return {
        ...def,
        reviews: matched,
        count: matched.length,
      };
    });
  });

  eleventyConfig.addCollection("genres", (collectionApi) => {
    const reviews = collectionApi
      .getFilteredByGlob("src/reviews/*.md")
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    const genreMap = new Map();

    for (const review of reviews) {
      const tmdbMap = review.data.tmdb || {};
      const genres = getReviewGenresList(review, tmdbMap);
      for (const genreName of genres) {
        const slug = slugifyText(genreName);
        if (!slug) continue;
        if (!genreMap.has(slug)) {
          genreMap.set(slug, {
            name: genreName,
            slug,
            reviews: [],
          });
        }
        genreMap.get(slug).reviews.push(review);
      }
    }

    return Array.from(genreMap.values())
      .map((entry) => ({
        ...entry,
        count: entry.reviews.length,
        isIndexable: entry.reviews.length >= 3,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    templateFormats: ["njk", "md", "html", "11ty.js"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    dataTemplateEngine: "njk",
  };
}
