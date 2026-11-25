function jsonResponse(payload, status = 200, cacheControl = "no-store") {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function buildTmdbRequest(rawUrl, apiKey) {
  const isBearerToken = apiKey.includes(".") || apiKey.length > 40;
  const separator = rawUrl.includes("?") ? "&" : "?";
  const url = isBearerToken
    ? rawUrl
    : `${rawUrl}${separator}api_key=${encodeURIComponent(apiKey)}`;

  return {
    url,
    headers: {
      accept: "application/json",
      ...(isBearerToken ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
  };
}

function pickTrailerKey(videos = []) {
  if (!Array.isArray(videos)) return null;
  const yt = videos.filter((v) => v?.site === "YouTube" && v?.key);
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

function normalizeTitle(raw, type, id) {
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
    title: raw.title || raw.name || "",
    originalTitle: raw.original_title || raw.original_name || "",
    tagline: raw.tagline || "",
    overview: raw.overview || "",
    releaseDate,
    year,
    runtime,
    numberOfSeasons: raw.number_of_seasons || null,
    genres: Array.isArray(raw.genres) ? raw.genres.map((g) => g.name).filter(Boolean) : [],
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

export async function onRequestGet(context) {
  const apiKey = String(context.env?.TMDB_API_KEY || "").trim();
  const reqUrl = new URL(context.request.url);
  const id = (reqUrl.searchParams.get("id") || "").trim();
  const type = (reqUrl.searchParams.get("type") || "").trim();

  if (!/^[1-9]\d{0,9}$/.test(id)) {
    return jsonResponse(
      { configured: Boolean(apiKey), error: "Title id must be a positive integer." },
      400
    );
  }

  if (type !== "movie" && type !== "tv") {
    return jsonResponse(
      { configured: Boolean(apiKey), error: "Title type must be 'movie' or 'tv'." },
      400
    );
  }

  if (!apiKey) {
    return jsonResponse(
      {
        configured: false,
        error: "Title details are unavailable until TMDB_API_KEY is configured.",
      },
      503
    );
  }

  const tmdbEndpoint = `https://api.themoviedb.org/3/${type}/${id}?append_to_response=credits,videos,watch/providers&language=en-IN`;
  const { url, headers } = buildTmdbRequest(tmdbEndpoint, apiKey);

  try {
    const upstream = await fetch(url, { headers });
    if (upstream.status === 404) {
      return jsonResponse(
        { configured: true, error: "Title was not found on TMDB." },
        404
      );
    }
    if (!upstream.ok) {
      return jsonResponse(
        { configured: true, error: "Could not load title details from TMDB." },
        502
      );
    }

    const raw = await upstream.json();
    const normalized = normalizeTitle(raw, type, id);

    return jsonResponse(
      {
        configured: true,
        title: normalized,
      },
      200,
      "public, max-age=86400"
    );
  } catch {
    return jsonResponse(
      { configured: true, error: "Network error while loading title details." },
      502
    );
  }
}
