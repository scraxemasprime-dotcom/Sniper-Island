// Auth page helpers (login/register/account)

async function postJson(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || 'Request failed');
    }
    return data;
}

function showAuthError(message, scopeEl) {
    const el = scopeEl?.querySelector?.('[data-auth-error]') || document.getElementById('authError');
    if (!el) return;
    el.textContent = message;
    el.style.display = 'block';
}

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof insertNavigation === 'function') insertNavigation();

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = new FormData(loginForm);
            const username = String(form.get('username') || '');
            const password = String(form.get('password') || '');
            try {
                await postJson('/api/login', { username, password });
                window.location.href = '/manga';
            } catch (err) {
                showAuthError(err.message, loginForm);
            }
        });
    }

    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = new FormData(registerForm);
            const username = String(form.get('username') || '');
            const password = String(form.get('password') || '');
            try {
                await postJson('/api/register', { username, password });
                window.location.href = '/manga';
            } catch (err) {
                showAuthError(err.message, registerForm);
            }
        });
    }

    // Tabs for combined /auth page (login + register)
    const tabs = Array.from(document.querySelectorAll('.auth-tab'));
    if (tabs.length) {
        const show = (panelId) => {
            const panels = Array.from(document.querySelectorAll('.auth-panel'));
            panels.forEach((p) => (p.style.display = (p.id === panelId ? 'block' : 'none')));
            tabs.forEach((t) => t.classList.toggle('active', t.getAttribute('data-target') === panelId));
        };

        tabs.forEach((btn) => {
            btn.addEventListener('click', () => show(btn.getAttribute('data-target')));
        });

        if (window.location.hash === '#register') show('registerPanel');
        else show('loginPanel');
    }

    const accountUsername = document.getElementById('accountUsername');
    if (accountUsername) {
        try {
            const res = await fetch('/api/me');
            const data = await res.json();
            if (!data.user) {
                window.location.href = '/auth#login';
                return;
            }

            window.__accountUser = data.user;
            hydrateAccountHeader(data.user);
            await hydrateAccountStats(data.user);
            await hydrateAccountLeftOff();
            await hydrateAccountFavorites();
            await hydrateAccountRecent();
            wireAccountActions();
        } catch {
            accountUsername.textContent = 'Failed to load account';
        }
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await postJson('/api/logout', {});
            } finally {
                window.location.href = '/manga';
            }
        });
    }
});

function hydrateAccountHeader(user) {
    const usernameEl = document.getElementById('accountUsername');
    const sinceEl = document.getElementById('accountSince');
    const avatarEl = document.getElementById('accountAvatar');
    const avatarImg = document.getElementById('accountAvatarImg');
    const avatarInitial = document.getElementById('accountAvatarInitial');

    const username = user?.username || 'Account';
    if (usernameEl) usernameEl.textContent = username;

    const createdAt = user?.createdAt ? new Date(user.createdAt) : null;
    if (sinceEl) sinceEl.textContent = createdAt ? createdAt.toLocaleDateString() : '—';

    const initial = String(username || '?').trim().charAt(0).toUpperCase() || '?';
    if (avatarInitial) avatarInitial.textContent = initial;

    const url = (user?.avatarUrl || '').toString().trim();
    if (avatarImg && url) {
        avatarImg.src = url;
        avatarImg.style.display = 'block';
        if (avatarInitial) avatarInitial.style.display = 'none';
    } else if (avatarImg) {
        avatarImg.style.display = 'none';
        if (avatarInitial) avatarInitial.style.display = 'block';
    }
}

async function hydrateAccountStats(user) {
    const statFavorites = document.getElementById('statFavorites');
    const statLibrary = document.getElementById('statLibrary');
    const statUsername = document.getElementById('statUsername');

    if (statUsername) statUsername.textContent = user?.username || '—';

    try {
        const [favorites, series] = await Promise.all([
            fetchFavorites().catch(() => []),
            fetchSeriesData().catch(() => [])
        ]);

        if (statFavorites) statFavorites.textContent = String(favorites.length);
        if (statLibrary) statLibrary.textContent = String(series.length);
    } catch {
        if (statFavorites) statFavorites.textContent = '—';
        if (statLibrary) statLibrary.textContent = '—';
    }
}

