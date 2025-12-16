document.addEventListener('DOMContentLoaded', () => {
    try {
        if (typeof insertNavigation === 'function') insertNavigation();
    } catch {
        // no-op
    }
    initProfile();
});

function getQueryParam(name) {
    try {
        return new URLSearchParams(window.location.search).get(name);
    } catch {
        return null;
    }
}

async function initProfile() {
    const root = document.getElementById('profileRoot');
    if (!root) return;

    const userId = (getQueryParam('user') || '').toString().trim();
    if (!userId) {
        root.innerHTML = `<div class="muted">User not specified.</div>`;
        return;
    }

    try {
        const res = await fetch(`/api/users/${encodeURIComponent(userId)}`);
        if (res.status === 404) {
            root.innerHTML = `<div class="muted">Profile feature is not active. Restart the server to enable <code>/api/users</code>.</div>`;
            return;
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to load profile');
        const user = data.user;

        const username = (user?.username || 'User').toString();
        const createdAt = (user?.createdAt || '').toString();
        const joined = createdAt ? new Date(createdAt).toLocaleDateString() : '—';
        const avatarUrl = (user?.avatarUrl || '').toString().trim();
        const initial = username.trim().charAt(0).toUpperCase() || '?';
        const bio = (user?.bio || '').toString().trim();
        const favorites = Array.isArray(user?.favorites) ? user.favorites : [];

        root.innerHTML = `
            <div class="public-profile-card">
                <div class="public-profile-avatar">
                    ${avatarUrl
                        ? `<img class="public-profile-avatar-img" src="${avatarUrl}" alt="${escapeHtml(username)}'s profile picture">`
                        : `<div class="public-profile-avatar-fallback" aria-hidden="true">${escapeHtml(initial)}</div>`
                    }
                </div>
                <div class="public-profile-meta">
                    <div class="public-profile-name">${escapeHtml(username)}</div>
                    <div class="public-profile-sub">Joined ${escapeHtml(joined)}</div>
                </div>
            </div>
            <div class="public-profile-sections">
                <section class="public-profile-section">
                    <h2 class="public-profile-h">Bio</h2>
                    <div class="public-profile-bio">${bio ? escapeHtml(bio) : `<span class="muted">No bio yet.</span>`}</div>
                </section>
                <section class="public-profile-section">
                    <h2 class="public-profile-h">Favorites</h2>
                    <div id="publicFavorites" class="favorites-grid" aria-live="polite">
                        <div class="muted">Loading…</div>
                    </div>
                </section>
            </div>
        `;

        await renderPublicFavorites(favorites);
    } catch (e) {
        root.innerHTML = `<div class="muted">Failed to load profile: ${escapeHtml(e.message)}</div>`;
    }
}

async function renderPublicFavorites(favoriteIds) {
    const host = document.getElementById('publicFavorites');
    if (!host) return;

    const ids = Array.isArray(favoriteIds) ? favoriteIds : [];
    if (!ids.length) {
        host.innerHTML = `<div class="empty-card">No favorites yet.</div>`;
        return;
    }

    try {
        const res = await fetch('/api/manga');
        const data = await res.json().catch(() => ({}));
        const series = Array.isArray(data.series) ? data.series : [];
        const byId = new Map(series.map(s => [s.id, s]));

        const list = ids.map(id => byId.get(id)).filter(Boolean);
        if (!list.length) {
            host.innerHTML = `<div class="empty-card">No favorites yet.</div>`;
            return;
        }

        const grid = document.createElement('div');
        grid.className = 'favorites-cards';
        list.forEach((s) => {
            const title = s?.name || s?.id || 'Series';
            const cover = s?.cover || '';
            const card = document.createElement('div');
            card.className = 'fav-card';
            card.innerHTML = `
                <div class="fav-cover">
                    ${cover ? `<img src="${cover}" alt="${escapeHtml(title)} cover">` : `<div class="fav-cover-fallback">📖</div>`}
                </div>
                <div class="fav-body">
                    <div class="fav-title">${escapeHtml(title)}</div>
                    <div class="fav-actions">
                        <a class="fav-view" href="/chapters?series=${encodeURIComponent(s.id)}">Open</a>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
        host.innerHTML = '';
        host.appendChild(grid);
    } catch {
        host.innerHTML = `<div class="muted">Failed to load favorites.</div>`;
    }
}

// Use ui.js escapeHtml if available; otherwise minimal fallback
function escapeHtml(str) {
    // Avoid recursion: this file defines a global escapeHtml too, so window.escapeHtml may point to itself.
    if (typeof window.escapeHtml === 'function' && window.escapeHtml !== escapeHtml) return window.escapeHtml(str);
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}


