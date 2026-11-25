(() => {
  "use strict";

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function isSafeHttpUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") return false;
    try {
      const parsed = new URL(rawUrl, window.location.origin);
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
      return false;
    }
  }

  function formatRuntime(minutes) {
    const mins = Number(minutes);
    if (!Number.isFinite(mins) || mins <= 0) return "";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }

  function showError(heading, message) {
    const loading = document.getElementById("title-loading");
    const errBox = document.getElementById("title-error");
    const content = document.getElementById("title-content");
    const headingEl = document.getElementById("title-error-heading");
    const msgEl = document.getElementById("title-error-message");

    if (loading) loading.classList.add("hidden");
    if (content) content.classList.add("hidden");
    if (errBox) errBox.classList.remove("hidden");
    if (headingEl && heading) headingEl.textContent = heading;
    if (msgEl && message) msgEl.textContent = message;
  }

  function renderProvidersGroup(label, providers) {
    const group = el("div", "mt-4 border-t border-white/10 pt-4 first:mt-0 first:border-t-0 first:pt-0");
    group.appendChild(el("p", "text-xs font-medium text-zinc-400", label));
    const ul = el("ul", "mt-2 space-y-2.5");
    for (const p of providers) {
      const li = el("li", "flex items-center gap-3");
      if (isSafeHttpUrl(p.logoUrl)) {
        const img = el("img", "h-8 w-8 rounded-md object-cover");
        img.src = p.logoUrl;
        img.alt = p.name || "Provider";
        img.loading = "lazy";
        img.decoding = "async";
        img.referrerPolicy = "no-referrer";
        li.appendChild(img);
      }
      li.appendChild(el("span", "text-sm font-medium text-zinc-100", p.name || "Platform"));
      ul.appendChild(li);
    }
    group.appendChild(ul);
    return group;
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const root = document.getElementById("title-page-root");
    if (!root) return;

    const params = new URLSearchParams(window.location.search);
    const id = (params.get("id") || "").trim();
    const type = (params.get("type") || "").trim();

    if (!/^[1-9]\d{0,9}$/.test(id) || (type !== "movie" && type !== "tv")) {
      showError(
        "Invalid title link",
        "This page requires a valid movie or web series link. Try searching for the title instead."
      );
      return;
    }

    try {
      const [apiRes, reviewsIndex] = await Promise.all([
        fetch(`/api/title?id=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}`),
        fetch("/assets/reviews-index.json")
          .then((r) => (r.ok ? r.json() : {}))
          .catch(() => ({})),
      ]);

      const payload = await apiRes.json().catch(() => ({}));
      if (!apiRes.ok || !payload.title) {
        showError(
          apiRes.status === 503 ? "TMDB details unavailable" : "Title not found",
          payload.error || "Could not load details for this title right now."
        );
        return;
      }

      const item = payload.title;
      const formatLabel = item.type === "tv" ? "Web Series" : "Movie";
      document.title = item.year
        ? `${item.title} (${item.year}) | Moview`
        : `${item.title} | Moview`;

      // Editorial review banner if already reviewed
      const existingReview = reviewsIndex[`${item.type}:${item.id}`];
      const banner = document.getElementById("title-reviewed-banner");
      if (existingReview && banner) {
        const metaEl = document.getElementById("title-reviewed-meta");
        const linkEl = document.getElementById("title-reviewed-link");
        if (metaEl) {
          metaEl.textContent = `${Number(existingReview.rating).toFixed(1)}/10 · ${existingReview.verdict}`;
        }
        if (linkEl && isSafeHttpUrl(existingReview.url)) {
          linkEl.href = existingReview.url;
        }
        banner.classList.remove("hidden");
      }

      // Breadcrumb & hero text
      const crumb = document.getElementById("title-breadcrumb-name");
      if (crumb) crumb.textContent = item.title;

      const backdrop = document.getElementById("title-backdrop");
      if (backdrop && isSafeHttpUrl(item.backdropUrl)) {
        backdrop.src = item.backdropUrl;
        backdrop.alt = `${item.title} backdrop`;
        backdrop.classList.remove("hidden");
        backdrop.addEventListener("error", () => {
          backdrop.classList.add("hidden");
        });
      }

      const posterImg = document.getElementById("title-poster");
      const posterFallback = document.getElementById("title-poster-fallback");
      const posterType = document.getElementById("title-poster-type");
      const posterTitle = document.getElementById("title-poster-title");
      const posterYear = document.getElementById("title-poster-year");
      if (posterType) posterType.textContent = formatLabel;
      if (posterTitle) posterTitle.textContent = item.title;
      if (posterYear) posterYear.textContent = item.year || "";

      if (posterImg && isSafeHttpUrl(item.posterUrl)) {
        posterImg.src = item.posterUrl;
        posterImg.alt = `${item.title} poster`;
        posterImg.classList.remove("hidden");
        if (posterFallback) posterFallback.classList.add("hidden");
        posterImg.addEventListener("error", () => {
          posterImg.classList.add("hidden");
          if (posterFallback) {
            posterFallback.classList.remove("hidden");
            posterFallback.classList.add("flex");
          }
        });
      }

      const metaRow = document.getElementById("title-meta-row");
      if (metaRow) {
        const parts = [formatLabel];
        if (item.year) parts.push(item.year);
        if (item.type === "movie" && item.runtime) {
          const rt = formatRuntime(item.runtime);
          if (rt) parts.push(rt);
        } else if (item.type === "tv" && item.numberOfSeasons) {
          parts.push(`${item.numberOfSeasons} ${item.numberOfSeasons === 1 ? "Season" : "Seasons"}`);
        }
        parts.forEach((p, idx) => {
          if (idx > 0) {
            const sep = el("span", "", "\u00B7");
            sep.setAttribute("aria-hidden", "true");
            metaRow.appendChild(sep);
          }
          metaRow.appendChild(el("span", "", p));
        });
      }

      const heading = document.getElementById("title-heading");
      if (heading) heading.textContent = item.title;

      const tagline = document.getElementById("title-tagline");
      if (tagline && item.tagline) {
        tagline.textContent = item.tagline;
        tagline.classList.remove("hidden");
      }

      const overviewHero = document.getElementById("title-overview-hero");
      if (overviewHero) {
        overviewHero.textContent = item.overview || "Synopsis not available yet.";
      }

      // Credits & Genres
      const creditsDl = document.getElementById("title-credits-dl");
      if (creditsDl) {
        if (item.directorOrCreator) {
          const block = el("div");
          block.appendChild(el("dt", "text-xs text-zinc-400", item.type === "tv" ? "Creator" : "Director"));
          block.appendChild(el("dd", "mt-0.5 font-medium text-zinc-100", item.directorOrCreator));
          creditsDl.appendChild(block);
        }
        if (Array.isArray(item.genres) && item.genres.length > 0) {
          const block = el("div");
          block.appendChild(el("dt", "text-xs text-zinc-400", "Genres"));
          block.appendChild(el("dd", "mt-0.5 font-medium text-zinc-100", item.genres.join(", ")));
          creditsDl.appendChild(block);
        }
        if (item.releaseDate) {
          const block = el("div");
          block.appendChild(el("dt", "text-xs text-zinc-400", item.type === "tv" ? "First aired" : "Release date"));
          block.appendChild(el("dd", "mt-0.5 font-medium text-zinc-100 tabular-nums", item.releaseDate));
          creditsDl.appendChild(block);
        }
      }

      // Trailer lite embed
      const trailerSection = document.getElementById("title-trailer-section");
      const trailerContainer = document.getElementById("title-youtube-lite");
      const trailerThumb = document.getElementById("title-trailer-thumb");
      const trailerPlay = document.getElementById("title-trailer-play");
      if (trailerSection && trailerContainer && trailerThumb && trailerPlay && item.trailerKey) {
        trailerSection.classList.remove("hidden");
        trailerThumb.src = `https://i.ytimg.com/vi/${encodeURIComponent(item.trailerKey)}/hqdefault.jpg`;
        trailerThumb.alt = `${item.title} trailer thumbnail`;
        trailerPlay.setAttribute("aria-label", `Play ${item.title} official trailer`);
        trailerPlay.addEventListener("click", () => {
          const iframe = document.createElement("iframe");
          iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(item.trailerKey)}?autoplay=1&rel=0`;
          iframe.title = `${item.title} Official Trailer`;
          iframe.allow =
            "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
          iframe.allowFullscreen = true;
          iframe.className = "absolute inset-0 h-full w-full border-0";
          trailerContainer.replaceChildren(iframe);
        });
      }

      // Top 8 Cast
      const castSection = document.getElementById("title-cast-section");
      const castGrid = document.getElementById("title-cast-grid");
      if (castSection && castGrid && Array.isArray(item.cast) && item.cast.length > 0) {
        castSection.classList.remove("hidden");
        for (const actor of item.cast) {
          const card = el("div", "overflow-hidden rounded-lg border border-white/10 bg-[#181A20]");
          const media = el("div", "aspect-[4/5] w-full overflow-hidden bg-[#13151B]");
          const fallback = el("div", "poster-fallback flex h-full w-full items-center justify-center p-3 text-center text-xs text-zinc-400", actor.name);

          if (isSafeHttpUrl(actor.profileUrl)) {
            const img = el("img", "h-full w-full object-cover");
            img.src = actor.profileUrl;
            img.alt = actor.name;
            img.loading = "lazy";
            img.decoding = "async";
            img.referrerPolicy = "no-referrer";
            fallback.classList.add("hidden");
            fallback.classList.remove("flex");
            img.addEventListener("error", () => {
              img.style.display = "none";
              fallback.classList.remove("hidden");
              fallback.classList.add("flex");
            });
            media.appendChild(img);
          }
          media.appendChild(fallback);
          card.appendChild(media);

          const body = el("div", "p-3");
          body.appendChild(el("p", "text-sm font-semibold text-[#F5F5F5] leading-snug", actor.name));
          if (actor.character) {
            body.appendChild(el("p", "mt-0.5 text-xs text-zinc-400 leading-snug", actor.character));
          }
          card.appendChild(body);
          castGrid.appendChild(card);
        }
      }

      // India Watch Providers
      const providersBody = document.getElementById("title-providers-body");
      if (providersBody) {
        const wp = item.watchProvidersIN;
        if (wp && wp.hasAny) {
          if (Array.isArray(wp.flatrate) && wp.flatrate.length > 0) {
            providersBody.appendChild(renderProvidersGroup("Stream", wp.flatrate));
          }
          if (Array.isArray(wp.rent) && wp.rent.length > 0) {
            providersBody.appendChild(renderProvidersGroup("Rent", wp.rent));
          }
          if (Array.isArray(wp.buy) && wp.buy.length > 0) {
            providersBody.appendChild(renderProvidersGroup("Buy", wp.buy));
          }
        } else {
          providersBody.appendChild(el("p", "text-sm text-zinc-300", "Not available on OTT in India yet."));
        }
      }

      // Bind TMDB metadata for community.js (Watchlist, Viewer Reviews, Request a Review)
      const wlPicker = document.getElementById("title-watchlist-picker");
      const viewerSection = document.getElementById("viewer-reviews");
      [wlPicker, viewerSection].forEach((node) => {
        if (!node) return;
        node.setAttribute("data-tmdb-id", item.id);
        node.setAttribute("data-media-type", item.type);
        node.setAttribute("data-title", item.title);
        node.setAttribute("data-poster-path", item.posterPath || "");
      });

      const titleContext = {
        tmdbId: Number(item.id),
        mediaType: item.type,
        title: item.title,
        posterPath: item.posterPath || "",
      };
      window.__MOVIEW_TITLE_CONTEXT__ = titleContext;

      document.getElementById("title-loading")?.classList.add("hidden");
      document.getElementById("title-content")?.classList.remove("hidden");

      if (window.MoviewCommunity && typeof window.MoviewCommunity.refreshTitleContext === "function") {
        await window.MoviewCommunity.refreshTitleContext(titleContext);
      } else {
        window.dispatchEvent(new CustomEvent("moview:title-ready", { detail: titleContext }));
      }
    } catch {
      showError(
        "Network error",
        "Could not load details for this title right now. Please try again."
      );
    }
  });
})();
