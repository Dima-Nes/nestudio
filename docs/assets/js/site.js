(() => {
	const body = document.body;
	const basePath = body.dataset.base || "";
	const currentPage = body.dataset.page || "";

	const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

	const fallbackSvg =
		"data:image/svg+xml;charset=utf-8," +
		encodeURIComponent(`
			<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
				<defs>
					<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
						<stop offset="0" stop-color="#dcdcd7"/>
						<stop offset="1" stop-color="#f6f6f3"/>
					</linearGradient>
				</defs>
				<rect width="1200" height="800" fill="url(#g)"/>
				<circle cx="900" cy="160" r="220" fill="#ffffff" opacity=".35"/>
				<circle cx="180" cy="680" r="260" fill="#111111" opacity=".05"/>
				<text x="80" y="420" font-family="Arial, sans-serif" font-size="48" font-weight="700" fill="#111111">
					nestudio preview
				</text>
			</svg>
		`);

	document.addEventListener("DOMContentLoaded", async () => {
		await loadPartials();

		initTheme();
		initCurrentYear();
		initBottomNav();
		initImages();
		initReveal();
		initPortfolioFilters();

		requestAnimationFrame(() => {
			body.classList.remove("is-loading");
			body.classList.add("is-ready");
		});
	});

	async function loadPartials() {
		const targets = [
			{
				id: "site-header",
				file: "partials/header.html"
			},
			{
				id: "site-footer",
				file: "partials/footer.html"
			},
			{
				id: "site-bottom-nav",
				file: "partials/bottom-nav.html"
			}
		];

		await Promise.all(
			targets.map(async item => {
				const mount = document.getElementById(item.id);

				if (!mount) {
					return;
				}

				try {
					const response = await fetch(basePath + item.file, {
						headers: {
							Accept: "text/html"
						}
					});

					if (!response.ok) {
						throw new Error(`Partial load failed: ${item.file}`);
					}

					const html = await response.text();
					mount.innerHTML = rewritePartialUrls(html);
				} catch (error) {
					console.error(error);
				}
			})
		);
	}

	function rewritePartialUrls(html) {
		if (!basePath) {
			return html;
		}

		return html
			.replaceAll('href="index.html"', `href="${basePath}index.html"`)
			.replaceAll('href="about.html"', `href="${basePath}about.html"`)
			.replaceAll('href="contact.html"', `href="${basePath}contact.html"`)
			.replaceAll('src="img/', `src="${basePath}img/`);
	}

	function initTheme() {
		const themeToggle = document.getElementById("themeToggle");
		const themeIcon = document.getElementById("themeIcon");
		const savedTheme = localStorage.getItem("theme");

		applyTheme(savedTheme || (prefersDark ? "dark" : "light"));

		if (!themeToggle) {
			return;
		}

		themeToggle.addEventListener("click", event => {
			event.preventDefault();

			const nextTheme = body.classList.contains("dark") ? "light" : "dark";
			applyTheme(nextTheme);
		});

		function applyTheme(theme) {
			body.classList.toggle("dark", theme === "dark");

			if (themeIcon) {
				themeIcon.textContent = theme === "dark" ? "☀" : "◐";
			}

			if (themeToggle) {
				themeToggle.setAttribute(
					"aria-label",
					theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"
				);
			}

			localStorage.setItem("theme", theme);
		}
	}

	function initCurrentYear() {
		document.querySelectorAll("[data-current-year]").forEach(element => {
			element.textContent = String(new Date().getFullYear());
		});
	}

	function initBottomNav() {
		document.querySelectorAll("[data-nav]").forEach(link => {
			link.classList.toggle("active", link.dataset.nav === currentPage);
		});
	}

	function initImages() {
		document.querySelectorAll("img").forEach(img => {
			img.loading = img.loading || "lazy";
			img.decoding = "async";
			img.referrerPolicy = "no-referrer";

			img.addEventListener("error", () => {
				img.src = fallbackSvg;
			});
		});
	}

	function initReveal() {
		const elements = document.querySelectorAll(".reveal");

		if (!elements.length) {
			return;
		}

		if (prefersReducedMotion || !("IntersectionObserver" in window)) {
			elements.forEach(element => {
				element.classList.add("is-visible");
			});

			return;
		}

		const observer = new IntersectionObserver(
			entries => {
				entries.forEach(entry => {
					if (!entry.isIntersecting) {
						return;
					}

					entry.target.classList.add("is-visible");
					observer.unobserve(entry.target);
				});
			},
			{
				threshold: 0.14,
				rootMargin: "0px 0px -8% 0px"
			}
		);

		elements.forEach(element => {
			observer.observe(element);
		});
	}

	function initPortfolioFilters() {
		const works = document.getElementById("works");
		const filters = document.getElementById("filters");

		if (!works || !filters) {
			return;
		}

		const filterButtons = Array.from(filters.querySelectorAll(".filter-btn"));
		const originalCards = Array.from(works.querySelectorAll(".card"));

		let isFiltering = false;
		let currentFilter = "all";
		let resizeTimer = null;
		let lastColumnCount = 0;

		filterButtons.forEach(button => {
			button.setAttribute("aria-pressed", button.classList.contains("active") ? "true" : "false");
		});

		filters.addEventListener(
			"click",
			event => {
				const button = event.target.closest(".filter-btn");

				if (!button) {
					return;
				}

				event.preventDefault();

				if (isFiltering) {
					return;
				}

				setActiveButton(button);
				applyFilter(button.dataset.filter);
				button.blur();
			},
			{
				passive: false
			}
		);

		window.addEventListener("resize", () => {
			clearTimeout(resizeTimer);

			resizeTimer = setTimeout(() => {
				const nextColumnCount = getColumnCount();

				if (nextColumnCount === lastColumnCount) {
					return;
				}

				renderMasonry(currentFilter, false);
			}, 120);
		});

		renderMasonry(currentFilter, false);

		function setActiveButton(activeButton) {
			filterButtons.forEach(button => {
				const active = button === activeButton;

				button.classList.toggle("active", active);
				button.setAttribute("aria-pressed", String(active));
			});
		}

		function applyFilter(filter) {
			if (filter === currentFilter) {
				return;
			}

			isFiltering = true;

			const currentY = window.scrollY;
			const currentHeight = works.offsetHeight;

			currentFilter = filter;
			works.style.minHeight = `${currentHeight}px`;
			works.classList.add("is-filtering");

			renderMasonry(filter, true);
			safeScrollRestore(currentY);

			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					works.style.minHeight = "";
					works.classList.remove("is-filtering");
					isFiltering = false;
				});
			});
		}

		function renderMasonry(filter, animate) {
			const visibleCards = getVisibleCards(filter);
			const columnCount = getColumnCount();
			const columns = createColumns(columnCount);
			const heights = new Array(columnCount).fill(0);

			lastColumnCount = columnCount;

			visibleCards.forEach(card => {
				card.classList.remove(
					"is-visible",
					"reveal--fast",
					"reveal--delay-1",
					"reveal--delay-2",
					"reveal--delay-3",
					"reveal--delay-4"
				);

				let targetIndex = 0;
				let minHeight = heights[0];

				for (let i = 1; i < heights.length; i += 1) {
					if (heights[i] < minHeight) {
						minHeight = heights[i];
						targetIndex = i;
					}
				}

				columns[targetIndex].appendChild(card);
				heights[targetIndex] = columns[targetIndex].offsetHeight;
			});

			if (animate) {
				animateCardsIn(visibleCards);
				return;
			}

			visibleCards.forEach(card => {
				card.classList.add("is-visible");
			});
		}

		function getVisibleCards(filter) {
			return originalCards.filter(card => {
				return filter === "all" || card.dataset.category === filter;
			});
		}

		function createColumns(count) {
			works.innerHTML = "";

			const columns = [];

			for (let i = 0; i < count; i += 1) {
				const column = document.createElement("div");
				column.className = "masonry-col";
				works.appendChild(column);
				columns.push(column);
			}

			return columns;
		}

		function getColumnCount() {
			if (window.innerWidth <= 420) {
				return 1;
			}

			if (window.innerWidth <= 1180) {
				return 2;
			}

			return 3;
		}

		function animateCardsIn(cards) {
			cards.forEach((card, index) => {
				const mod = index % 5;

				if (mod === 0) {
					card.classList.add("reveal--fast");
				}

				if (mod === 1) {
					card.classList.add("reveal--delay-1");
				}

				if (mod === 2) {
					card.classList.add("reveal--delay-2");
				}

				if (mod === 3) {
					card.classList.add("reveal--delay-3");
				}

				if (mod === 4) {
					card.classList.add("reveal--delay-4");
				}

				if (prefersReducedMotion) {
					card.classList.add("is-visible");
					return;
				}

				requestAnimationFrame(() => {
					requestAnimationFrame(() => {
						card.classList.add("is-visible");
					});
				});
			});
		}

		function safeScrollRestore(y) {
			requestAnimationFrame(() => {
				window.scrollTo(0, y);
			});

			requestAnimationFrame(() => {
				window.scrollTo(0, y);
			});
		}
	}
})();