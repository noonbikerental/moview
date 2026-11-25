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

export async function onRequestGet(context) {
  const apiKey = String(context.env?.TMDB_API_KEY || "").trim();
  const reqUrl = new URL(context.request.url);
  const rawQuery = reqUrl.searchParams.get("q") || "";
  const query = rawQuery.trim();

  if (query.length < 2 || query.length > 60) {
    return jsonResponse(
      {
        configured: Boolean(apiKey),
        error: "Search query must be between 2 and 60 characters.",
        results: [],
      },
      400
    );
  }

  if (!apiKey) {
    return jsonResponse(
      {
        configured: false,
        error: "Catalog search is unavailable until TMDB_API_KEY is configured.",
        results: [],
      },
      503
    );
  }

  const tmdbEndpoint = `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(
    query
  )}&include_adult=false&language=en-IN&page=1`;
  const { url, headers } = buildTmdbRequest(tmdbEndpoint, apiKey);

  try {
    const upstream = await fetch(url, { headers });
    if (!upstream.ok) {
      return jsonResponse(
        {
          configured: true,
          error: "Could not complete TMDB search right now.",
          results: [],
        },
        502
      );
    }

    const data = await upstream.json();
    const rawResults = Array.isArray(data?.results) ? data.results : [];
    const compact = [];

    for (const item of rawResults) {
      if (item?.media_type !== "movie" && item?.media_type !== "tv") continue;
      if (!item.id) continue;

      const title = item.title || item.name || "";
      if (!title) continue;

      const releaseDate = item.release_date || item.first_air_date || "";
      compact.push({
        id: String(item.id),
        media_type: item.media_type,
        title,
        year: releaseDate ? releaseDate.slice(0, 4) : "",
        poster_path: item.poster_path || null,
      });

      if (compact.length >= 12) break;
    }

    return jsonResponse(
      {
        configured: true,
        results: compact,
      },
      200,
      "public, max-age=3600"
    );
  } catch {
    return jsonResponse(
      {
        configured: true,
        error: "Network error while searching TMDB.",
        results: [],
      },
      502
    );
  }
}
