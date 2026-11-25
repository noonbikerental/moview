import Fetch from "@11ty/eleventy-fetch";

try {
  await import("dotenv/config");
} catch {
  // dotenv is optional in production CI/Cloudflare Pages
}

function buildTmdbFetchConfig(rawUrl, apiKey) {
  const isBearerToken = apiKey.includes(".") || apiKey.length > 40;
  const separator = rawUrl.includes("?") ? "&" : "?";
  const url = isBearerToken
    ? rawUrl
    : `${rawUrl}${separator}api_key=${encodeURIComponent(apiKey)}`;

  return {
    url,
    fetchOptions: {
      headers: {
        accept: "application/json",
        ...(isBearerToken ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    },
  };
}

function normalizeDiscoveryList(results = [], forcedType = null) {
  if (!Array.isArray(results)) return [];

  const normalized = [];
  const seen = new Set();

  for (const item of results) {
    const mediaType = forcedType || item.media_type;
    if (mediaType !== "movie" && mediaType !== "tv") continue;
    if (!item.id) continue;

    const dedupeKey = `${mediaType}:${item.id}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const releaseDate = item.release_date || item.first_air_date || "";
    const title = item.title || item.name || "";
    if (!title) continue;

    normalized.push({
      id: String(item.id),
      mediaType,
      title,
      year: releaseDate ? releaseDate.slice(0, 4) : "",
      posterPath: item.poster_path || null,
      posterUrl: item.poster_path
        ? `https://image.tmdb.org/t/p/w342${item.poster_path}`
        : null,
    });

    if (normalized.length >= 20) break;
  }

  return normalized;
}

async function safeFetchList(label, rawUrl, apiKey, forcedType = null) {
  const { url, fetchOptions } = buildTmdbFetchConfig(rawUrl, apiKey);
  try {
    const data = await Fetch(url, {
      duration: "1d",
      type: "json",
      fetchOptions,
    });
    return normalizeDiscoveryList(data?.results || [], forcedType);
  } catch (err) {
    console.warn(
      `[moview] TMDB home list "${label}" failed (${err?.message || "unknown error"}); hiding row.`
    );
    return [];
  }
}

export default async function () {
  const apiKey = (process.env.TMDB_API_KEY || "").trim();

  if (!apiKey) {
    return {
      trendingWeek: [],
      popularIndia: [],
      trendingSeries: [],
    };
  }

  const [trendingWeek, popularIndia, trendingSeries] = await Promise.all([
    safeFetchList(
      "Trending This Week",
      "https://api.themoviedb.org/3/trending/all/week?language=en-IN",
      apiKey,
      null
    ),
    safeFetchList(
      "Popular in India",
      "https://api.themoviedb.org/3/discover/movie?region=IN&with_original_language=hi&sort_by=popularity.desc&include_adult=false&language=en-IN",
      apiKey,
      "movie"
    ),
    safeFetchList(
      "Trending Web Series",
      "https://api.themoviedb.org/3/trending/tv/week?language=en-IN",
      apiKey,
      "tv"
    ),
  ]);

  return {
    trendingWeek,
    popularIndia,
    trendingSeries,
  };
}
