document.addEventListener("DOMContentLoaded", () => {
  // Mobile navigation toggle
  const menuBtn = document.getElementById("mobile-menu-toggle");
  const mobileNav = document.getElementById("mobile-nav-drawer");

  if (menuBtn && mobileNav) {
    const closeMenu = () => {
      mobileNav.classList.add("hidden");
      menuBtn.setAttribute("aria-expanded", "false");
    };

    menuBtn.addEventListener("click", () => {
      const isOpen = menuBtn.getAttribute("aria-expanded") === "true";
      if (isOpen) {
        closeMenu();
      } else {
        mobileNav.classList.remove("hidden");
        menuBtn.setAttribute("aria-expanded", "true");
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    });
  }

  // Lite YouTube embed: only loads iframe on click
  document.querySelectorAll("[data-youtube-lite]").forEach((container) => {
    const trigger = container.querySelector("[data-youtube-trigger]");
    const videoKey = container.getAttribute("data-youtube-lite");
    const title = container.getAttribute("data-youtube-title") || "Official Trailer";

    if (!trigger || !videoKey) return;

    trigger.addEventListener("click", () => {
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(
        videoKey
      )}?autoplay=1&rel=0`;
      iframe.title = title;
      iframe.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.allowFullscreen = true;
      iframe.className = "absolute inset-0 h-full w-full border-0";
      container.innerHTML = "";
      container.appendChild(iframe);
    });
  });

  // Contact form enhancement for Web3Forms
  const contactForm = document.getElementById("moview-contact-form");
  const statusEl = document.getElementById("contact-form-status");

  if (contactForm && statusEl) {
    contactForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitBtn = contactForm.querySelector('button[type="submit"]');
      const formData = new FormData(contactForm);
      const accessKey = String(formData.get("access_key") || "");

      if (!accessKey || accessKey === "YOUR_WEB3FORMS_ACCESS_KEY") {
        statusEl.textContent =
          "Web3Forms access key is currently a placeholder. Please configure your key or write directly to our email listed beside this form.";
        statusEl.className = "text-sm text-amber-300 mt-3";
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      statusEl.textContent = "Sending your message...";
      statusEl.className = "text-sm text-zinc-300 mt-3";

      try {
        const res = await fetch("https://api.web3forms.com/submit", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.success) {
          statusEl.textContent = "Thanks for reaching out. We have received your message.";
          statusEl.className = "text-sm text-emerald-300 mt-3";
          contactForm.reset();
        } else {
          statusEl.textContent =
            data.message || "Could not send message. Please try emailing us directly.";
          statusEl.className = "text-sm text-rose-300 mt-3";
        }
      } catch {
        statusEl.textContent = "Network error while sending. Please email us directly.";
        statusEl.className = "text-sm text-rose-300 mt-3";
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
});