async function hydrateAccountFavorites() {
    const container = document.getElementById('favoritesGrid');
    if (!container) return;

    container.innerHTML = `<div class="muted">Loading…</div>`;

    const favorites = await fetchFavorites().catch(() => []);
    if (!favorites.length) {
        container.innerHTML = `<div class="empty-card">No favorites yet. Favorite a series from its chapters page banner.</div>`;
        return;
    }

    const seriesList = await fetchSeriesData().catch(() => []);
    const byId = new Map(seriesList.map(s => [s.id, s]));

    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'favorites-cards';

    favorites.forEach((id) => {
        const s = byId.get(id);
        const title = s?.name || id;
        const cover = s?.cover || '';

        const card = document.createElement('div');
        card.className = 'fav-card';
        card.setAttribute('data-title', title);
        card.innerHTML = `
            <div class="fav-cover">
                ${cover ? `<img src="${cover}" alt="${title} cover">` : `<div class="fav-cover-fallback">📖</div>`}
            </div>
            <div class="fav-body">
                <div class="fav-title">${title}</div>
                <div class="fav-actions">
                    <a class="fav-view" href="/chapters?series=${encodeURIComponent(id)}">View</a>
                    <button type="button" class="fav-remove" data-series-id="${id}">Remove</button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });

    grid.addEventListener('click', async (e) => {
        const btn = e.target?.closest?.('.fav-remove');
        if (!btn) return;
        const seriesId = btn.getAttribute('data-series-id');
        if (!seriesId) return;

        btn.disabled = true;
        try {
            await removeFavorite(seriesId);
            await hydrateAccountStats({ username: document.getElementById('statUsername')?.textContent || '' });
            await hydrateAccountFavorites();
        } catch {
            btn.disabled = false;
        }
    });

    container.appendChild(grid);
}

async function hydrateAccountLeftOff() {
    const container = document.getElementById('leftOffSlot');
    if (!container) return;

    container.innerHTML = `<div class="muted">Loading…</div>`;

    let leftOff = null;
    try {
        leftOff = await fetchLeftOff();
    } catch (e) {
        if (String(e?.message || '') === 'LEFTOFF_ENDPOINT_MISSING') {
            container.innerHTML = `<div class="empty-card">Continue Reading is disabled because the server is running an older version. Restart the server to enable \`/api/leftoff\`.</div>`;
            return;
        }
        leftOff = null;
    }
    if (!leftOff) {
        container.innerHTML = `<div class="empty-card">No progress yet. Open a chapter in the reader to start tracking.</div>`;
        return;
    }

    const seriesList = await fetchSeriesData().catch(() => []);
    const byId = new Map(seriesList.map(s => [s.id, s]));
    const s = byId.get(leftOff.seriesId);
    const title = s?.name || leftOff.seriesId;
    const cover = s?.cover || '';

    const pageHuman = (leftOff.pageIndex || 0) + 1;
    const total = leftOff.pageCount || 0;
    const pct = total > 0 ? Math.round((pageHuman / total) * 100) : 0;

    const href = `/reader?series=${encodeURIComponent(leftOff.seriesId)}&chapter=${encodeURIComponent(leftOff.chapterId)}&page=${encodeURIComponent(pageHuman)}`;

    container.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'fav-card leftoff-card';
    card.setAttribute('data-title', title);
    card.innerHTML = `
        <div class="fav-cover">
            ${cover ? `<img src="${cover}" alt="${title} cover">` : `<div class="fav-cover-fallback">📖</div>`}
        </div>
        <div class="fav-body">
            <div class="fav-title">${title}</div>
            <div class="fav-subtitle">Chapter ${parseInt(String(leftOff.chapterId).replace(/\D/g, ''), 10) || leftOff.chapterId} • Page ${pageHuman}${total ? ` of ${total}` : ''}</div>
            <div class="progress-row">
                <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
                <div class="progress-text">${total ? `${pct}%` : ''}</div>
            </div>
            <div class="fav-actions">
                <a class="fav-view" href="${href}">Continue</a>
                <button type="button" class="fav-remove leftoff-edit-btn">Edit</button>
                <button type="button" class="fav-remove leftoff-clear-btn">Clear</button>
            </div>
            <div class="leftoff-edit" style="display:none;">
                <label class="auth-label">
                    Set page
                    <input class="auth-input leftoff-page-input" type="number" min="1" ${total ? `max="${total}"` : ''} value="${pageHuman}">
                </label>
                <div class="leftoff-edit-actions">
                    <button type="button" class="ghost-btn leftoff-cancel">Cancel</button>
                    <button type="button" class="outline-btn leftoff-save">Save</button>
                </div>
                <div class="auth-error leftoff-edit-error" style="display:none;"></div>
            </div>
        </div>
    `;
    container.appendChild(card);

    const editBtn = card.querySelector('.leftoff-edit-btn');
    const clearBtn = card.querySelector('.leftoff-clear-btn');
    const editPane = card.querySelector('.leftoff-edit');
    const pageInput = card.querySelector('.leftoff-page-input');
    const cancelBtn = card.querySelector('.leftoff-cancel');
    const saveBtn = card.querySelector('.leftoff-save');
    const errEl = card.querySelector('.leftoff-edit-error');

    if (editBtn && editPane) {
        editBtn.addEventListener('click', () => {
            editPane.style.display = (editPane.style.display === 'none' ? 'block' : 'none');
            if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
        });
    }

    if (cancelBtn && editPane) {
        cancelBtn.addEventListener('click', () => {
            editPane.style.display = 'none';
            if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
        });
    }

    if (saveBtn && pageInput) {
        saveBtn.addEventListener('click', async () => {
            if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
            const nextPage = parseInt(String(pageInput.value || ''), 10);
            if (!Number.isFinite(nextPage) || nextPage < 1 || (total && nextPage > total)) {
                if (errEl) {
                    errEl.textContent = total ? `Page must be between 1 and ${total}.` : 'Page must be at least 1.';
                    errEl.style.display = 'block';
                }
                return;
            }

            saveBtn.disabled = true;
            try {
                await saveLeftOff(leftOff.seriesId, leftOff.chapterId, nextPage - 1, leftOff.pageCount || 0);
                await hydrateAccountLeftOff();
            } catch (e) {
                if (errEl) {
                    errEl.textContent = e.message || 'Failed to save.';
                    errEl.style.display = 'block';
                }
            } finally {
                saveBtn.disabled = false;
            }
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', async () => {
            clearBtn.disabled = true;
            try {
                await clearLeftOff();
                await hydrateAccountLeftOff();
            } catch (e) {
                clearBtn.disabled = false;
            }
        });
    }
}

