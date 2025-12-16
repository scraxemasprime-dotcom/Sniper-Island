// Chapters page functionality

let allChapters = [];
let seriesId = null;
let currentGrid = null;
let sortDescending = loadSortPreference(); // default: Newest first
let favoritesSet = new Set();
let isLoggedIn = false;

document.addEventListener('DOMContentLoaded', () => {
    insertNavigation();
    loadChapters();
    setupSearch();
});

async function loadChapters() {
    seriesId = getUrlParameter('series');
    
    if (!seriesId) {
        document.body.innerHTML = '<div class="container"><h1>Series not found</h1></div>';
        return;
    }
    
    const container = document.querySelector('.chapters-grid') || document.body;
    const bannerContainer = document.querySelector('.series-banner');
    
    showLoading(container);
    
    const series = await getSeriesById(seriesId);
    
    if (!series) {
        showEmptyState(container, 'Series not found');
        return;
    }
    
    // Sort chapters by ID (assuming they're numbered like ch1, ch2, etc.)
    const sortedChapters = [...(series.chapters || [])].sort((a, b) => {
        // Extract numbers from chapter IDs for sorting
        const numA = parseInt(a.id.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.id.replace(/\D/g, '')) || 0;
        return numA - numB;
    });
    
    allChapters = sortedChapters;

    // Load favorites for logged-in user (if any)
    try {
        const meRes = await fetch('/api/me');
        const me = await meRes.json();
        isLoggedIn = !!me.user;
        favoritesSet = isLoggedIn ? new Set(await fetchFavorites()) : new Set();
    } catch {
        isLoggedIn = false;
        favoritesSet = new Set();
    }

    // Track recently viewed series (only if logged in; endpoint requires auth)
    if (isLoggedIn) {
        trackRecent('series', series.id);
    }
    
    // Create banner
    if (bannerContainer) {
        const coverUrl = series.cover || '/content/placeholder.jpg';
        const description = series.description || 'No description available.';
        const isFavorite = favoritesSet.has(series.id);
        
        bannerContainer.innerHTML = `
            <div class="banner-content">
                <div class="banner-cover">
                    <img src="${coverUrl}" alt="${series.name}" onerror="this.parentElement.innerHTML='📖'">
                </div>
                <div class="banner-info">
                    <button class="btn-back" onclick="window.location.href='/manga'">← Back to Library</button>
                    <div class="banner-title-row">
                        <h1 class="banner-title">${series.name}</h1>
                        <button type="button" class="favorite-btn banner-favorite ${isFavorite ? 'is-favorite' : ''}" aria-label="${isFavorite ? 'Unfavorite series' : 'Favorite series'}" title="${isFavorite ? 'Unfavorite' : 'Favorite'}">★</button>
                    </div>
                    <p class="banner-author">by ${series.author}</p>
                    <p class="banner-description">${description}</p>
                </div>
            </div>
            <button type="button" id="sort-toggle" class="sort-fab" aria-label="Toggle chapter sort order" title="Toggle sort">↓</button>
        `;

        const favBtn = bannerContainer.querySelector('.banner-favorite');
        if (favBtn) {
            favBtn.addEventListener('click', async () => {
                if (!isLoggedIn) {
                    window.location.href = '/auth#login';
                    return;
                }

                const nextState = !favBtn.classList.contains('is-favorite');
                favBtn.classList.toggle('is-favorite', nextState);
                favBtn.setAttribute('aria-label', nextState ? 'Unfavorite series' : 'Favorite series');
                favBtn.setAttribute('title', nextState ? 'Unfavorite' : 'Favorite');

                try {
                    const updated = nextState ? await addFavorite(series.id) : await removeFavorite(series.id);
                    favoritesSet = new Set(updated);
                } catch (e) {
                    console.error(e);
                }
            });
        }

        const sortBtn = document.getElementById('sort-toggle');
        if (sortBtn) setupSortToggle(sortBtn);
    }
    
    renderChapters(applySort(allChapters));
}

function renderChapters(chapters) {
    const container = document.querySelector('.chapters-grid') || document.body;
    
    if (chapters.length === 0) {
        container.innerHTML = '';
        showEmptyState(container, 'No chapters found');
        return;
    }
    
    const grid = document.createElement('div');
    grid.className = 'content-grid';
    
    chapters.forEach((chapter, index) => {
        const chapterNumber = getChapterNumberFromId(chapter?.id) ?? (index + 1);
        const card = createChapterCard(chapter, seriesId, chapterNumber);
        grid.appendChild(card);
    });
    
    container.innerHTML = '';
    container.appendChild(grid);
    currentGrid = grid;
}

function setupSearch() {
    const searchInput = document.getElementById('search-input');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        
        if (query === '') {
            renderChapters(applySort(allChapters));
            return;
        }
        
        const filtered = allChapters.filter(chapter => {
            const title = (chapter.title || '').toLowerCase();
            return title.includes(query);
        });
        
        renderChapters(applySort(filtered));
    });
}

function setupSortToggle(btn) {
    // Ensure initial label matches default state
    updateSortToggleLabel(btn);

    btn.addEventListener('click', () => {
        sortDescending = !sortDescending;
        saveSortPreference(sortDescending);
        updateSortToggleLabel(btn);

        // Re-render respecting current search query
        const searchInput = document.getElementById('search-input');
        const query = (searchInput?.value || '').toLowerCase().trim();
        if (!query) {
            renderChapters(applySort(allChapters));
            return;
        }

        const filtered = allChapters.filter(chapter => {
            const title = (chapter.title || '').toLowerCase();
            return title.includes(query);
        });
        renderChapters(applySort(filtered));
    });
}

function updateSortToggleLabel(btn) {
    // Descending = newest first (higher chapter number first)
    btn.textContent = sortDescending ? '↓' : '↑';
    btn.setAttribute('aria-label', sortDescending ? 'Sort chapters newest first' : 'Sort chapters oldest first');
    btn.setAttribute('title', sortDescending ? 'Newest first' : 'Oldest first');
}

function loadSortPreference() {
    try {
        const v = localStorage.getItem('chaptersSortDescending');
        if (v === null) return true;
        return v === 'true';
    } catch {
        return true;
    }
}

function saveSortPreference(value) {
    try {
        localStorage.setItem('chaptersSortDescending', String(!!value));
    } catch {
        // no-op
    }
}

function applySort(list) {
    const arr = Array.isArray(list) ? list : [];
    return sortDescending ? [...arr].reverse() : arr;
}

function getChapterNumberFromId(id) {
    if (!id) return null;
    const n = parseInt(String(id).replace(/\D/g, ''), 10);
    return Number.isFinite(n) ? n : null;
}

