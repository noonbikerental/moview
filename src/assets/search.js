(() => {
  "use strict";

  const POSTER_PATH_RE = /^\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i;
  let reviewsIndexPromise = null;
  let pagefindPromise = null;

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

  function safeTmdbPoster(posterPath) {
    if (!posterPath || typeof posterPath !== "string") return null;
    const trimmed = posterPath.trim();
    if (!POSTER_PATH_RE.test(trimmed)) return null;
    return `https://image.tmdb.org/t/p/w342${trimmed}`;
  }

  function safeExcerptNode(rawExcerpt) {
    const p = el("p", "mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-400");
    const str = String(rawExcerpt || "");
    if (!str) return p;

    const parts = str.split(/(<mark>[\s\S]*?<\/mark>)/gi);
    for (const part of parts) {
      if (!part) continue;
      const markMatch = part.match(/^<mark>([\s\S]*?)<\/mark>$/i);
      if (markMatch) {
        const cleanText = markMatch[1].replace(/<[^>]*>/g, "");
        p.appendChild(el("mark", "rounded bg-[#E50914]/25 px-0.5 text-white", cleanText));
      } else {
        const cleanText = part.replace(/<[^>]*>/g, "");
        p.appendChild(document.createTextNode(cleanText));
      }
    }
    return p;
  }

  async function loadReviewsIndex() {
    if (!reviewsIndexPromise) {
      reviewsIndexPromise = fetch("/assets/reviews-index.json")
        .then((res) => (res.ok ? res.json() : {}))
        .catch(() => ({}));
    }
    return reviewsIndexPromise;
  }

  async function loadPagefind() {
    if (!pagefindPromise) {
      pagefindPromise = import("/pagefind/pagefind.js")
        .then(async (pf) => {
          if (pf && typeof pf.init === "function") {
            await pf.init();
          }
          return pf;
        })
        .catch(() => null);
    }
    return pagefindPromise;
  }

  function buildPosterThumb(posterUrl, title, formatLabel) {
    const box = el("div", "h-16 w-11 shrink-0 overflow-hidden rounded border border-white/10 bg-[#13151B]");
    if (isSafeHttpUrl(posterUrl)) {
      const img = el("img", "h-full w-full object-cover");
      img.src = posterUrl;
      img.alt = `${title} poster`;
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";

      const fallback = el("div", "poster-fallback hidden h-full w-full items-center justify-center p-1 text-center text-[10px] font-medium text-zinc-400", formatLabel);
      img.addEventListener("error", () => {
        img.style.display = "none";
        fallback.classList.remove("hidden");
        fallback.classList.add("flex");
      });
      box.appendChild(img);
      box.appendChild(fallback);
    } else {
      const fallback = el("div", "poster-fallback flex h-full w-full items-center justify-center p-1 text-center text-[10px] font-medium text-zinc-400", formatLabel);
      box.appendChild(fallback);
    }
    return box;
  }

  function buildPagefindResultCard(item) {
    const meta = item.meta || {};
    const title = meta.title || "Moview Review";
    const year = meta.year || "";
    const verdict = meta.verdict || "";
    const mediaType = meta.media_type || "";
    const posterUrl = meta.poster || "";

    const link = el(
      "a",
      "group flex items-start gap-3.5 rounded-lg border border-white/10 bg-[#0E0F13] p-3 transition-colors hover:border-white/30 hover:bg-[#20232B] focus:outline-none"
    );
    link.href = isSafeHttpUrl(item.url) ? item.url : "/reviews/";
    link.setAttribute("data-search-result", "true");

    link.appendChild(buildPosterThumb(posterUrl, title, mediaType || "Review"));

    const body = el("div", "min-w-0 flex-1");
    const topRow = el("div", "flex flex-wrap items-center gap-2");
    topRow.appendChild(el("span", "font-display text-sm font-semibold text-[#F5F5F5] group-hover:text-white truncate", title));
    if (year) {
      topRow.appendChild(el("span", "text-xs text-zinc-400 tabular-nums", year));
    }
    if (verdict) {
      topRow.appendChild(el("span", "text-xs font-medium text-[#E50914]", `\u00B7 ${verdict}`));
    }
    body.appendChild(topRow);
    body.appendChild(safeExcerptNode(item.excerpt));
    link.appendChild(body);
    return link;
  }

  function buildTmdbResultCard(item, reviewsIndex) {
    const key = `${item.media_type}:${item.id}`;
    const existing = reviewsIndex[key] || null;
    const formatLabel = item.media_type === "tv" ? "Web Series" : "Movie";
    const targetUrl = existing ? existing.url : `/title/?id=${encodeURIComponent(item.id)}&type=${encodeURIComponent(item.media_type)}`;
    const posterUrl = safeTmdbPoster(item.poster_path) || existing?.posterUrl || null;

    const link = el(
      "a",
      "group flex items-center gap-3.5 rounded-lg border border-white/10 bg-[#0E0F13] p-3 transition-colors hover:border-white/30 hover:bg-[#20232B] focus:outline-none"
    );
    link.href = targetUrl;
    link.setAttribute("data-search-result", "true");

    link.appendChild(buildPosterThumb(posterUrl, item.title, formatLabel));

    const body = el("div", "min-w-0 flex-1");
    body.appendChild(el("p", "font-display text-sm font-semibold text-[#F5F5F5] group-hover:text-white truncate", item.title));

    const sub = el("div", "mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-400 tabular-nums");
    if (item.year) {
      sub.appendChild(el("span", "", item.year));
      sub.appendChild(el("span", "", "\u00B7"));
    }
    sub.appendChild(el("span", "", formatLabel));
    if (existing) {
      sub.appendChild(el("span", "", "\u00B7"));
      sub.appendChild(
        el(
          "span",
          "font-medium text-emerald-300",
          existing.rating ? `Moview Review (\u2605 ${Number(existing.rating).toFixed(1)})` : "Moview Review"
        )
      );
    } else {
      sub.appendChild(el("span", "", "\u00B7"));
      sub.appendChild(el("span", "text-zinc-400", "Details & Community"));
    }
    body.appendChild(sub);
    link.appendChild(body);
    return link;
  }

  function createSearchController({
    inputEl,
    hintEl,
    reviewsSection,
    reviewsList,
    tmdbSection,
    tmdbList,
    fullSearchLink,
    onNavigateFallback,
  }) {
    let debounceTimer = null;
    let activeAbort = null;
    let activeIndex = -1;
    let searchSeq = 0;

    function getResultNodes() {
      const nodes = [];
      if (reviewsList) nodes.push(...reviewsList.querySelectorAll("[data-search-result]"));
      if (tmdbList) nodes.push(...tmdbList.querySelectorAll("[data-search-result]"));
      return nodes;
    }

    function paintSelection(nextIndex) {
      const nodes = getResultNodes();
      if (nodes.length === 0) {
        activeIndex = -1;
        return;
      }
      if (nextIndex < 0) nextIndex = nodes.length - 1;
      if (nextIndex >= nodes.length) nextIndex = 0;
      activeIndex = nextIndex;

      nodes.forEach((node, idx) => {
        const selected = idx === activeIndex;
        node.setAttribute("aria-selected", String(selected));
        node.classList.toggle("border-[#E50914]", selected);
        node.classList.toggle("bg-[#20232B]", selected);
        if (selected) {
          node.scrollIntoView({ block: "nearest" });
        }
      });
    }

    async function runPagefind(query, seq) {
      if (!reviewsSection || !reviewsList) return;
      const pf = await loadPagefind();
      if (seq !== searchSeq) return;

      if (!pf) {
        reviewsSection.classList.add("hidden");
        return;
      }

      const search = await pf.search(query);
      if (seq !== searchSeq) return;

      const slice = (search?.results || []).slice(0, 6);
      const dataList = await Promise.all(slice.map((r) => r.data()));
      if (seq !== searchSeq) return;

      reviewsList.replaceChildren();
      reviewsSection.classList.remove("hidden");

      if (dataList.length === 0) {
        reviewsList.appendChild(
          el("p", "rounded-md border border-white/10 bg-[#0E0F13] p-3 text-xs text-zinc-400", "No matching Moview editorial reviews or lists.")
        );
      } else {
        for (const item of dataList) {
          reviewsList.appendChild(buildPagefindResultCard(item));
        }
      }
      activeIndex = -1;
    }

    async function runTmdbSearch(query, seq) {
      if (!tmdbSection || !tmdbList) return;
      if (activeAbort) activeAbort.abort();
      activeAbort = new AbortController();

      tmdbSection.classList.remove("hidden");
      tmdbList.replaceChildren(
        el("p", "text-xs text-zinc-400", "Searching movies and web series...")
      );

      try {
        const [res, reviewsIndex] = await Promise.all([
          fetch(`/api/search?q=${encodeURIComponent(query)}`, {
            signal: activeAbort.signal,
          }),
          loadReviewsIndex(),
        ]);

        if (seq !== searchSeq) return;
        const payload = await res.json().catch(() => ({}));
        if (seq !== searchSeq) return;

        tmdbList.replaceChildren();

        if (!res.ok) {
          tmdbList.appendChild(
            el(
              "p",
              "rounded-md border border-white/10 bg-[#0E0F13] p-3 text-xs text-zinc-400",
              payload.error || "Catalog search is currently unavailable."
            )
          );
          return;
        }

        const results = Array.isArray(payload.results) ? payload.results : [];
        if (results.length === 0) {
          tmdbList.appendChild(
            el("p", "rounded-md border border-white/10 bg-[#0E0F13] p-3 text-xs text-zinc-400", "No matching movies or series found.")
          );
          return;
        }

        for (const item of results) {
          tmdbList.appendChild(buildTmdbResultCard(item, reviewsIndex));
        }
        activeIndex = -1;
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (seq !== searchSeq) return;
        tmdbList.replaceChildren(
          el("p", "rounded-md border border-white/10 bg-[#0E0F13] p-3 text-xs text-zinc-400", "Could not search catalog right now.")
        );
      }
    }

    function executeSearch(rawVal, immediateTmdb = false) {
      const query = String(rawVal || "").trim();
      searchSeq += 1;
      const seq = searchSeq;

      if (fullSearchLink) {
        fullSearchLink.href = query.length > 0 ? `/search/?q=${encodeURIComponent(query)}` : "/search/";
      }

      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }

      if (query.length < 2) {
        if (activeAbort) activeAbort.abort();
        if (hintEl) hintEl.classList.remove("hidden");
        if (reviewsSection) reviewsSection.classList.add("hidden");
        if (tmdbSection) tmdbSection.classList.add("hidden");
        if (reviewsList) reviewsList.replaceChildren();
        if (tmdbList) tmdbList.replaceChildren();
        activeIndex = -1;
        return;
      }

      if (hintEl) hintEl.classList.add("hidden");
      runPagefind(query, seq);

      if (immediateTmdb) {
        runTmdbSearch(query, seq);
      } else {
        if (tmdbSection && tmdbList) {
          tmdbSection.classList.remove("hidden");
          tmdbList.replaceChildren(el("p", "text-xs text-zinc-400", "Waiting to search catalog..."));
        }
        debounceTimer = setTimeout(() => {
          runTmdbSearch(query, seq);
        }, 400);
      }
    }

    if (inputEl) {
      inputEl.addEventListener("input", () => {
        executeSearch(inputEl.value, false);
      });

      inputEl.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          paintSelection(activeIndex + 1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          paintSelection(activeIndex - 1);
        } else if (event.key === "Enter") {
          const nodes = getResultNodes();
          if (activeIndex >= 0 && nodes[activeIndex]) {
            event.preventDefault();
            window.location.href = nodes[activeIndex].href;
          } else if (typeof onNavigateFallback === "function") {
            const q = inputEl.value.trim();
            if (q.length >= 2) {
              event.preventDefault();
              onNavigateFallback(q);
            }
          }
        }
      });
    }

    return {
      executeSearch,
      resetSelection: () => {
        activeIndex = -1;
      },
    };
  }

  document.addEventListener("DOMContentLoaded", () => {
    // 1. Header Search Overlay Modal
    const modal = document.getElementById("moview-search-modal");
    const modalInput = document.getElementById("search-modal-input");
    const modalFullLink = document.getElementById("search-modal-full-link");

    let modalController = null;
    if (modal && modalInput) {
      modalController = createSearchController({
        inputEl: modalInput,
        hintEl: document.getElementById("search-modal-hint"),
        reviewsSection: document.getElementById("search-modal-reviews-section"),
        reviewsList: document.getElementById("search-modal-reviews-list"),
        tmdbSection: document.getElementById("search-modal-tmdb-section"),
        tmdbList: document.getElementById("search-modal-tmdb-list"),
        fullSearchLink: modalFullLink,
        onNavigateFallback: (q) => {
          window.location.href = `/search/?q=${encodeURIComponent(q)}`;
        },
      });

      const openSearchModal = () => {
        modal.classList.remove("hidden");
        modalInput.focus();
        modalInput.select();
      };

      const closeSearchModal = () => {
        modal.classList.add("hidden");
      };

      document.querySelectorAll("[data-search-open]").forEach((btn) => {
        btn.addEventListener("click", openSearchModal);
      });

      modal.addEventListener("click", (event) => {
        if (event.target === modal) closeSearchModal();
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !modal.classList.contains("hidden")) {
          closeSearchModal();
          return;
        }
        const tag = (document.activeElement?.tagName || "").toLowerCase();
        const isEditable =
          tag === "input" ||
          tag === "textarea" ||
          tag === "select" ||
          document.activeElement?.isContentEditable;

        if (!isEditable && event.key === "/") {
          event.preventDefault();
          openSearchModal();
        } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          openSearchModal();
        }
      });
    }

    // 2. Dedicated /search/ Page
    const searchPageRoot = document.getElementById("moview-search-page");
    const pageInput = document.getElementById("search-page-input");
    const pageForm = document.getElementById("search-page-form");

    if (searchPageRoot && pageInput) {
      const pageController = createSearchController({
        inputEl: pageInput,
        hintEl: document.getElementById("search-page-hint"),
        reviewsSection: document.getElementById("search-page-reviews-section"),
        reviewsList: document.getElementById("search-page-reviews-list"),
        tmdbSection: document.getElementById("search-page-tmdb-section"),
        tmdbList: document.getElementById("search-page-tmdb-list"),
        fullSearchLink: null,
        onNavigateFallback: null,
      });

      const syncUrlQuery = (q) => {
        const url = new URL(window.location.href);
        if (q) {
          url.searchParams.set("q", q);
        } else {
          url.searchParams.delete("q");
        }
        window.history.replaceState({}, "", url.toString());
      };

      pageInput.addEventListener("input", () => {
        syncUrlQuery(pageInput.value.trim());
      });

      if (pageForm) {
        pageForm.addEventListener("submit", (event) => {
          event.preventDefault();
          const q = pageInput.value.trim();
          syncUrlQuery(q);
          pageController.executeSearch(q, true);
        });
      }

      const initialQ = new URLSearchParams(window.location.search).get("q") || "";
      if (initialQ.trim()) {
        pageInput.value = initialQ.trim();
        pageController.executeSearch(initialQ.trim(), true);
      }
      pageInput.focus();
    }
  });
})();
