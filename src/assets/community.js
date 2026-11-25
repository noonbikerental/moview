(() => {
  "use strict";

  const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
  const POSTER_PATH_RE = /^\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i;
  const WATCHLIST_LABELS = {
    watched: "\u2705 Watched",
    want_to_watch: "\uD83D\uDCCC Want to Watch",
    maybe_later: "\uD83E\uDD14 Maybe Later",
  };

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

  function safePosterUrl(posterPath) {
    if (!posterPath || typeof posterPath !== "string") return null;
    const trimmed = posterPath.trim();
    if (!POSTER_PATH_RE.test(trimmed)) return null;
    return `https://image.tmdb.org/t/p/w342${trimmed}`;
  }

  function formatDisplayDate(isoStr) {
    if (!isoStr) return "";
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(d);
  }

  function renderStarString(rating) {
    const clamped = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    return "\u2605".repeat(clamped) + "\u2606".repeat(5 - clamped);
  }

  function readConfig() {
    const cfgEl = document.getElementById("moview-supabase-config");
    if (!cfgEl) return { configured: false, url: "", anonKey: "" };
    try {
      return JSON.parse(cfgEl.textContent || "{}");
    } catch {
      return { configured: false, url: "", anonKey: "" };
    }
  }

  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove("hidden");
    const firstInput = modal.querySelector("input, textarea, button[data-google-signin]");
    if (firstInput) firstInput.focus();
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add("hidden");
  }

  function createAvatarNode(avatarUrl, label, sizeClass = "h-8 w-8 text-xs") {
    const wrapper = el("div", `${sizeClass} shrink-0 overflow-hidden rounded-full border border-white/15 bg-[#E50914] flex items-center justify-center font-semibold text-white`);
    const initial = (String(label || "M").trim().charAt(0) || "M").toUpperCase();
    if (isSafeHttpUrl(avatarUrl)) {
      const img = el("img", "h-full w-full object-cover");
      img.src = avatarUrl;
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => {
        wrapper.replaceChildren(document.createTextNode(initial));
      });
      wrapper.appendChild(img);
    } else {
      wrapper.textContent = initial;
    }
    return wrapper;
  }

  function buildPosterCard({ tmdbId, mediaType, title, posterPath, actionsNode }) {
    const card = el("article", "flex flex-col overflow-hidden rounded-lg border border-white/10 bg-[#181A20]");
    const mediaBox = el("div", "relative aspect-[2/3] w-full overflow-hidden bg-[#13151B]");
    const imgUrl = safePosterUrl(posterPath);
    const typeLabel = mediaType === "tv" ? "Web Series" : "Movie";

    const fallback = el("div", "poster-fallback flex h-full w-full flex-col justify-between p-3");
    fallback.appendChild(el("span", "text-[11px] text-zinc-400", typeLabel));
    fallback.appendChild(el("p", "font-display text-sm font-semibold text-white leading-snug", title));

    if (imgUrl) {
      const img = el("img", "h-full w-full object-cover");
      img.src = imgUrl;
      img.alt = `${title} poster`;
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
      mediaBox.appendChild(img);
    }
    mediaBox.appendChild(fallback);
    card.appendChild(mediaBox);

    const body = el("div", "flex flex-1 flex-col p-3");
    body.appendChild(el("h3", "font-display text-sm font-semibold text-[#F5F5F5] leading-snug line-clamp-2", title));
    body.appendChild(el("p", "mt-1 text-[11px] text-zinc-400", typeLabel));
    if (actionsNode) {
      body.appendChild(actionsNode);
    }
    card.appendChild(body);
    return card;
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const config = readConfig();
    const state = {
      supabase: null,
      user: null,
      profile: null,
      watchlistMap: new Map(), // key: `${media_type}:${tmdb_id}` -> status
      reviewOffset: 0,
      reviewSort: "helpful",
      selectedRating: 0,
      myReviewId: null,
      hasMoreReviews: false,
    };

    // Modal close handlers
    document.querySelectorAll("[data-close-modal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        closeModal(btn.getAttribute("data-close-modal"));
      });
    });

    ["moview-signin-modal", "moview-report-modal"].forEach((id) => {
      const modal = document.getElementById(id);
      if (!modal) return;
      modal.addEventListener("click", (event) => {
        if (event.target === modal) closeModal(id);
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeModal("moview-signin-modal");
        closeModal("moview-report-modal");
        const dropdown = document.getElementById("header-user-dropdown");
        const avatarBtn = document.getElementById("header-avatar-btn");
        if (dropdown && !dropdown.classList.contains("hidden")) {
          dropdown.classList.add("hidden");
          if (avatarBtn) avatarBtn.setAttribute("aria-expanded", "false");
        }
      }
    });

    // Sign-in modal trigger buttons
    document.querySelectorAll("[data-auth-signin-trigger]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!config.configured || !state.supabase) {
          window.location.href = "/sign-in/";
          return;
        }
        openModal("moview-signin-modal");
      });
    });

    // Avatar dropdown toggle
    const avatarBtn = document.getElementById("header-avatar-btn");
    const userDropdown = document.getElementById("header-user-dropdown");
    if (avatarBtn && userDropdown) {
      avatarBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = !userDropdown.classList.contains("hidden");
        userDropdown.classList.toggle("hidden", isOpen);
        avatarBtn.setAttribute("aria-expanded", String(!isOpen));
      });
      document.addEventListener("click", (e) => {
        if (!userDropdown.contains(e.target) && !avatarBtn.contains(e.target)) {
          userDropdown.classList.add("hidden");
          avatarBtn.setAttribute("aria-expanded", "false");
        }
      });
    }

    // Initialize Supabase if configured
    if (config.configured && window.supabase && typeof window.supabase.createClient === "function") {
      state.supabase = window.supabase.createClient(config.url, config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    }

    function updateHeaderUi() {
      const signInTriggers = document.querySelectorAll("header [data-auth-signin-trigger]");
      const menuWrap = document.getElementById("header-user-menu-wrap");
      const avatarImg = document.getElementById("header-avatar-img");
      const avatarFallback = document.getElementById("header-avatar-fallback");
      const avatarName = document.getElementById("header-avatar-name");
      const profileLink = document.getElementById("header-profile-link");
      const adminLink = document.getElementById("header-admin-link");

      if (state.user) {
        signInTriggers.forEach((b) => b.classList.add("hidden"));
        if (menuWrap) menuWrap.classList.remove("hidden");

        const display =
          state.profile?.display_name ||
          state.profile?.username ||
          state.user.email?.split("@")[0] ||
          "Reader";

        if (avatarName) avatarName.textContent = state.profile?.username ? `@${state.profile.username}` : display;
        if (avatarFallback) avatarFallback.textContent = display.charAt(0).toUpperCase();

        if (avatarImg && isSafeHttpUrl(state.profile?.avatar_url)) {
          avatarImg.src = state.profile.avatar_url;
          avatarImg.alt = display;
          avatarImg.classList.remove("hidden");
          if (avatarFallback) avatarFallback.classList.add("hidden");
        } else if (avatarImg) {
          avatarImg.classList.add("hidden");
          if (avatarFallback) avatarFallback.classList.remove("hidden");
        }

        if (profileLink) {
          profileLink.href = state.profile?.username
            ? `/u/?name=${encodeURIComponent(state.profile.username)}`
            : "/settings/";
        }
        if (adminLink) {
          adminLink.classList.toggle("hidden", !state.profile?.is_admin);
        }
      } else {
        signInTriggers.forEach((b) => b.classList.remove("hidden"));
        if (menuWrap) menuWrap.classList.add("hidden");
      }
    }

    async function loadCurrentProfileAndWatchlist() {
      if (!state.supabase || !state.user) {
        state.profile = null;
        state.watchlistMap.clear();
        return;
      }

      const { data: profile } = await state.supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, bio, is_admin")
        .eq("id", state.user.id)
        .maybeSingle();

      state.profile = profile || null;

      if (state.profile && !state.profile.username) {
        openModal("moview-username-modal");
      } else {
        closeModal("moview-username-modal");
      }

      const { data: rows } = await state.supabase
        .from("watchlist")
        .select("tmdb_id, media_type, status")
        .eq("user_id", state.user.id);

      state.watchlistMap.clear();
      for (const row of rows || []) {
        state.watchlistMap.set(`${row.media_type}:${row.tmdb_id}`, row.status);
      }
    }

    function syncWatchlistPickers() {
      document.querySelectorAll("[data-watchlist-picker]").forEach((picker) => {
        const tmdbId = picker.getAttribute("data-tmdb-id");
        const mediaType = picker.getAttribute("data-media-type") || "movie";
        const activeStatus = state.watchlistMap.get(`${mediaType}:${tmdbId}`) || "";

        picker.querySelectorAll("[data-watchlist-status]").forEach((btn) => {
          const btnStatus = btn.getAttribute("data-watchlist-status");
          const isActive = btnStatus === activeStatus;
          btn.setAttribute("aria-pressed", String(isActive));
          btn.classList.toggle("border-[#E50914]", isActive);
          btn.classList.toggle("bg-[#E50914]/20", isActive);
          btn.classList.toggle("text-white", isActive);
          btn.classList.toggle("border-white/15", !isActive);
          btn.classList.toggle("border-white/10", !isActive);
        });
      });
    }

    // Wire watchlist picker clicks across cards & review detail page
    document.querySelectorAll("[data-watchlist-picker]").forEach((picker) => {
      picker.querySelectorAll("[data-watchlist-status]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!state.supabase) {
            window.location.href = "/sign-in/";
            return;
          }
          if (!state.user) {
            openModal("moview-signin-modal");
            return;
          }

          const tmdbId = Number(picker.getAttribute("data-tmdb-id"));
          if (!Number.isInteger(tmdbId) || tmdbId <= 0) return;
          const mediaType = picker.getAttribute("data-media-type") || "movie";
          const title = (picker.getAttribute("data-title") || "Untitled").slice(0, 200);
          const posterPath = picker.getAttribute("data-poster-path") || null;
          const clickedStatus = btn.getAttribute("data-watchlist-status");
          const key = `${mediaType}:${tmdbId}`;
          const currentStatus = state.watchlistMap.get(key);

          if (currentStatus === clickedStatus) {
            // One tap on active status removes it
            const { error } = await state.supabase
              .from("watchlist")
              .delete()
              .eq("user_id", state.user.id)
              .eq("tmdb_id", tmdbId)
              .eq("media_type", mediaType);
            if (!error) {
              state.watchlistMap.delete(key);
              syncWatchlistPickers();
            }
          } else {
            const { error } = await state.supabase
              .from("watchlist")
              .upsert(
                {
                  user_id: state.user.id,
                  tmdb_id: tmdbId,
                  media_type: mediaType,
                  status: clickedStatus,
                  title,
                  poster_path: posterPath || null,
                },
                { onConflict: "user_id,tmdb_id,media_type" }
              );
            if (!error) {
              state.watchlistMap.set(key, clickedStatus);
              syncWatchlistPickers();
            }
          }
        });
      });
    });

    // Google OAuth buttons
    document.querySelectorAll("[data-google-signin]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!state.supabase) {
          alertNoticeForForms("Supabase is not configured yet. Add SUPABASE_URL and SUPABASE_ANON_KEY.");
          return;
        }
        const redirectTo = window.location.pathname === "/sign-in/"
          ? `${window.location.origin}/my-watchlist/`
          : window.location.href;
        await state.supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo },
        });
      });
    });

    function alertNoticeForForms(msg) {
      document.querySelectorAll("[data-magic-link-status]").forEach((elNode) => {
        elNode.textContent = msg;
        elNode.className = "text-xs text-amber-300";
      });
    }

    // Email Magic Link forms (modal + /sign-in/)
    document.querySelectorAll("[data-magic-link-form]").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const statusEl = form.querySelector("[data-magic-link-status]");
        const emailInput = form.querySelector('input[name="email"]');
        const email = (emailInput?.value || "").trim();

        if (!state.supabase) {
          if (statusEl) {
            statusEl.textContent = "Supabase is not configured yet. Follow SUPABASE_SETUP.md to add your URL and anon key.";
            statusEl.className = "text-xs text-amber-300";
          }
          return;
        }

        if (!email) return;
        if (statusEl) {
          statusEl.textContent = "Sending magic link...";
          statusEl.className = "text-xs text-zinc-300";
        }

        const redirectTo = window.location.pathname === "/sign-in/"
          ? `${window.location.origin}/my-watchlist/`
          : window.location.href;

        const { error } = await state.supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo },
        });

        if (statusEl) {
          if (error) {
            statusEl.textContent = error.message || "Could not send magic link.";
            statusEl.className = "text-xs text-rose-300";
          } else {
            statusEl.textContent = "Check your inbox for your sign-in magic link.";
            statusEl.className = "text-xs text-emerald-300";
          }
        }
      });
    });

    // Sign out buttons
    document.querySelectorAll("[data-auth-signout]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!state.supabase) return;
        await state.supabase.auth.signOut();
        window.location.reload();
      });
    });

    // Username onboarding form
    const onboardingForm = document.getElementById("username-onboarding-form");
    if (onboardingForm) {
      onboardingForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!state.supabase || !state.user) return;
        const input = document.getElementById("onboarding-username-input");
        const statusEl = document.getElementById("username-onboarding-status");
        const username = (input?.value || "").trim();

        if (!USERNAME_RE.test(username)) {
          if (statusEl) {
            statusEl.textContent = "Username must be 3–20 characters using only letters, numbers, or underscores.";
            statusEl.className = "text-xs text-rose-300";
          }
          return;
        }

        const { error } = await state.supabase
          .from("profiles")
          .update({ username })
          .eq("id", state.user.id);

        if (error) {
          if (statusEl) {
            statusEl.textContent = error.code === "23505"
              ? "That username is already taken. Please try another."
              : (error.message || "Could not save username.");
            statusEl.className = "text-xs text-rose-300";
          }
          return;
        }

        await loadCurrentProfileAndWatchlist();
        updateHeaderUi();
        closeModal("moview-username-modal");
      });
    }

    // ------------------------------------------------------------------------
    // Page-Specific Initializers
    // ------------------------------------------------------------------------

    // A. /sign-in/ page state
    function syncSignInPage() {
      const signedInBox = document.getElementById("signin-page-signed-in");
      const formsBox = document.getElementById("signin-page-forms");
      const handleSpan = document.getElementById("signin-page-handle");
      if (!signedInBox || !formsBox) return;

      if (state.user) {
        signedInBox.classList.remove("hidden");
        formsBox.classList.add("hidden");
        if (handleSpan) {
          handleSpan.textContent = state.profile?.username
            ? ` as @${state.profile.username}`
            : "";
        }
      } else {
        signedInBox.classList.add("hidden");
        formsBox.classList.remove("hidden");
      }
    }

    // B. Review & Title Page: Viewer Rating & Reviews
    const viewerReviewsRoot = document.getElementById("viewer-reviews");
    async function initReviewPageCommunity() {
      if (!viewerReviewsRoot) return null;
      const tmdbId = Number(viewerReviewsRoot.getAttribute("data-tmdb-id"));
      if (!Number.isInteger(tmdbId) || tmdbId <= 0) return null;
      const mediaType = viewerReviewsRoot.getAttribute("data-media-type") || "movie";

      const avgScoreEl = document.getElementById("viewer-avg-score");
      const avgStarsEl = document.getElementById("viewer-avg-stars");
      const totalCountEl = document.getElementById("viewer-total-count");
      const signedOutBox = document.getElementById("rate-signed-out");
      const reviewForm = document.getElementById("viewer-review-form");
      const formHeading = document.getElementById("viewer-form-heading");
      const textArea = document.getElementById("viewer-review-text");
      const charCountEl = document.getElementById("viewer-review-charcount");
      const spoilerCheckbox = document.getElementById("viewer-review-spoilers");
      const deleteBtn = document.getElementById("viewer-review-delete-btn");
      const submitBtn = document.getElementById("viewer-review-submit-btn");
      const formStatus = document.getElementById("viewer-review-status");
      const reviewsList = document.getElementById("viewer-reviews-list");
      const loadMoreWrap = document.getElementById("viewer-reviews-load-more-wrap");
      const loadMoreBtn = document.getElementById("viewer-reviews-load-more");

      if (!state.supabase) {
        if (avgScoreEl) avgScoreEl.textContent = "--";
        if (totalCountEl) totalCountEl.textContent = "Community ratings will appear once Supabase is connected.";
        if (reviewsList) {
          reviewsList.replaceChildren(
            el("p", "text-sm text-zinc-400", "Viewer reviews are unavailable until Supabase is configured.")
          );
        }
        return null;
      }

      // Star input wiring
      function paintStarInput(val) {
        state.selectedRating = val;
        const label = document.getElementById("star-rating-label");
        document.querySelectorAll("#star-rating-input [data-star-value]").forEach((starBtn) => {
          const n = Number(starBtn.getAttribute("data-star-value"));
          const active = n <= val;
          starBtn.classList.toggle("text-amber-400", active);
          starBtn.classList.toggle("text-zinc-600", !active);
          starBtn.setAttribute("aria-pressed", String(n === val));
        });
        if (label) {
          label.textContent = val > 0 ? `${val} / 5` : "Select a rating";
        }
      }

      const alreadyWired = viewerReviewsRoot.getAttribute("data-community-wired") === "true";

      if (!alreadyWired) {
        document.querySelectorAll("#star-rating-input [data-star-value]").forEach((starBtn) => {
          starBtn.addEventListener("click", () => {
            paintStarInput(Number(starBtn.getAttribute("data-star-value")));
          });
        });

        if (textArea && charCountEl) {
          const updateCount = () => {
            charCountEl.textContent = `${textArea.value.length} / 2000`;
          };
          textArea.addEventListener("input", updateCount);
          updateCount();
        }
      }

      async function refreshSummaryAndOwnReview() {
        const { data: ratingsData } = await state.supabase
          .from("user_reviews")
          .select("rating")
          .eq("tmdb_id", tmdbId)
          .eq("media_type", mediaType)
          .eq("is_hidden", false);

        const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        let sum = 0;
        const total = (ratingsData || []).length;
        for (const r of ratingsData || []) {
          if (counts[r.rating] !== undefined) {
            counts[r.rating] += 1;
            sum += r.rating;
          }
        }

        if (total > 0) {
          const avg = (sum / total).toFixed(1);
          if (avgScoreEl) avgScoreEl.textContent = avg;
          if (avgStarsEl) avgStarsEl.textContent = renderStarString(sum / total);
          if (totalCountEl) totalCountEl.textContent = `${total} ${total === 1 ? "viewer rating" : "viewer ratings"}`;
        } else {
          if (avgScoreEl) avgScoreEl.textContent = "0.0";
          if (avgStarsEl) avgStarsEl.textContent = renderStarString(0);
          if (totalCountEl) totalCountEl.textContent = "No viewer ratings yet";
        }

        [5, 4, 3, 2, 1].forEach((star) => {
          const pct = total > 0 ? Math.round((counts[star] / total) * 100) : 0;
          const bar = document.querySelector(`[data-breakdown-bar="${star}"]`);
          const cnt = document.querySelector(`[data-breakdown-count="${star}"]`);
          if (bar) bar.style.width = `${pct}%`;
          if (cnt) cnt.textContent = String(counts[star]);
        });

        // Auth state for form
        if (state.user) {
          if (signedOutBox) signedOutBox.classList.add("hidden");
          if (reviewForm) reviewForm.classList.remove("hidden");

          const { data: own } = await state.supabase
            .from("user_reviews")
            .select("id, rating, review_text, has_spoilers")
            .eq("user_id", state.user.id)
            .eq("tmdb_id", tmdbId)
            .eq("media_type", mediaType)
            .maybeSingle();

          if (own) {
            state.myReviewId = own.id;
            paintStarInput(own.rating);
            if (textArea) textArea.value = own.review_text || "";
            if (charCountEl && textArea) charCountEl.textContent = `${textArea.value.length} / 2000`;
            if (spoilerCheckbox) spoilerCheckbox.checked = Boolean(own.has_spoilers);
            if (formHeading) formHeading.textContent = "Edit Your Review";
            if (submitBtn) submitBtn.textContent = "Update Review";
            if (deleteBtn) deleteBtn.classList.remove("hidden");
          } else {
            state.myReviewId = null;
            paintStarInput(0);
            if (textArea) textArea.value = "";
            if (charCountEl) charCountEl.textContent = "0 / 2000";
            if (spoilerCheckbox) spoilerCheckbox.checked = false;
            if (formHeading) formHeading.textContent = "Your Rating & Review";
            if (submitBtn) submitBtn.textContent = "Post Review";
            if (deleteBtn) deleteBtn.classList.add("hidden");
          }
        } else {
          if (signedOutBox) signedOutBox.classList.remove("hidden");
          if (reviewForm) reviewForm.classList.add("hidden");
        }
      }

      function buildReviewItemNode(item) {
        const card = el("article", "rounded-lg border border-white/10 bg-[#181A20] p-4 sm:p-5");

        const header = el("div", "flex flex-wrap items-center justify-between gap-3");
        const authorLeft = el("div", "flex items-center gap-3");

        const authorName = item.display_name || item.username || "Viewer";
        authorLeft.appendChild(createAvatarNode(item.avatar_url, authorName, "h-9 w-9 text-xs"));

        const metaCol = el("div");
        if (item.username) {
          const link = el("a", "text-sm font-semibold text-[#F5F5F5] hover:text-[#E50914]", `@${item.username}`);
          link.href = `/u/?name=${encodeURIComponent(item.username)}`;
          metaCol.appendChild(link);
        } else {
          metaCol.appendChild(el("span", "text-sm font-semibold text-[#F5F5F5]", authorName));
        }

        const subline = el("div", "flex items-center gap-2 text-xs text-zinc-400 tabular-nums");
        subline.appendChild(el("span", "text-amber-400", renderStarString(item.rating)));
        subline.appendChild(el("span", "", "\u00B7"));
        subline.appendChild(el("span", "", formatDisplayDate(item.created_at)));
        metaCol.appendChild(subline);

        authorLeft.appendChild(metaCol);
        header.appendChild(authorLeft);
        card.appendChild(header);

        // Review text (with spoiler guard if needed)
        const text = (item.review_text || "").trim();
        if (text) {
          if (item.has_spoilers) {
            const spoilerWrap = el("div", "mt-3 rounded-md border border-amber-500/30 bg-[#0E0F13] p-3");
            const warnRow = el("div", "flex flex-wrap items-center justify-between gap-2");
            warnRow.appendChild(el("span", "text-xs font-medium text-amber-300", "Spoiler hidden"));
            const revealBtn = el("button", "rounded border border-white/15 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:border-white/35", "Show spoiler");
            revealBtn.type = "button";
            warnRow.appendChild(revealBtn);
            spoilerWrap.appendChild(warnRow);

            const bodyP = el("p", "mt-2 hidden whitespace-pre-line text-sm leading-relaxed text-zinc-300", text);
            revealBtn.addEventListener("click", () => {
              const hidden = bodyP.classList.contains("hidden");
              bodyP.classList.toggle("hidden", !hidden);
              revealBtn.textContent = hidden ? "Hide spoiler" : "Show spoiler";
            });
            spoilerWrap.appendChild(bodyP);
            card.appendChild(spoilerWrap);
          } else {
            const bodyP = el("p", "mt-3 whitespace-pre-line text-sm leading-relaxed text-zinc-300", text);
            card.appendChild(bodyP);
          }
        }

        // Actions: Helpful + Report
        const actions = el("div", "mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3");
        let helpfulCount = Number(item.helpful_count || 0);
        let voted = Boolean(item.viewer_has_voted);

        const helpfulBtn = el("button", "rounded-md border px-3 py-1 text-xs font-medium transition-colors tabular-nums");
        helpfulBtn.type = "button";

        const paintHelpful = () => {
          helpfulBtn.textContent = `Helpful (${helpfulCount})`;
          helpfulBtn.setAttribute("aria-pressed", String(voted));
          helpfulBtn.className = voted
            ? "rounded-md border border-[#E50914] bg-[#E50914]/20 px-3 py-1 text-xs font-semibold text-white tabular-nums"
            : "rounded-md border border-white/15 bg-[#0E0F13] px-3 py-1 text-xs font-medium text-zinc-300 hover:border-white/35 hover:text-white tabular-nums";
        };
        paintHelpful();

        helpfulBtn.addEventListener("click", async () => {
          if (!state.user) {
            openModal("moview-signin-modal");
            return;
          }
          if (voted) {
            const { error } = await state.supabase
              .from("review_votes")
              .delete()
              .eq("user_id", state.user.id)
              .eq("review_id", item.id);
            if (!error) {
              voted = false;
              helpfulCount = Math.max(0, helpfulCount - 1);
              paintHelpful();
            }
          } else {
            const { error } = await state.supabase
              .from("review_votes")
              .insert({ user_id: state.user.id, review_id: item.id });
            if (!error) {
              voted = true;
              helpfulCount += 1;
              paintHelpful();
            }
          }
        });

        const reportBtn = el("button", "text-xs text-zinc-400 hover:text-rose-300", "Report");
        reportBtn.type = "button";
        reportBtn.addEventListener("click", () => {
          if (!state.user) {
            openModal("moview-signin-modal");
            return;
          }
          const idField = document.getElementById("report-review-id");
          const reasonField = document.getElementById("report-reason-input");
          const reportStatus = document.getElementById("report-review-status");
          if (idField) idField.value = item.id;
          if (reasonField) reasonField.value = "";
          if (reportStatus) reportStatus.textContent = "";
          openModal("moview-report-modal");
        });

        actions.appendChild(helpfulBtn);
        actions.appendChild(reportBtn);
        card.appendChild(actions);

        return card;
      }

      async function fetchReviewsPage(reset = false) {
        if (!reviewsList) return;
        if (reset) {
          state.reviewOffset = 0;
          reviewsList.replaceChildren(el("p", "text-sm text-zinc-400", "Loading community reviews..."));
        }

        const { data, error } = await state.supabase.rpc("get_reviews_page", {
          p_tmdb_id: tmdbId,
          p_media_type: mediaType,
          p_sort: state.reviewSort,
          p_limit: 10,
          p_offset: state.reviewOffset,
        });

        if (reset) reviewsList.replaceChildren();

        if (error) {
          reviewsList.appendChild(el("p", "text-sm text-rose-300", "Could not load viewer reviews right now."));
          return;
        }

        const rows = data || [];
        if (rows.length === 0 && state.reviewOffset === 0) {
          reviewsList.appendChild(
            el("p", "rounded-lg border border-white/10 bg-[#181A20] p-5 text-sm text-zinc-400", "No viewer reviews yet. Be the first to share your thoughts.")
          );
          if (loadMoreWrap) loadMoreWrap.classList.add("hidden");
          return;
        }

        for (const row of rows) {
          reviewsList.appendChild(buildReviewItemNode(row));
        }

        state.reviewOffset += rows.length;
        state.hasMoreReviews = rows.length === 10;
        if (loadMoreWrap) {
          loadMoreWrap.classList.toggle("hidden", !state.hasMoreReviews);
        }
      }

      if (!alreadyWired) {
        viewerReviewsRoot.setAttribute("data-community-wired", "true");

        // Sort controls
        document.querySelectorAll("[data-review-sort]").forEach((sortBtn) => {
          sortBtn.addEventListener("click", () => {
            state.reviewSort = sortBtn.getAttribute("data-review-sort") || "helpful";
            document.querySelectorAll("[data-review-sort]").forEach((b) => {
              const active = b === sortBtn;
              b.setAttribute("aria-pressed", String(active));
              b.className = active
                ? "rounded px-3 py-1 text-xs font-semibold bg-[#E50914] text-white whitespace-nowrap"
                : "rounded px-3 py-1 text-xs font-medium text-zinc-300 hover:text-white whitespace-nowrap";
            });
            fetchReviewsPage(true);
          });
        });

        if (loadMoreBtn) {
          loadMoreBtn.addEventListener("click", () => fetchReviewsPage(false));
        }

        // Submit / Update review
        if (reviewForm) {
          reviewForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (!state.user) {
              openModal("moview-signin-modal");
              return;
            }
            const activeTmdbId = Number(viewerReviewsRoot.getAttribute("data-tmdb-id"));
            const activeMediaType = viewerReviewsRoot.getAttribute("data-media-type") || "movie";
            if (!Number.isInteger(activeTmdbId) || activeTmdbId <= 0) return;

            if (state.selectedRating < 1 || state.selectedRating > 5) {
              if (formStatus) {
                formStatus.textContent = "Please choose a star rating from 1 to 5.";
                formStatus.className = "text-xs text-rose-300";
              }
              return;
            }
            if (state.profile && !state.profile.username) {
              openModal("moview-username-modal");
              return;
            }

            const reviewText = (textArea?.value || "").trim();
            if (reviewText.length > 2000) {
              if (formStatus) {
                formStatus.textContent = "Review text must be 2000 characters or fewer.";
                formStatus.className = "text-xs text-rose-300";
              }
              return;
            }

            const payload = {
              user_id: state.user.id,
              tmdb_id: activeTmdbId,
              media_type: activeMediaType,
              rating: state.selectedRating,
              review_text: reviewText || null,
              has_spoilers: Boolean(spoilerCheckbox?.checked),
            };

            if (formStatus) {
              formStatus.textContent = "Saving review...";
              formStatus.className = "text-xs text-zinc-300";
            }

            let res;
            if (state.myReviewId) {
              res = await state.supabase
                .from("user_reviews")
                .update(payload)
                .eq("id", state.myReviewId)
                .eq("user_id", state.user.id);
            } else {
              res = await state.supabase.from("user_reviews").insert(payload);
            }

            if (res.error) {
              if (formStatus) {
                formStatus.textContent = res.error.code === "23505"
                  ? "You already have a review on file for this title."
                  : (res.error.message || "Could not save review.");
                formStatus.className = "text-xs text-rose-300";
              }
              return;
            }

            if (formStatus) {
              formStatus.textContent = state.myReviewId ? "Review updated." : "Review posted.";
              formStatus.className = "text-xs text-emerald-300";
            }

            await refreshSummaryAndOwnReview();
            await fetchReviewsPage(true);
          });
        }

        // Delete own review
        if (deleteBtn) {
          deleteBtn.addEventListener("click", async () => {
            if (!state.user || !state.myReviewId) return;
            const { error } = await state.supabase
              .from("user_reviews")
              .delete()
              .eq("id", state.myReviewId)
              .eq("user_id", state.user.id);

            if (error) {
              if (formStatus) {
                formStatus.textContent = error.message || "Could not delete review.";
                formStatus.className = "text-xs text-rose-300";
              }
              return;
            }

            if (formStatus) {
              formStatus.textContent = "Your review has been deleted.";
              formStatus.className = "text-xs text-zinc-300";
            }
            await refreshSummaryAndOwnReview();
            await fetchReviewsPage(true);
          });
        }

        // Report submission
        const reportForm = document.getElementById("report-review-form");
        if (reportForm) {
          reportForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (!state.user) return;
            const reviewId = document.getElementById("report-review-id")?.value;
            const reason = (document.getElementById("report-reason-input")?.value || "").trim();
            const statusEl = document.getElementById("report-review-status");

            if (reason.length < 3 || reason.length > 500) {
              if (statusEl) {
                statusEl.textContent = "Please enter a reason between 3 and 500 characters.";
                statusEl.className = "text-xs text-rose-300";
              }
              return;
            }

            const { error } = await state.supabase.from("review_reports").insert({
              review_id: reviewId,
              reporter_id: state.user.id,
              reason,
            });

            if (statusEl) {
              if (error) {
                statusEl.textContent = error.code === "23505"
                  ? "You have already reported this review."
                  : (error.message || "Could not submit report.");
                statusEl.className = "text-xs text-rose-300";
              } else {
                statusEl.textContent = "Report submitted to moderators. Thank you.";
                statusEl.className = "text-xs text-emerald-300";
                setTimeout(() => closeModal("moview-report-modal"), 900);
              }
            }
          });
        }
      }

      await refreshSummaryAndOwnReview();
      await fetchReviewsPage(true);

      return {
        refreshAuth: async () => {
          await refreshSummaryAndOwnReview();
          await fetchReviewsPage(true);
        },
      };
    }

    // B2. Request a Review (Signed-in only on /title/)
    async function initRequestReviewSection() {
      const btn = document.getElementById("request-review-btn");
      const statusEl = document.getElementById("request-review-status");
      const viewerSection = document.getElementById("viewer-reviews");
      if (!btn || !viewerSection) return;

      const tmdbId = Number(viewerSection.getAttribute("data-tmdb-id"));
      const mediaType = viewerSection.getAttribute("data-media-type") || "movie";
      const title = (viewerSection.getAttribute("data-title") || "").trim().slice(0, 200);
      if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !title) return;

      const setRequestedUi = (msg) => {
        btn.disabled = true;
        btn.textContent = "Review Requested";
        btn.className =
          "rounded-md border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-xs font-semibold text-emerald-300 whitespace-nowrap cursor-default";
        if (statusEl) {
          statusEl.textContent = msg || "We have your request on file.";
          statusEl.className = "text-xs text-emerald-300";
        }
      };

      const resetDefaultUi = () => {
        btn.disabled = false;
        btn.textContent = "Request a review";
        btn.className =
          "rounded-md bg-[#E50914] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#F40612] whitespace-nowrap";
        if (statusEl) {
          statusEl.textContent = "";
          statusEl.className = "text-xs text-zinc-400";
        }
      };

      if (btn.getAttribute("data-request-wired") !== "true") {
        btn.setAttribute("data-request-wired", "true");
        btn.addEventListener("click", async () => {
          if (!state.supabase) {
            if (statusEl) {
              statusEl.textContent = "Connect Supabase to enable review requests.";
              statusEl.className = "text-xs text-amber-300";
            }
            return;
          }
          if (!state.user) {
            if (statusEl) {
              statusEl.textContent = "Sign in to request a review.";
              statusEl.className = "text-xs text-zinc-300";
            }
            openModal("moview-signin-modal");
            return;
          }

          const curId = Number(viewerSection.getAttribute("data-tmdb-id"));
          const curType = viewerSection.getAttribute("data-media-type") || "movie";
          const curTitle = (viewerSection.getAttribute("data-title") || "").trim().slice(0, 200);
          if (!Number.isInteger(curId) || curId <= 0 || !curTitle) return;

          btn.disabled = true;
          const { error } = await state.supabase.from("review_requests").insert({
            tmdb_id: curId,
            media_type: curType,
            title: curTitle,
            user_id: state.user.id,
          });

          if (error) {
            if (error.code === "23505") {
              setRequestedUi("You already requested a review for this title.");
              return;
            }
            btn.disabled = false;
            if (statusEl) {
              statusEl.textContent = error.message || "Could not submit review request.";
              statusEl.className = "text-xs text-rose-300";
            }
            return;
          }

          setRequestedUi("Thanks! Added to our editorial request queue.");
        });
      }

      if (state.supabase && state.user) {
        const { data: existing } = await state.supabase
          .from("review_requests")
          .select("id")
          .eq("user_id", state.user.id)
          .eq("tmdb_id", tmdbId)
          .eq("media_type", mediaType)
          .maybeSingle();

        if (existing) {
          setRequestedUi("You already requested a review for this title.");
        } else {
          resetDefaultUi();
        }
      } else {
        resetDefaultUi();
      }
    }

    // C. /my-watchlist/ controller
    async function initMyWatchlistPage() {
      const root = document.getElementById("my-watchlist-root");
      if (!root) return null;

      const signedOut = document.getElementById("watchlist-signed-out");
      const signedIn = document.getElementById("watchlist-signed-in");
      const grid = document.getElementById("watchlist-grid");
      const emptyMsg = document.getElementById("watchlist-empty");

      let activeTab = "watched";
      let allItems = [];

      async function reloadWatchlist() {
        if (!state.supabase || !state.user) {
          if (signedOut) signedOut.classList.remove("hidden");
          if (signedIn) signedIn.classList.add("hidden");
          return;
        }
        if (signedOut) signedOut.classList.add("hidden");
        if (signedIn) signedIn.classList.remove("hidden");

        const { data, error } = await state.supabase
          .from("watchlist")
          .select("id, tmdb_id, media_type, status, title, poster_path, updated_at")
          .eq("user_id", state.user.id)
          .order("updated_at", { ascending: false });

        if (error) {
          if (emptyMsg) {
            emptyMsg.textContent = error.message || "Could not load your watchlist.";
            emptyMsg.classList.remove("hidden");
          }
          return;
        }

        allItems = data || [];
        state.watchlistMap.clear();
        for (const row of allItems) {
          state.watchlistMap.set(`${row.media_type}:${row.tmdb_id}`, row.status);
        }
        ["watched", "want_to_watch", "maybe_later"].forEach((s) => {
          const countEl = document.querySelector(`[data-tab-count="${s}"]`);
          if (countEl) countEl.textContent = String(allItems.filter((i) => i.status === s).length);
        });
        renderActiveTab();
      }

      function renderActiveTab() {
        if (!grid || !emptyMsg) return;
        const filtered = allItems.filter((i) => i.status === activeTab);
        grid.replaceChildren();
        if (filtered.length === 0) {
          emptyMsg.textContent = "No titles in this list yet. Use the status buttons on any review card to add one.";
          emptyMsg.classList.remove("hidden");
        } else {
          emptyMsg.classList.add("hidden");
        }

        for (const item of filtered) {
          const controls = el("div", "mt-auto pt-3 space-y-2");

          const moveSelect = el("select", "w-full rounded border border-white/15 bg-[#0E0F13] px-2 py-1 text-xs text-zinc-200");
          moveSelect.setAttribute("aria-label", `Move ${item.title} to another list`);
          Object.entries(WATCHLIST_LABELS).forEach(([val, text]) => {
            const opt = el("option", "", text);
            opt.value = val;
            opt.selected = val === item.status;
            moveSelect.appendChild(opt);
          });
          moveSelect.addEventListener("change", async () => {
            const nextStatus = moveSelect.value;
            const { error } = await state.supabase
              .from("watchlist")
              .update({ status: nextStatus })
              .eq("id", item.id)
              .eq("user_id", state.user.id);
            if (!error) {
              await reloadWatchlist();
            }
          });

          const removeBtn = el("button", "w-full rounded border border-white/10 py-1 text-[11px] text-rose-300 hover:bg-rose-500/10", "Remove");
          removeBtn.type = "button";
          removeBtn.addEventListener("click", async () => {
            const { error } = await state.supabase
              .from("watchlist")
              .delete()
              .eq("id", item.id)
              .eq("user_id", state.user.id);
            if (!error) {
              await reloadWatchlist();
            }
          });

          controls.appendChild(moveSelect);
          controls.appendChild(removeBtn);

          grid.appendChild(
            buildPosterCard({
              tmdbId: item.tmdb_id,
              mediaType: item.media_type,
              title: item.title,
              posterPath: item.poster_path,
              actionsNode: controls,
            })
          );
        }
      }

      document.querySelectorAll("[data-watchlist-tab]").forEach((tabBtn) => {
        tabBtn.addEventListener("click", () => {
          activeTab = tabBtn.getAttribute("data-watchlist-tab") || "watched";
          document.querySelectorAll("[data-watchlist-tab]").forEach((b) => {
            const active = b === tabBtn;
            b.setAttribute("aria-selected", String(active));
            b.className = active
              ? "rounded-md bg-[#E50914] px-4 py-2 text-xs font-semibold text-white whitespace-nowrap"
              : "rounded-md border border-white/15 bg-[#181A20] px-4 py-2 text-xs font-medium text-zinc-300 hover:text-white whitespace-nowrap";
          });
          renderActiveTab();
        });
      });

      await reloadWatchlist();
      return { refreshAuth: reloadWatchlist };
    }

    // D. /u/?name=username Public Profile controller
    async function initPublicProfilePage() {
      const root = document.getElementById("public-profile-root");
      if (!root) return;

      const loadingEl = document.getElementById("profile-loading");
      const notFoundEl = document.getElementById("profile-not-found");
      const contentEl = document.getElementById("profile-content");

      const params = new URLSearchParams(window.location.search);
      const requestedName = (params.get("name") || "").trim();

      if (!state.supabase || !requestedName || !USERNAME_RE.test(requestedName)) {
        if (loadingEl) loadingEl.classList.add("hidden");
        if (notFoundEl) notFoundEl.classList.remove("hidden");
        return;
      }

      const { data: profile } = await state.supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, bio, created_at")
        .ilike("username", requestedName)
        .maybeSingle();

      if (loadingEl) loadingEl.classList.add("hidden");

      if (!profile) {
        if (notFoundEl) notFoundEl.classList.remove("hidden");
        return;
      }

      if (contentEl) contentEl.classList.remove("hidden");
      document.title = `${profile.display_name || profile.username} (@${profile.username}) | Moview`;

      const displayEl = document.getElementById("profile-display-name");
      const userEl = document.getElementById("profile-username");
      const bioEl = document.getElementById("profile-bio");
      const avatarImg = document.getElementById("profile-avatar-img");
      const avatarFallback = document.getElementById("profile-avatar-fallback");
      const ownerActions = document.getElementById("profile-owner-actions");

      const displayName = profile.display_name || profile.username;
      if (displayEl) displayEl.textContent = displayName;
      if (userEl) userEl.textContent = `@${profile.username}`;
      if (bioEl) bioEl.textContent = profile.bio || "";
      if (avatarFallback) avatarFallback.textContent = displayName.charAt(0).toUpperCase();

      if (avatarImg && isSafeHttpUrl(profile.avatar_url)) {
        avatarImg.src = profile.avatar_url;
        avatarImg.alt = displayName;
        avatarImg.classList.remove("hidden");
        if (avatarFallback) avatarFallback.classList.add("hidden");
      }

      if (ownerActions && state.user && state.user.id === profile.id) {
        ownerActions.classList.remove("hidden");
      }

      const [{ data: reviews }, { data: watchlistRows }] = await Promise.all([
        state.supabase
          .from("user_reviews")
          .select("id, tmdb_id, media_type, rating, review_text, has_spoilers, created_at")
          .eq("user_id", profile.id)
          .eq("is_hidden", false)
          .order("created_at", { ascending: false }),
        state.supabase
          .from("watchlist")
          .select("tmdb_id, media_type, status, title, poster_path, updated_at")
          .eq("user_id", profile.id)
          .order("updated_at", { ascending: false }),
      ]);

      const reviewRows = reviews || [];
      const wlRows = watchlistRows || [];

      const watched = wlRows.filter((i) => i.status === "watched");
      const want = wlRows.filter((i) => i.status === "want_to_watch");
      const maybe = wlRows.filter((i) => i.status === "maybe_later");

      const titleByKey = new Map();
      for (const w of wlRows) {
        titleByKey.set(`${w.media_type}:${w.tmdb_id}`, w.title);
      }

      const setText = (id, val) => {
        const node = document.getElementById(id);
        if (node) node.textContent = String(val);
      };
      setText("profile-count-watched", watched.length);
      setText("profile-count-want", want.length);
      setText("profile-count-maybe", maybe.length);
      setText("profile-count-reviews", reviewRows.length);

      const reviewsContainer = document.getElementById("profile-reviews-list");
      if (reviewsContainer) {
        reviewsContainer.replaceChildren();
        if (reviewRows.length === 0) {
          reviewsContainer.appendChild(el("p", "text-sm text-zinc-400", "No viewer reviews posted yet."));
        } else {
          for (const r of reviewRows) {
            const card = el("article", "rounded-lg border border-white/10 bg-[#181A20] p-4");
            const top = el("div", "flex flex-wrap items-center justify-between gap-2");
            const titleGuess = titleByKey.get(`${r.media_type}:${r.tmdb_id}`) || `${r.media_type === "tv" ? "Series" : "Movie"} #${r.tmdb_id}`;
            top.appendChild(el("h3", "font-display text-base font-semibold text-[#F5F5F5]", titleGuess));
            top.appendChild(el("span", "text-xs text-amber-400 tabular-nums", `${renderStarString(r.rating)} (${r.rating}/5)`));
            card.appendChild(top);
            card.appendChild(el("p", "mt-1 text-xs text-zinc-400", formatDisplayDate(r.created_at)));
            if (r.review_text) {
              card.appendChild(el("p", "mt-2.5 text-sm leading-relaxed text-zinc-300", r.has_spoilers ? "[Spoiler-tagged review] " + r.review_text : r.review_text));
            }
            reviewsContainer.appendChild(card);
          }
        }
      }

      const renderProfileGrid = (id, items) => {
        const grid = document.getElementById(id);
        if (!grid) return;
        grid.replaceChildren();
        if (items.length === 0) {
          grid.appendChild(el("p", "col-span-full text-sm text-zinc-400", "Nothing added yet."));
          return;
        }
        for (const item of items) {
          grid.appendChild(
            buildPosterCard({
              tmdbId: item.tmdb_id,
              mediaType: item.media_type,
              title: item.title,
              posterPath: item.poster_path,
            })
          );
        }
      };

      renderProfileGrid("profile-grid-watched", watched);
      renderProfileGrid("profile-grid-want", want);
      renderProfileGrid("profile-grid-maybe", maybe);
    }

    // E. /settings/ controller
    async function initSettingsPage() {
      const root = document.getElementById("profile-settings-root");
      if (!root) return;

      const signedOut = document.getElementById("settings-signed-out");
      const signedIn = document.getElementById("settings-signed-in");

      if (!state.supabase || !state.user) {
        if (signedOut) signedOut.classList.remove("hidden");
        if (signedIn) signedIn.classList.add("hidden");
        return;
      }

      if (signedOut) signedOut.classList.add("hidden");
      if (signedIn) signedIn.classList.remove("hidden");

      const usernameInput = document.getElementById("settings-username");
      const displayNameInput = document.getElementById("settings-display-name");
      const bioInput = document.getElementById("settings-bio");
      const bioCount = document.getElementById("settings-bio-count");
      const publicLink = document.getElementById("settings-public-profile-link");
      const settingsForm = document.getElementById("profile-settings-form");
      const saveStatus = document.getElementById("settings-save-status");
      const deleteForm = document.getElementById("delete-account-form");
      const deleteConfirm = document.getElementById("delete-confirm-input");
      const deleteStatus = document.getElementById("delete-account-status");

      if (state.profile) {
        if (usernameInput) usernameInput.value = state.profile.username || "";
        if (displayNameInput) displayNameInput.value = state.profile.display_name || "";
        if (bioInput) bioInput.value = state.profile.bio || "";
        if (bioCount && bioInput) bioCount.textContent = `${bioInput.value.length} / 160`;
        if (publicLink && state.profile.username) {
          publicLink.href = `/u/?name=${encodeURIComponent(state.profile.username)}`;
        }
      }

      if (bioInput && bioCount) {
        bioInput.addEventListener("input", () => {
          bioCount.textContent = `${bioInput.value.length} / 160`;
        });
      }

      if (settingsForm) {
        settingsForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const username = (usernameInput?.value || "").trim();
          const displayName = (displayNameInput?.value || "").trim();
          const bio = (bioInput?.value || "").trim();

          if (!USERNAME_RE.test(username)) {
            if (saveStatus) {
              saveStatus.textContent = "Username must be 3–20 characters (letters, numbers, underscores).";
              saveStatus.className = "text-xs text-rose-300";
            }
            return;
          }
          if (displayName.length > 60 || bio.length > 160) {
            if (saveStatus) {
              saveStatus.textContent = "Display name (max 60) or bio (max 160) exceeds allowed length.";
              saveStatus.className = "text-xs text-rose-300";
            }
            return;
          }

          const { error } = await state.supabase
            .from("profiles")
            .update({
              username,
              display_name: displayName || null,
              bio,
            })
            .eq("id", state.user.id);

          if (error) {
            if (saveStatus) {
              saveStatus.textContent = error.code === "23505"
                ? "That username is already taken."
                : (error.message || "Could not update profile.");
              saveStatus.className = "text-xs text-rose-300";
            }
            return;
          }

          await loadCurrentProfileAndWatchlist();
          updateHeaderUi();
          if (publicLink) publicLink.href = `/u/?name=${encodeURIComponent(username)}`;
          if (saveStatus) {
            saveStatus.textContent = "Profile updated.";
            saveStatus.className = "text-xs text-emerald-300";
          }
        });
      }

      if (deleteForm) {
        deleteForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          if ((deleteConfirm?.value || "").trim() !== "DELETE") {
            if (deleteStatus) {
              deleteStatus.textContent = "Please type DELETE exactly to confirm account deletion.";
              deleteStatus.className = "text-xs text-rose-300";
            }
            return;
          }

          if (deleteStatus) {
            deleteStatus.textContent = "Deleting account and all associated data...";
            deleteStatus.className = "text-xs text-zinc-300";
          }

          const { error } = await state.supabase.rpc("delete_user_self");
          if (error) {
            if (deleteStatus) {
              deleteStatus.textContent = error.message || "Could not delete account.";
              deleteStatus.className = "text-xs text-rose-300";
            }
            return;
          }

          await state.supabase.auth.signOut();
          window.location.href = "/";
        });
      }
    }

    // F. /admin-moderation/ controller
    async function initAdminModerationPage() {
      const root = document.getElementById("admin-moderation-root");
      if (!root) return;

      const unauthEl = document.getElementById("admin-unauthorized");
      const panelEl = document.getElementById("admin-reports-panel");
      const listEl = document.getElementById("admin-reports-list");
      const emptyEl = document.getElementById("admin-reports-empty");

      if (!state.supabase || !state.user || !state.profile?.is_admin) {
        if (unauthEl) {
          unauthEl.textContent = state.user
            ? "Access denied: your account does not have moderator privileges (is_admin = true)."
            : "Please sign in with an administrator account to access moderation.";
        }
        if (panelEl) panelEl.classList.add("hidden");
        return;
      }

      if (unauthEl) unauthEl.classList.add("hidden");
      if (panelEl) panelEl.classList.remove("hidden");

      async function loadReports() {
        if (!listEl || !emptyEl) return;
        const { data: reports, error } = await state.supabase
          .from("review_reports")
          .select(`
            id,
            reason,
            created_at,
            review_id,
            reporter:reporter_id(username, display_name),
            review:review_id(
              id,
              tmdb_id,
              media_type,
              rating,
              review_text,
              is_hidden,
              author:user_id(username, display_name)
            )
          `)
          .order("created_at", { ascending: false });

        listEl.replaceChildren();
        if (error) {
          listEl.appendChild(el("p", "text-sm text-rose-300", error.message || "Could not load reports."));
          return;
        }

        const rows = reports || [];
        emptyEl.classList.toggle("hidden", rows.length > 0);

        for (const rep of rows) {
          const card = el("article", "rounded-lg border border-white/10 bg-[#181A20] p-5 space-y-3");
          const rev = rep.review;
          const header = el("div", "flex flex-wrap items-center justify-between gap-2");
          header.appendChild(
            el(
              "p",
              "text-xs font-semibold text-amber-300",
              `Reported ${formatDisplayDate(rep.created_at)} by ${rep.reporter?.username ? "@" + rep.reporter.username : "user"}`
            )
          );
          if (rev?.is_hidden) {
            header.appendChild(el("span", "rounded bg-rose-500/20 px-2 py-0.5 text-[11px] font-semibold text-rose-300", "Hidden"));
          }
          card.appendChild(header);

          card.appendChild(el("p", "text-sm text-zinc-200", `Reason: ${rep.reason}`));

          if (rev) {
            const box = el("div", "rounded-md border border-white/10 bg-[#0E0F13] p-3.5 text-sm");
            const authorLabel = rev.author?.username ? `@${rev.author.username}` : (rev.author?.display_name || "Unknown");
            box.appendChild(el("p", "text-xs text-zinc-400", `Review by ${authorLabel} · ${rev.media_type} #${rev.tmdb_id} · ${rev.rating}/5`));
            box.appendChild(el("p", "mt-2 whitespace-pre-line text-zinc-300", rev.review_text || "(Rating only, no text)"));
            card.appendChild(box);

            const btns = el("div", "flex flex-wrap gap-2 pt-1");
            const toggleHideBtn = el(
              "button",
              "rounded border border-amber-500/40 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/10",
              rev.is_hidden ? "Unhide Review" : "Hide Review"
            );
            toggleHideBtn.type = "button";
            toggleHideBtn.addEventListener("click", async () => {
              const { error: hideErr } = await state.supabase
                .from("user_reviews")
                .update({ is_hidden: !rev.is_hidden })
                .eq("id", rev.id);
              if (!hideErr) {
                await loadReports();
              } else {
                listEl.prepend(el("p", "text-xs text-rose-300", hideErr.message || "Could not update review visibility."));
              }
            });

            const deleteRevBtn = el(
              "button",
              "rounded border border-rose-500/40 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/10",
              "Delete Review"
            );
            deleteRevBtn.type = "button";
            deleteRevBtn.addEventListener("click", async () => {
              const { error: delErr } = await state.supabase.from("user_reviews").delete().eq("id", rev.id);
              if (!delErr) {
                await loadReports();
              } else {
                listEl.prepend(el("p", "text-xs text-rose-300", delErr.message || "Could not delete review."));
              }
            });

            const dismissBtn = el(
              "button",
              "rounded border border-white/15 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white",
              "Dismiss Report"
            );
            dismissBtn.type = "button";
            dismissBtn.addEventListener("click", async () => {
              const { error: disErr } = await state.supabase.from("review_reports").delete().eq("id", rep.id);
              if (!disErr) {
                await loadReports();
              } else {
                listEl.prepend(el("p", "text-xs text-rose-300", disErr.message || "Could not dismiss report."));
              }
            });

            btns.appendChild(toggleHideBtn);
            btns.appendChild(deleteRevBtn);
            btns.appendChild(dismissBtn);
            card.appendChild(btns);
          }

          listEl.appendChild(card);
        }
      }

      async function loadRequestedTitles() {
        const reqListEl = document.getElementById("admin-requests-list");
        const reqEmptyEl = document.getElementById("admin-requests-empty");
        if (!reqListEl || !reqEmptyEl) return;

        const { data: requests, error } = await state.supabase
          .from("review_requests")
          .select("id, tmdb_id, media_type, title, created_at")
          .order("created_at", { ascending: false });

        reqListEl.replaceChildren();
        if (error) {
          reqListEl.appendChild(el("p", "text-sm text-rose-300", error.message || "Could not load review requests."));
          return;
        }

        const grouped = new Map();
        for (const row of requests || []) {
          const key = `${row.media_type}:${row.tmdb_id}`;
          if (!grouped.has(key)) {
            grouped.set(key, {
              tmdb_id: row.tmdb_id,
              media_type: row.media_type,
              title: row.title,
              count: 0,
              latestAt: row.created_at,
            });
          }
          const entry = grouped.get(key);
          entry.count += 1;
        }

        const sorted = Array.from(grouped.values()).sort(
          (a, b) => b.count - a.count || new Date(b.latestAt) - new Date(a.latestAt)
        );

        reqEmptyEl.classList.toggle("hidden", sorted.length > 0);

        for (const item of sorted) {
          const rowCard = el("div", "flex flex-wrap items-center justify-between gap-4 rounded-lg border border-white/10 bg-[#181A20] px-4 py-3.5");
          const left = el("div", "min-w-0");
          const link = el("a", "font-display text-sm font-semibold text-[#F5F5F5] hover:text-[#E50914]", item.title);
          link.href = `/title/?id=${encodeURIComponent(item.tmdb_id)}&type=${encodeURIComponent(item.media_type)}`;
          left.appendChild(link);
          left.appendChild(
            el(
              "p",
              "mt-0.5 text-xs text-zinc-400 tabular-nums",
              `${item.media_type === "tv" ? "Web Series" : "Movie"} · TMDB #${item.tmdb_id} · Latest ${formatDisplayDate(item.latestAt)}`
            )
          );
          rowCard.appendChild(left);

          const right = el("div", "flex items-center gap-3 shrink-0");
          right.appendChild(
            el(
              "span",
              "rounded bg-[#E50914]/15 px-2.5 py-1 text-xs font-semibold text-[#F5F5F5] tabular-nums",
              `${item.count} ${item.count === 1 ? "request" : "requests"}`
            )
          );

          const clearBtn = el(
            "button",
            "rounded border border-white/15 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:border-rose-500/40 hover:text-rose-300",
            "Clear"
          );
          clearBtn.type = "button";
          clearBtn.addEventListener("click", async () => {
            const { error: delErr } = await state.supabase
              .from("review_requests")
              .delete()
              .eq("tmdb_id", item.tmdb_id)
              .eq("media_type", item.media_type);
            if (!delErr) {
              await loadRequestedTitles();
            }
          });
          right.appendChild(clearBtn);
          rowCard.appendChild(right);
          reqListEl.appendChild(rowCard);
        }
      }

      await Promise.all([loadReports(), loadRequestedTitles()]);
    }

    let lastUid = null;
    if (state.supabase) {
      const { data: sessionData } = await state.supabase.auth.getSession();
      state.user = sessionData?.session?.user || null;
      lastUid = state.user?.id || null;
      await loadCurrentProfileAndWatchlist();
    }

    updateHeaderUi();
    syncWatchlistPickers();
    syncSignInPage();

    let [reviewHandle, watchlistHandle] = await Promise.all([
      initReviewPageCommunity(),
      initMyWatchlistPage(),
      initPublicProfilePage(),
      initSettingsPage(),
      initAdminModerationPage(),
    ]);

    await initRequestReviewSection();

    const refreshTitleContext = async () => {
      syncWatchlistPickers();
      reviewHandle = await initReviewPageCommunity();
      await initRequestReviewSection();
    };

    window.MoviewCommunity = {
      refreshTitleContext,
    };

    window.addEventListener("moview:title-ready", () => {
      refreshTitleContext();
    });

    if (window.__MOVIEW_TITLE_CONTEXT__) {
      await refreshTitleContext();
    }

    if (state.supabase) {
      state.supabase.auth.onAuthStateChange(async (_event, session) => {
        const nextUid = session?.user?.id || null;
        if (nextUid === lastUid) return;
        lastUid = nextUid;
        state.user = session?.user || null;
        await loadCurrentProfileAndWatchlist();
        updateHeaderUi();
        syncWatchlistPickers();
        syncSignInPage();
        if (reviewHandle?.refreshAuth) await reviewHandle.refreshAuth();
        await initRequestReviewSection();
        if (watchlistHandle?.refreshAuth) await watchlistHandle.refreshAuth();
        if (document.getElementById("profile-settings-root")) await initSettingsPage();
        if (document.getElementById("admin-moderation-root")) await initAdminModerationPage();
      });
    }
  });
})();
