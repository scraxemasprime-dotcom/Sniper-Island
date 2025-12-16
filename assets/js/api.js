// API functions for manga data

const API_BASE = '';

/**
 * Fetch all series data from JSON file
 */
async function fetchSeriesData() {
    try {
        const response = await fetch(`${API_BASE}/api/manga`);
        if (!response.ok) throw new Error('Failed to fetch manga data');
        const data = await response.json();
        return data.series || [];
    } catch (error) {
        console.error('Error fetching series data:', error);
        return [];
    }
}

/**
 * Get series by ID
 */
async function getSeriesById(seriesId) {
    const seriesList = await fetchSeriesData();
    return seriesList.find(series => series.id === seriesId);
}

/**
 * Get chapters for a series
 */
async function getSeriesChapters(seriesId) {
    const series = await getSeriesById(seriesId);
    return series ? series.chapters || [] : [];
}

// Legacy functions for backward compatibility
async function fetchMangaData() {
    return await fetchSeriesData();
}

async function getMangaById(id) {
    return await getSeriesById(id);
}

async function getMangaChapters(mangaId) {
    return await getSeriesChapters(mangaId);
}

// Favorites API (requires login)
async function fetchFavorites() {
    const res = await fetch(`${API_BASE}/api/favorites`);
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data.favorites) ? data.favorites : [];
}

async function addFavorite(seriesId) {
    const res = await fetch(`${API_BASE}/api/favorites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesId })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to favorite');
    return Array.isArray(data.favorites) ? data.favorites : [];
}

async function removeFavorite(seriesId) {
    const res = await fetch(`${API_BASE}/api/favorites/${encodeURIComponent(seriesId)}`, {
        method: 'DELETE'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to unfavorite');
    return Array.isArray(data.favorites) ? data.favorites : [];
}

// Recently viewed (requires login)
async function fetchRecent() {
    const res = await fetch(`${API_BASE}/api/recent`);
    if (res.status === 404) throw new Error('RECENT_ENDPOINT_MISSING');
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data.recent) ? data.recent : [];
}

async function clearRecent() {
    const res = await fetch(`${API_BASE}/api/recent`, { method: 'DELETE' });
    if (res.status === 404) throw new Error('RECENT_ENDPOINT_MISSING');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to clear');
    return Array.isArray(data.recent) ? data.recent : [];
}

async function trackRecent(type, seriesId, chapterId = '') {
    try {
        const res = await fetch(`${API_BASE}/api/recent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, seriesId, chapterId })
        });
        if (res.status === 404) console.warn('Recently viewed endpoint missing. Restart server to enable /api/recent.');
    } catch {
        // no-op
    }
}

// Chapter left off (requires login)
async function fetchLeftOff() {
    const res = await fetch(`${API_BASE}/api/leftoff`);
    if (res.status === 404) throw new Error('LEFTOFF_ENDPOINT_MISSING');
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return data.leftOff || null;
}

async function saveLeftOff(seriesId, chapterId, pageIndex, pageCount) {
    try {
        const res = await fetch(`${API_BASE}/api/leftoff`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ seriesId, chapterId, pageIndex, pageCount })
        });
        if (res.status === 404) console.warn('Left-off endpoint missing. Restart server to enable /api/leftoff.');
    } catch {
        // no-op
    }
}

async function clearLeftOff() {
    const res = await fetch(`${API_BASE}/api/leftoff`, { method: 'DELETE' });
    if (res.status === 404) throw new Error('LEFTOFF_ENDPOINT_MISSING');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to clear');
    return data.leftOff || null;
}