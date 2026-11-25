import Fetch from "@11ty/eleventy-fetch";
import fs from "node:fs";
import path from "node:path";

try {
  await import("dotenv/config");
} catch {
  // dotenv is optional in production CI/Cloudflare Pages
}

function extractEntriesFromMarkdownDir(dirPath, mode) {
  if (!fs.existsSync(dirPath)) return [];
  const entries = [];
  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".md"));

  for (const file of files) {
    const content = fs.readFileSync(path.join(dirPath, file), "utf8");
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) continue;
    const fm = fmMatch[1];

    if (mode === "reviews") {
      const idMatch = fm.match(/^tmdb_id:\s*["']?(\d+)["']?/m);
      const typeMatch = fm.match(/^type:\s*["']?(movie|tv)["']?/m);
      if (idMatch) {
        entries.push({
          tmdb_id: idMatch[1],
          type: typeMatch ? typeMatch[1] : "movie",
        });
      }
    } else if (mode === "lists") {
      const itemsSection = fm.match(/^items:\s*\r?\n([\s\S]*)/m);
      if (!itemsSection) continue;
      const blocks = itemsSection[1].split(/\r?\n(?=\s*-\s+)/);
      for (const block of blocks) {
        const idMatch = block.match(/tmdb_id:\s*["']?(\d+)["']?/);
        const typeMatch = block.match(/type:\s*["']?(movie|tv)["']?/);
        if (idMatch) {
          entries.push({
            tmdb_id: idMatch[1],
            type: typeMatch ? typeMatch[1] : "movie",
          });
        }
      }
    }
  }

  return entries;
}

function pickTrailerKey(videos = []) {
  if (!Array.isArray(videos)) return null;
  const yt = videos.filter((v) => v.site === "YouTube" && v.key);
  if (yt.length === 0) return null;

  const officialTrailer = yt.find((v) => v.type === "Trailer" && v.official);
  if (officialTrailer) return officialTrailer.key;

  const anyTrailer = yt.find((v) => v.type === "Trailer");
  if (anyTrailer) return anyTrailer.key;

  const teaser = yt.find((v) => v.type === "Teaser");
  if (teaser) return teaser.key;

  return yt[0].key;
}

function extractIndiaProviders(inData) {
  if (!inData) {
    return {
      link: null,
      flatrate: [],
      rent: [],
      buy: [],
      hasAny: false,
    };
  }

  const mapProviders = (arr = []) =>
    arr.map((p) => ({
      id: p.provider_id,
      name: p.provider_name,
      logoUrl: p.logo_path ? `https://image.tmdb.org/t/p/w92${p.logo_path}` : null,
    }));

  const flatrate = mapProviders(inData.flatrate);
  const rent = mapProviders(inData.rent);
  const buy = mapProviders(inData.buy);

  return {
    link: inData.link || null,
    flatrate,
    rent,
    buy,
    hasAny: flatrate.length > 0 || rent.length > 0 || buy.length > 0,
  };
}

function createFallbackRecord(type, id) {
  return {
    id: String(id),
    type,
    available: false,
    title: "",
    originalTitle: "",
    tagline: "",
    overview: "",
    releaseDate: "",
    year: "",
    runtime: null,
    numberOfSeasons: null,
    genres: [],
    posterPath: null,
    backdropPath: null,
    posterUrl: null,
    backdropUrl: null,
    cast: [],
    directorOrCreator: "",
    trailerKey: null,
    watchProvidersIN: {
      link: null,
      flatrate: [],
      rent: [],
      buy: [],
      hasAny: false,
    },
  };
}

function normalizeTmdbResponse(raw, type, id) {
  const releaseDate = raw.release_date || raw.first_air_date || "";
  const year = releaseDate ? releaseDate.slice(0, 4) : "";
  const runtime =
    raw.runtime ||
    (Array.isArray(raw.episode_run_time) && raw.episode_run_time.length > 0
      ? raw.episode_run_time[0]
      : null);

  const directors =
    type === "movie"
      ? (raw.credits?.crew || [])
          .filter((person) => person.job === "Director")
          .map((person) => person.name)
      : (raw.created_by || []).map((person) => person.name);

  return {
    id: String(id),
    type,
    available: true,
    title: raw.title || raw.name || "",
    originalTitle: raw.original_title || raw.original_name || "",
    tagline: raw.tagline || "",
    overview: raw.overview || "",
    releaseDate,
    year,
    runtime,
    numberOfSeasons: raw.number_of_seasons || null,
    genres: Array.isArray(raw.genres) ? raw.genres.map((g) => g.name) : [],
    posterPath: raw.poster_path || null,
    backdropPath: raw.backdrop_path || null,
    posterUrl: raw.poster_path
      ? `https://image.tmdb.org/t/p/w342${raw.poster_path}`
      : null,
    backdropUrl: raw.backdrop_path
      ? `https://image.tmdb.org/t/p/w780${raw.backdrop_path}`
      : null,
    cast: (raw.credits?.cast || []).slice(0, 8).map((actor) => ({
      name: actor.name,
      character: actor.character || "",
      profileUrl: actor.profile_path
        ? `https://image.tmdb.org/t/p/w185${actor.profile_path}`
        : null,
    })),
    directorOrCreator: [...new Set(directors)].join(", "),
    trailerKey: pickTrailerKey(raw.videos?.results || []),
    watchProvidersIN: extractIndiaProviders(raw["watch/providers"]?.results?.IN),
  };
}

export default async function () {
  const apiKey = (process.env.TMDB_API_KEY || "").trim();

  const reviewEntries = extractEntriesFromMarkdownDir(
    path.resolve("src/reviews"),
    "reviews"
  );
  const listEntries = extractEntriesFromMarkdownDir(
    path.resolve("src/lists"),
    "lists"
  );

  const uniquePairs = new Map();
  for (const entry of [...reviewEntries, ...listEntries]) {
    const key = `${entry.type}:${entry.tmdb_id}`;
    if (!uniquePairs.has(key)) {
      uniquePairs.set(key, entry);
    }
  }

  const results = {};

  if (!apiKey) {
    console.warn(
      "[moview] TMDB_API_KEY is not set; building with placeholder posters and front-matter metadata."
    );
    for (const [key, entry] of uniquePairs.entries()) {
      results[key] = createFallbackRecord(entry.type, entry.tmdb_id);
    }
    return results;
  }

  const isBearerToken = apiKey.includes(".") || apiKey.length > 40;

  await Promise.all(
    Array.from(uniquePairs.entries()).map(async ([key, entry]) => {
      const baseUrl = `https://api.themoviedb.org/3/${entry.type}/${entry.tmdb_id}?append_to_response=credits,videos,watch/providers&language=en-US`;
      const url = isBearerToken
        ? baseUrl
        : `${baseUrl}&api_key=${encodeURIComponent(apiKey)}`;

      const fetchOptions = {
        headers: {
          accept: "application/json",
          ...(isBearerToken ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
      };

      try {
        const data = await Fetch(url, {
          duration: "1d",
          type: "json",
          fetchOptions,
        });
        results[key] = normalizeTmdbResponse(data, entry.type, entry.tmdb_id);
      } catch (err) {
        console.warn(
          `[moview] TMDB fetch failed for ${key} (${err?.message || "unknown error"}); using fallback.`
        );
        results[key] = createFallbackRecord(entry.type, entry.tmdb_id);
      }
    })
  );

  return results;
}