async function hydrateAccountRecent() {
    const container = document.getElementById('recentGrid');
    if (!container) return;

    container.innerHTML = `<div class="muted">Loading…</div>`;

    let recent = [];
    try {
        recent = await fetchRecent();
    } catch (e) {
        if (String(e?.message || '') === 'RECENT_ENDPOINT_MISSING') {
            container.innerHTML = `<div class="empty-card">Recently Viewed is disabled because the server is running an older version. Restart the server to enable \`/api/recent\`.</div>`;
            return;
        }
        recent = [];
    }
    if (!recent.length) {
        container.innerHTML = `<div class="empty-card">Nothing viewed yet. Open a series or chapter to see it here.</div>`;
        return;
    }

    const seriesList = await fetchSeriesData().catch(() => []);
    const byId = new Map(seriesList.map(s => [s.id, s]));

    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'favorites-cards recent-cards';

    recent.forEach((item) => {
        const s = byId.get(item.seriesId);
        const title = s?.name || item.seriesId;
        const cover = s?.cover || '';
        const when = item.at ? new Date(item.at).toLocaleString() : '';

        let subtitle = 'Series';
        let href = `/chapters?series=${encodeURIComponent(item.seriesId)}`;
        if (item.type === 'chapter' && item.chapterId) {
            const num = parseInt(String(item.chapterId).replace(/\D/g, ''), 10);
            subtitle = Number.isFinite(num) ? `Chapter ${num}` : item.chapterId;
            href = `/reader?series=${encodeURIComponent(item.seriesId)}&chapter=${encodeURIComponent(item.chapterId)}`;
        }

        const card = document.createElement('div');
        card.className = 'fav-card recent-card';
        card.setAttribute('data-title', `${title} ${subtitle}`);
        card.innerHTML = `
            <div class="fav-cover">
                ${cover ? `<img src="${cover}" alt="${title} cover">` : `<div class="fav-cover-fallback">📖</div>`}
            </div>
            <div class="fav-body">
                <div class="fav-title">${title}</div>
                <div class="fav-subtitle">${subtitle} • <span class="fav-when">${when}</span></div>
                <div class="fav-actions">
                    <a class="fav-view" href="${href}">Open</a>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });

    container.appendChild(grid);
}

function wireAccountActions() {
    const refreshBtn = document.getElementById('refreshFavoritesBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', hydrateAccountFavorites);

    const refreshRecentBtn = document.getElementById('refreshRecentBtn');
    if (refreshRecentBtn) refreshRecentBtn.addEventListener('click', hydrateAccountRecent);

    const clearRecentBtn = document.getElementById('clearRecentBtn');
    if (clearRecentBtn) {
        clearRecentBtn.addEventListener('click', async () => {
            clearRecentBtn.disabled = true;
            try {
                await clearRecent();
                await hydrateAccountRecent();
            } catch {
                // no-op
            } finally {
                clearRecentBtn.disabled = false;
            }
        });
    }

    const editBtn = document.getElementById('editProfileBtn');
    if (editBtn) editBtn.addEventListener('click', openProfileSettings);

    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) settingsBtn.addEventListener('click', openProfileSettings);

    const closeBtn = document.getElementById('closeProfileSettingsBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeProfileSettings);
    const cancelBtn = document.getElementById('cancelProfileSettingsBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', closeProfileSettings);

    const form = document.getElementById('profileSettingsForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errEl = document.getElementById('profileSettingsError');
            if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }

            const username = String(document.getElementById('profileUsernameInput')?.value || '').trim();
            const bio = String(document.getElementById('profileBioInput')?.value || '');

            try {
                const res = await fetch('/api/profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, bio })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || 'Failed to save');

                window.__accountUser = data.user;
                hydrateAccountHeader(data.user);
                await hydrateAccountStats(data.user);
                // Update navbar avatar/initial as well
                try { if (typeof updateAuthNav === 'function') updateAuthNav(); } catch {}

                closeProfileSettings();
            } catch (err) {
                if (errEl) {
                    errEl.textContent = err.message;
                    errEl.style.display = 'block';
                }
            }
        });
    }

    const avatarUploadBtn = document.getElementById('avatarUploadBtn');
    const avatarFileInput = document.getElementById('avatarFileInput');
    if (avatarUploadBtn && avatarFileInput) {
        avatarUploadBtn.addEventListener('click', () => avatarFileInput.click());
        avatarFileInput.addEventListener('change', async () => {
            const file = avatarFileInput.files?.[0];
            if (!file) return;

            // Basic client-side validation
            if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) {
                alert('Please select a PNG, JPG, WEBP, or GIF image.');
                avatarFileInput.value = '';
                return;
            }
            if (file.size > 2 * 1024 * 1024) {
                alert('Image must be 2MB or smaller.');
                avatarFileInput.value = '';
                return;
            }

            avatarUploadBtn.disabled = true;
            try {
                const fd = new FormData();
                fd.append('avatar', file);
                const res = await fetch('/api/avatar', { method: 'POST', body: fd });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || 'Upload failed');

                // Update UI immediately
                const avatarImg = document.getElementById('accountAvatarImg');
                const avatarInitial = document.getElementById('accountAvatarInitial');
                if (avatarImg) {
                    avatarImg.src = data.avatarUrl;
                    avatarImg.style.display = 'block';
                }
                if (avatarInitial) avatarInitial.style.display = 'none';
            } catch (err) {
                alert(err.message);
            } finally {
                avatarUploadBtn.disabled = false;
                avatarFileInput.value = '';
            }
        });
    }

    const deleteForm = document.getElementById('deleteAccountForm');
    if (deleteForm) {
        deleteForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errEl = document.getElementById('deleteError');
            if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }

            const fd = new FormData(deleteForm);
            const password = String(fd.get('password') || '');
            const confirmText = String(fd.get('confirmText') || '');

            try {
                const res = await fetch('/api/account', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password, confirmText })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || 'Failed to delete account');
                window.location.href = '/manga';
            } catch (err) {
                if (errEl) {
                    errEl.textContent = err.message;
                    errEl.style.display = 'block';
                }
            }
        });
    }
}

function openProfileSettings() {
    const section = document.getElementById('profileSettingsSection');
    if (!section) return;
    section.style.display = 'block';

    const user = window.__accountUser || {};
    const uInput = document.getElementById('profileUsernameInput');
    const bInput = document.getElementById('profileBioInput');
    if (uInput) uInput.value = user.username || '';
    if (bInput) bInput.value = user.bio || '';
    const errEl = document.getElementById('profileSettingsError');
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }

    // Scroll into view for smaller screens
    try { section.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
}

function closeProfileSettings() {
    const section = document.getElementById('profileSettingsSection');
    if (!section) return;
    section.style.display = 'none';
    const errEl = document.getElementById('profileSettingsError');
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
}


