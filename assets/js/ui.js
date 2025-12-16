// UI utility functions

/**
 * Create navigation bar
 */
function createNavigation() {
    const nav = document.createElement('nav');
    const placeholder = getNavSearchPlaceholder();
    nav.innerHTML = `
        <ul>
            <li><a href="/" class="logo"><img src="/assets/images/sniper-icon.png" alt="Sniper Island" class="logo-icon"> Sniper Island</a></li>
            <li class="nav-search">
                <input id="nav-search-input" class="nav-search-input" type="search" placeholder="${placeholder}" aria-label="${placeholder}">
            </li>
            <li class="nav-spacer"></li>
            <li id="auth-nav" class="auth-nav"></li>
        </ul>
    `;
    return nav;
}

/**
 * Insert navigation at the top of the page
 */
function insertNavigation() {
    const nav = createNavigation();
    document.body.insertBefore(nav, document.body.firstChild);
    updateAuthNav();
    setupNavSearch();
}

// Comments modal (shared)
let __commentsModal = null;
let __commentContextMenu = null;
let __seriesContextMenu = null;
let __favoritesCache = null;
let __favoritesCacheAt = 0;
let __publicUserCache = new Map();

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function openChapterComments(seriesId, chapterId, chapterLabel = '') {
    if (!seriesId || !chapterId) return;
    if (!__commentsModal) {
        __commentsModal = document.createElement('div');
        __commentsModal.className = 'comments-modal-backdrop';
        __commentsModal.innerHTML = `
            <div class="comments-modal" role="dialog" aria-modal="true" aria-label="Chapter comments">
                <div class="comments-header">
                    <div class="comments-title">Comments <span class="comments-subtitle" id="commentsSubtitle"></span></div>
                    <button type="button" class="comments-close" id="commentsClose" aria-label="Close comments">×</button>
                </div>
                <div class="comments-body">
                    <div class="comments-list" id="commentsList">Loading…</div>
                </div>
                <div class="comments-footer">
                    <div class="comments-hint" id="commentsHint">Login to post comments.</div>
                    <form class="comments-form" id="commentsForm">
                        <input class="comments-input" id="commentsInput" placeholder="Write a comment…" maxlength="800" />
                        <button class="comments-send" type="submit">Send</button>
                    </form>
                    <div class="comments-error" id="commentsError" style="display:none;"></div>
                </div>
            </div>
        `;
        document.body.appendChild(__commentsModal);

        __commentsModal.addEventListener('click', (e) => {
            if (e.target === __commentsModal) closeCommentsModal();
        });
        __commentsModal.querySelector('#commentsClose')?.addEventListener('click', closeCommentsModal);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && __commentsModal?.classList.contains('open')) closeCommentsModal();
        });
    }

    __commentsModal.dataset.seriesId = seriesId;
    __commentsModal.dataset.chapterId = chapterId;
    __commentsModal.classList.add('open');

    const subtitle = __commentsModal.querySelector('#commentsSubtitle');
    if (subtitle) subtitle.textContent = chapterLabel ? `(${chapterLabel})` : '';

    configureCommentPosting(seriesId, chapterId).then(() => loadComments(seriesId, chapterId));
}

function closeCommentsModal() {
    if (!__commentsModal) return;
    __commentsModal.classList.remove('open');
}

function ensureCommentContextMenu() {
    if (__commentContextMenu) return __commentContextMenu;
    __commentContextMenu = document.createElement('div');
    __commentContextMenu.className = 'comment-context-menu';
    __commentContextMenu.style.display = 'none';
    __commentContextMenu.innerHTML = `
        <button type="button" class="comment-context-item" data-action="delete">Delete</button>
    `;
    document.body.appendChild(__commentContextMenu);

    const hide = () => {
        __commentContextMenu.style.display = 'none';
        __commentContextMenu.dataset.commentId = '';
        __commentContextMenu.dataset.seriesId = '';
        __commentContextMenu.dataset.chapterId = '';
    };

    document.addEventListener('click', (e) => {
        if (__commentContextMenu.style.display !== 'none' && !__commentContextMenu.contains(e.target)) hide();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hide();
    });

    __commentContextMenu.addEventListener('click', async (e) => {
        const btn = e.target?.closest?.('.comment-context-item');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        const commentId = __commentContextMenu.dataset.commentId;
        const seriesId = __commentContextMenu.dataset.seriesId;
        const chapterId = __commentContextMenu.dataset.chapterId;
        if (action !== 'delete' || !commentId) return;

        btn.disabled = true;
        try {
            const delRes = await fetch(`/api/comments/${encodeURIComponent(commentId)}`, { method: 'DELETE' });
            const delData = await delRes.json().catch(() => ({}));
            if (!delRes.ok) throw new Error(delData.error || 'Failed to delete');
            hide();
            await loadComments(seriesId, chapterId);
        } catch {
            // no-op
        } finally {
            btn.disabled = false;
        }
    });

    return __commentContextMenu;
}

function ensureSeriesContextMenu() {
    if (__seriesContextMenu) return __seriesContextMenu;
    __seriesContextMenu = document.createElement('div');
    __seriesContextMenu.className = 'series-context-menu';
    __seriesContextMenu.style.display = 'none';
    document.body.appendChild(__seriesContextMenu);

    const hide = () => {
        __seriesContextMenu.style.display = 'none';
        __seriesContextMenu.dataset.seriesId = '';
    };

    document.addEventListener('click', (e) => {
        if (__seriesContextMenu.style.display !== 'none' && !__seriesContextMenu.contains(e.target)) hide();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hide();
    });

    __seriesContextMenu.addEventListener('click', async (e) => {
        const btn = e.target?.closest?.('.series-context-item');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        const seriesId = __seriesContextMenu.dataset.seriesId;
        if (!seriesId) return;

        if (action === 'open') {
            hide();
            window.location.href = `/chapters?series=${encodeURIComponent(seriesId)}`;
            return;
        }

        if (action === 'login') {
            hide();
            window.location.href = '/auth#login';
            return;
        }

        if (action === 'favorite' || action === 'unfavorite') {
            btn.disabled = true;
            try {
                if (action === 'favorite') await addFavorite(seriesId);
                else await removeFavorite(seriesId);
                // Bust cache so next open reflects latest state
                __favoritesCache = null;
                __favoritesCacheAt = 0;
            } catch {
                // no-op
            } finally {
                btn.disabled = false;
                hide();
            }
        }
    });

    return __seriesContextMenu;
}

async function getFavoritesCached() {
    const now = Date.now();
    if (__favoritesCache && (now - __favoritesCacheAt) < 15000) return __favoritesCache;
    const favs = await fetchFavorites();
    __favoritesCache = favs;
    __favoritesCacheAt = now;
    return favs;
}

async function openSeriesContextMenu(seriesId, clientX, clientY) {
    const menu = ensureSeriesContextMenu();
    menu.dataset.seriesId = seriesId;

    // Determine auth and favorite state
    let me = null;
    try {
        const meRes = await fetch('/api/me');
        me = await meRes.json();
    } catch {
        me = { user: null };
    }

    let itemsHtml = '';
    itemsHtml += `<button type="button" class="series-context-item" data-action="open">Open</button>`;

    if (!me?.user) {
        itemsHtml += `<button type="button" class="series-context-item series-context-danger" data-action="login">Login to Favorite</button>`;
    } else {
        let isFav = false;
        try {
            const favs = await getFavoritesCached();
            isFav = Array.isArray(favs) && favs.includes(seriesId);
        } catch {
            isFav = false;
        }
        itemsHtml += `<button type="button" class="series-context-item series-context-gold" data-action="${isFav ? 'unfavorite' : 'favorite'}">${isFav ? 'Unfavorite' : 'Favorite'}</button>`;
    }

    menu.innerHTML = itemsHtml;

    // Position within viewport
    const pad = 8;
    const mw = 220;
    const mh = 120;
    let x = clientX;
    let y = clientY;
    if (x + mw > window.innerWidth - pad) x = window.innerWidth - mw - pad;
    if (y + mh > window.innerHeight - pad) y = window.innerHeight - mh - pad;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.display = 'block';
}

async function loadComments(seriesId, chapterId) {
    const listEl = __commentsModal?.querySelector('#commentsList');
    if (!listEl) return;
    listEl.textContent = 'Loading…';

    try {
        const res = await fetch(`/api/comments?seriesId=${encodeURIComponent(seriesId)}&chapterId=${encodeURIComponent(chapterId)}`);
        if (res.status === 404) throw new Error('COMMENTS_ENDPOINT_MISSING');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to load comments');

        const currentUserId = __commentsModal?.dataset?.userId || '';
        const comments = Array.isArray(data.comments) ? data.comments : [];
        if (!comments.length) {
            listEl.innerHTML = `<div class="comments-empty">No comments yet. Be the first.</div>`;
            return;
        }

        // Batch load public user info for avatars (deduped)
        const ids = Array.from(new Set(comments.map(c => (c.userId || '').toString()).filter(Boolean)));
        const missing = ids.filter(id => !__publicUserCache.has(id));
        if (missing.length) {
            try {
                const uRes = await fetch('/api/users/batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: missing })
                });
                const uData = await uRes.json().catch(() => ({}));
                if (uRes.ok && Array.isArray(uData.users)) {
                    for (const u of uData.users) {
                        if (u?.id) __publicUserCache.set(u.id, u);
                    }
                }
            } catch {
                // no-op
            }
        }

        listEl.innerHTML = comments.map((c) => `
            <div class="comment" data-comment-id="${escapeHtml(c.id)}" data-owned="${currentUserId && c.userId === currentUserId ? 'true' : 'false'}">
                <a class="comment-avatar-link" href="/profile?user=${encodeURIComponent(String(c.userId || ''))}" title="View profile">
                    ${(() => {
                        const u = __publicUserCache.get(c.userId) || {};
                        const avatarUrl = (u.avatarUrl || '').toString().trim();
                        const uname = (u.username || c.username || '').toString();
                        const initial = (uname.trim().charAt(0).toUpperCase() || '?');
                        if (avatarUrl) {
                            return `<img class="comment-avatar-img" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(uname)}">`;
                        }
                        return `<span class="comment-avatar-fallback" aria-hidden="true">${escapeHtml(initial)}</span>`;
                    })()}
                </a>
                <div class="comment-meta">
                    <a class="comment-user" href="/profile?user=${encodeURIComponent(String(c.userId || ''))}" title="View profile">${escapeHtml(c.username)}</a>
                    <span class="comment-time">${escapeHtml(new Date(c.createdAt).toLocaleString())}</span>
                </div>
                <div class="comment-text">${escapeHtml(c.text)}</div>
            </div>
        `).join('');
        listEl.scrollTop = listEl.scrollHeight;

        // Right-click menu for own comments
        listEl.oncontextmenu = (e) => {
            const commentEl = e.target?.closest?.('.comment');
            if (!commentEl) return;
            if (commentEl.getAttribute('data-owned') !== 'true') return;
            const commentId = commentEl.getAttribute('data-comment-id');
            if (!commentId) return;

            e.preventDefault();
            const menu = ensureCommentContextMenu();
            menu.dataset.commentId = commentId;
            menu.dataset.seriesId = seriesId;
            menu.dataset.chapterId = chapterId;

            // Position menu within viewport
            const pad = 8;
            const mw = 180;
            const mh = 52;
            let x = e.clientX;
            let y = e.clientY;
            if (x + mw > window.innerWidth - pad) x = window.innerWidth - mw - pad;
            if (y + mh > window.innerHeight - pad) y = window.innerHeight - mh - pad;

            menu.style.left = `${x}px`;
            menu.style.top = `${y}px`;
            menu.style.display = 'block';
        };
    } catch (e) {
        if (String(e?.message || '') === 'COMMENTS_ENDPOINT_MISSING') {
            listEl.innerHTML = `<div class="comments-empty">Comments are disabled because the server is running an older version. Restart the server to enable <code>/api/comments</code>.</div>`;
        } else {
            listEl.innerHTML = `<div class="comments-empty">Failed to load comments.</div>`;
        }
    }
}

async function configureCommentPosting(seriesId, chapterId) {
    const form = __commentsModal?.querySelector('#commentsForm');
    const input = __commentsModal?.querySelector('#commentsInput');
    const hint = __commentsModal?.querySelector('#commentsHint');
    const errEl = __commentsModal?.querySelector('#commentsError');
    if (!form || !input || !hint || !errEl) return;

    errEl.style.display = 'none';
    errEl.textContent = '';

    let loggedIn = false;
    let userId = '';
    try {
        const meRes = await fetch('/api/me');
        const me = await meRes.json();
        loggedIn = !!me.user;
        userId = me.user?.id || '';
    } catch {
        loggedIn = false;
    }

    if (__commentsModal) __commentsModal.dataset.userId = userId;

    form.style.display = loggedIn ? 'flex' : 'none';
    hint.style.display = loggedIn ? 'none' : 'block';

    form.onsubmit = async (e) => {
        e.preventDefault();
        const text = String(input.value || '').trim();
        if (!text) return;

        const sendBtn = form.querySelector('.comments-send');
        if (sendBtn) sendBtn.disabled = true;
        errEl.style.display = 'none';
        errEl.textContent = '';

        try {
            const res = await fetch('/api/comments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ seriesId, chapterId, text })
            });
            if (res.status === 404) throw new Error('COMMENTS_ENDPOINT_MISSING');
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Failed to post');

            input.value = '';
            await loadComments(seriesId, chapterId);
        } catch (e2) {
            if (String(e2?.message || '') === 'COMMENTS_ENDPOINT_MISSING') {
                errEl.textContent = 'Comments are disabled because the server is running an older version. Restart the server to enable /api/comments.';
            } else {
                errEl.textContent = e2.message || 'Failed to post.';
            }
            errEl.style.display = 'block';
        } finally {
            if (sendBtn) sendBtn.disabled = false;
        }
    };

    return loggedIn;
}

function getNavSearchPlaceholder() {
    const path = (window.location?.pathname || '').toLowerCase();
    if (path.includes('chapters')) return 'Search chapters...';
    if (path.includes('account')) return 'Search favorites...';
    return 'Search series...';
}

function setupNavSearch() {
    const navInput = document.getElementById('nav-search-input');
    if (!navInput) return;

    // If a page-specific search exists, keep it hidden but synced so existing filtering logic continues to work.
    const pageSearch = document.getElementById('search-input');
    if (pageSearch) {
        // Sync from nav -> page search
        navInput.addEventListener('input', () => {
            pageSearch.value = navInput.value;
            pageSearch.dispatchEvent(new Event('input', { bubbles: true }));
        });

        // Sync from page search -> nav (if anything else writes to it)
        pageSearch.addEventListener('input', () => {
            if (navInput.value !== pageSearch.value) navInput.value = pageSearch.value;
        });
        return;
    }

    // Account page: filter favorites cards client-side
    const favoritesGrid = document.getElementById('favoritesGrid');
    if (favoritesGrid) {
        navInput.addEventListener('input', () => {
            const q = navInput.value.toLowerCase().trim();
            const cards = Array.from(favoritesGrid.querySelectorAll('.fav-card'));
            cards.forEach((card) => {
                const title = (card.getAttribute('data-title') || '').toLowerCase();
                card.style.display = !q || title.includes(q) ? '' : 'none';
            });
        });
    }
}

async function updateAuthNav() {
    const host = document.getElementById('auth-nav');
    if (!host) return;

    try {
        const res = await fetch('/api/me');
        const data = await res.json();

        if (!data.user) {
            host.innerHTML = `<a href="/auth" class="nav-profile-link nav-profile-cog" aria-label="Account (sign in)">⚙</a>`;
            return;
        }

        const username = (data.user.username || '').toString().trim();
        const initial = (username ? username[0] : 'U').toUpperCase();
        const avatarUrl = (data.user.avatarUrl || '').toString().trim();
        host.innerHTML = `
            <a href="/account" class="nav-profile-link" aria-label="Account">
                ${avatarUrl ? `<img class="nav-profile-img" src="${avatarUrl}" alt="Profile picture">` : `<span class="nav-profile-fallback" aria-hidden="true">${initial}</span>`}
            </a>
        `;
    } catch {
        // If auth endpoint is unavailable, fall back to basic links.
        host.innerHTML = `<a href="/auth" class="nav-profile-link nav-profile-cog" aria-label="Account (sign in)">⚙</a>`;
    }
}

/**
 * Create a series card element
 */
function createSeriesCard(series) {
    const card = document.createElement('div');
    card.className = 'card series-card';
    
    const imageUrl = series.cover || '/content/placeholder.jpg';
    const title = series.name || 'Untitled';
    const author = series.author || 'Unknown Author';
    const description = series.description || '';
    
    card.innerHTML = `
        <div class="card-image">
            ${imageUrl.includes('placeholder') ? '📖' : `<img src="${imageUrl}" alt="${title}" onerror="this.parentElement.innerHTML='📖'">`}
        </div>
        <div class="card-content">
            <div class="card-title">${title}</div>
            <div class="card-author">by ${author}</div>
        </div>
        ${description ? `<div class="card-tooltip">${description}</div>` : ''}
    `;
    
    // Add tooltip mouse tracking
    if (description) {
        const tooltip = card.querySelector('.card-tooltip');
        // Move tooltip to body to avoid stacking context issues
        document.body.appendChild(tooltip);
        
        let updatePosition = (e) => {
            const x = e.clientX;
            const y = e.clientY;
            const offset = 15;
            
            // Make tooltip visible to get dimensions
            tooltip.style.display = 'block';
            tooltip.style.opacity = '0';
            tooltip.style.visibility = 'hidden';
            
            // Force a reflow to get accurate dimensions
            void tooltip.offsetWidth;
            
            const tooltipRect = tooltip.getBoundingClientRect();
            const tooltipWidth = tooltipRect.width || 300;
            const tooltipHeight = tooltipRect.height || 100;
            
            // Calculate position to keep tooltip in viewport
            let left = x + offset;
            let top = y - tooltipHeight - offset;
            
            // Adjust if tooltip would go off right edge
            if (left + tooltipWidth > window.innerWidth - 10) {
                left = x - tooltipWidth - offset;
            }
            
            // Adjust if tooltip would go off left edge
            if (left < 10) {
                left = 10;
            }
            
            // Adjust if tooltip would go off top edge
            if (top < 10) {
                top = y + offset;
            }
            
            // Adjust if tooltip would go off bottom edge
            if (top + tooltipHeight > window.innerHeight - 10) {
                top = window.innerHeight - tooltipHeight - 10;
            }
            
            tooltip.style.left = `${left}px`;
            tooltip.style.top = `${top}px`;
            tooltip.style.opacity = '1';
            tooltip.style.visibility = 'visible';
        };
        
        card.addEventListener('mouseenter', (e) => {
            updatePosition(e);
        });
        card.addEventListener('mousemove', (e) => {
            updatePosition(e);
        });
        card.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
            tooltip.style.opacity = '0';
            tooltip.style.visibility = 'hidden';
        });
    }
    
    card.addEventListener('click', () => {
        window.location.href = `/chapters?series=${series.id}`;
    });

    // Right-click context menu (Favorite / Unfavorite)
    card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openSeriesContextMenu(series.id, e.clientX, e.clientY);
    });
    
    return card;
}

/**
 * Create a chapter card element
 */
function createChapterCard(chapter, seriesId, chapterNumber) {
    const card = document.createElement('div');
    card.className = 'card chapter-card';
    
    const chapterLabel = `Chapter ${chapterNumber}`;
    const rawTitle = (chapter.title || '').toString().trim();
    const sanitizedTitle = sanitizeChapterTitle(rawTitle, chapterNumber);
    const overrideTitle = getChapterTitleOverride(seriesId, chapter?.id);
    const title =
        sanitizedTitle ||
        overrideTitle ||
        (rawTitle && !isOnlyChapterNumberTitle(rawTitle, chapterNumber) ? rawTitle : 'Untitled');
    const hasPageCount = Array.isArray(chapter.pages);
    const pageCount = hasPageCount ? chapter.pages.length : null;
    
    card.innerHTML = `
        <div class="card-content">
            <div class="chapter-number">${chapterLabel}</div>
            <div class="chapter-title">${toSmartTitleCase(title)}</div>
            ${pageCount !== null ? `<div class="chapter-pages">${pageCount} ${pageCount === 1 ? 'page' : 'pages'}</div>` : ''}
        </div>
    `;
    
    card.addEventListener('click', () => {
        window.location.href = `/reader?series=${seriesId}&chapter=${chapter.id}`;
    });
    
    return card;
}

/**
 * Strip duplicated leading chapter number prefixes from a chapter title for display.
 * Examples:
 * - "Chapter 1: Romance Dawn" -> "Romance Dawn"
 * - "Ch. 2 - They Call Him 'Straw Hat Luffy'" -> "They Call Him 'Straw Hat Luffy'"
 * - "2. Romance Dawn" -> "Romance Dawn"
 */
function sanitizeChapterTitle(title, chapterNumber) {
    if (!title) return '';
    const num = String(chapterNumber);
    const escapedNum = num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Match "Chapter 1", "Chapter #1", "Ch 1", "Ch. 1" optionally followed by separators like ":" "-" "–" "—" "."
    const chapterPrefix = new RegExp(
        `^\\s*(?:chapter|ch\\.?)(?:\\s*#)?\\s*${escapedNum}\\s*(?:[:\\-–—\\.]+\\s*)?`,
        'i'
    );

    // Match "1:", "#1 -", "1. " at the start (only when it matches this chapterNumber)
    const numericPrefix = new RegExp(
        `^\\s*#?\\s*${escapedNum}\\s*(?:[:\\-–—\\.]+\\s*)`,
        'i'
    );

    const cleaned = title.replace(chapterPrefix, '').replace(numericPrefix, '').trim();
    return cleaned;
}

function isOnlyChapterNumberTitle(title, chapterNumber) {
    const t = (title || '').toString().trim();
    if (!t) return true;
    const num = String(chapterNumber);
    const escapedNum = num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // "Chapter 3", "Ch. 3", "Ch 3", with optional "#" and surrounding whitespace.
    const onlyWordPrefix = new RegExp(`^(?:chapter|ch\\.?)(?:\\s*#)?\\s*${escapedNum}\\s*$`, 'i');
    // "3" or "#3"
    const onlyNumber = new RegExp(`^#?\\s*${escapedNum}\\s*$`, 'i');

    return onlyWordPrefix.test(t) || onlyNumber.test(t);
}

function getChapterTitleOverride(seriesId, chapterId) {
    if (!seriesId || !chapterId) return '';

    // UI-only overrides (do not modify the underlying JSON data source).
    const chapterNum = parseInt(String(chapterId).replace(/\D/g, ''), 10);
    if (!Number.isFinite(chapterNum)) return '';

    if (seriesId !== 'one-piece') return '';

    return getOnePieceChapterTitle(chapterNum);
}

function getOnePieceChapterTitle(chapterNum) {
    if (chapterNum === 2) return 'That Boy "The Straw Hat Wearing Luffy"';

    // Store as ranged arrays to avoid huge per-chapter object literals.
    const ranges = [
        {
            start: 3,
            titles: [
                'Introducing Pirate Hunter Zoro',
                'Marine Captain "Axe-Hand Morgan"',
                'The Pirate King and the Great Swordsman',
                'The First Person',
                'Friends',
                'Nami',
                'The Devil Fruit',
                'The Incident at the Tavern',
                'Expose',
                'Dog',
                'Treasure',
                'Luffy vs. Buggy',
                'Gong',
                'The Circus Is Coming to Town',
                'Hate',
                'The Pirate Buggy the Clown',
                'Devil Fruit',
                'The Thief',
                'Town',
                'You’re the Captain',
                'Captain Usopp Appears',
                'The Lying Usopp',
                'Lies',
                'Captain Kuro’s Plan',
                'Three Against One',
                'Crescent Moon',
                'Slope',
                'Full Moon',
                'Truth',
                'Kuro of a Hundred Plans',
                'The Pirate Captain, “Captain Kuro”',
                'The Black Cat Pirates',
                'Usopp’s Pirates',
                'After Them!!',
                'Pirates Are Evil?',
                'Pirates Are Good?',
                'For Whom the Bell Tolls',
                'Usopp vs. Kuro',
                'To the Sea',
                'Yosaku and Johnny',
                'Sanji',
                'Three Chefs',
                'Before the Storm',
                'Don’t Underestimate Me',
                'The Grand Line',
                'For the Sake of Dreams',
                'Storm',
                'The Chef’s Decision',
                'Zeff and Sanji',
                'The Chef and the Dishwasher',
                'Sanji and Zeff',
                'Pearl',
                'Jungle Blood',
                'I Won’t Die',
                'I Don’t Want to Die',
                'Showdown',
                'Sanji’s Dream',
                'Battle on the Cliff',
                'Demon',
                'The Man Who Never Smiles',
                'I Won’t Run',
                'The Thousand‐Man Stronghold',
                'Big Mom’s Terrifying Power',
                'Chew',
                'Arlong Park',
                'Pirates of Fish‐Man',
                'Arlong’s Crew',
                'The Great Fish-Man Arlong',
                'Of Monsters and Crooks',
                'Tear Apart',
                'Of Friends and Lies',
                'Business',
                'The Sea Knows',
                'Sleep',
                'Goodbye',
                'Nami’s Tears',
                'Luffy vs. Arlong',
                'Liberation',
                'Isn’t It Nice?',
                'OK, Let’s Stand Up!',
                'Luffy in Black',
                'Zoro vs. Hachi',
                'Three Sword Style',
                'Hero',
                'Pirate vs. Pirate',
                'The End of the Fight',
                'Finally',
                'What Can You Do?',
                'Darts',
                'Happiness',
                'Going Down',
                'Second Hand',
                'Spin, Pinwheel',
                'The Greatest Evil of the East',
                'Kitetsu III',
                'Dark Clouds',
                'Luffy Dies?!',
                'The Legend Begins'
            ]
        },
        {
            start: 101,
            titles: [
                'Reverse Mountain',
                'And Now, the Grand Line',
                'The Whale',
                'Cape Promise',
                'Log Pose',
                'The Town of Welcome',
                'Moonlight Tombstone',
                '100 Bounty Hunters',
                'Rookie',
                'The Island Without a Name',
                'Secret Criminal Organization',
                'Luffy vs. Zoro',
                'Don’t Die',
                'Route 1',
                'Little Garden of Adventure',
                'Giants',
                'Dorry and Brogy',
                'Someone’s Watching',
                'Red Oni Blue Oni',
                'Snake Dance',
                'I’ll Take Care of It',
                'The Sorceress',
                'Luffy vs. Vivi',
                'The Tears of Vivi',
                'Emblem of Faith',
                'Instinct',
                'Telephone Snail',
                'Pirates vs. Bandits',
                'Straight Ahead',
                'Maximum Speed',
                'Drum Kingdom',
                'Doctor',
                'Inheritance',
                'Dr. Kureha',
                'Lapins',
                'Wapol’s Counterattack',
                'Blizzard',
                'Summit',
                'Tough',
                'Snow Tale',
                'The Rebel Army',
                'Smoker the Chaser',
                'Crocodile',
                'Snowy Adventure',
                'Miss Wednesday',
                'Adventure in Alabasta',
                'Operation Utopia',
                'At the End of the Road',
                'Stepping Forward',
                'Royal Tomb',
                'The Battle Begins',
                'Full of Determination',
                'Rainbase',
                'Sir Crocodile',
                'Sir Crocodile vs. Luffy',
                'Okama Way',
                'Ace Arrives',
                'Reach',
                'Rebel Army vs. Royal Army',
                'Spiders Café',
                'Green City Erumalu',
                'Mr. Prince',
                'Rain Dinner',
                'I Love My Country',
                'Operation Utopia Begins',
                'Luffy vs. Crocodile',
                'Battlefront',
                'The Final Battle',
                'Kingdom Collapse',
                'Beginning',
                'KO',
                'Rebellion',
                'Bananawani and Mr. Prince',
                'Mr. Prince’s Plan',
                'Liberation',
                'The True Power',
                '30 Million vs. 81 Million',
                'Union of Dreams',
                'Showdown at Alubarna',
                'Alabasta Ends',
                'Supernova',
                'The First Wave',
                'Upper Yard',
                'Angel Island',
                'Ohm',
                'Trial of Iron',
                'Sky Island',
                'Pirates in the Sky',
                'Full Moon',
                'Thunder God',
                'Giant Jack',
                'Battle Royale',
                'Survival Game',
                'Cut to Pieces',
                'God Eneru',
                'The Golden Belfry',
                '100 Million Man',
                'Luffy vs. Eneru',
                'Hope',
                'Endless Vearth',
                'Knock Up Stream',
                'Bell',
                'Pirate Alliance',
                'Red Line',
                'Heavenly Island',
                'Skypiea Ends',
                'Long Ring Long Land',
                'Davy Back Fight',
                'Round One',
                'Foxy Pirates',
                'Round Two',
                'Groggy Monsters',
                'Round Three',
                'Final Round',
                'Aokiji',
                'Robin’s Past',
                'The Truth',
                'Water Seven',
                'Going Merry',
                'Decision',
                'Luffy vs. Usopp',
                'Departure',
                'Robin Leaves',
                'Sea Train',
                'Secret Plot',
                'Cipher Pol No. 9',
                'The Assassins',
                'Rescue Mission',
                'Runaway',
                'The Train Departs',
                'The Sea Train Battle',
                'Franky Family',
                'Judicial Island',
                'To Enies Lobby',
                'Assault',
                'Gear Second',
                'Rocketman',
                'Declaration of War',
                'Usopp’s Courage',
                'The Giant Guards',
                'Monster',
                'Counterattack',
                'CP9',
                'Zoro vs. Kaku',
                'Sanji vs. Jabra',
                'Franky vs. Fukuro',
                'Robin’s Cry',
                'Stand Up, Robin',
                'The Value of Life',
                'Victory',
                'Going Merry Burns',
                'Farewell',
                'The Thousand Sunny',
                'New Ship',
                'Crew Reunited',
                'Escape',
                'Ohara',
                'Demon Child',
                'Buster Call',
                'End of Enies Lobby',
                'Aftermath',
                'New Bounties',
                'Water Seven Epilogue',
                'Departure Again',
                'Sea of Adventure',
                'Adventure Continues',
                'New World Rumors',
                'Pirate Age',
                'Dreams',
                'Departure',
                'Thriller Bark',
                'Ghost Island',
                'Zombie',
                'Moria',
                'Shadow’s Asgard',
                'Night Battle',
                'The Undying',
                'Luffy vs. Moria',
                'Dawn Approaches',
                'Victory at Dawn',
                'New Allies',
                'Brook',
                'A Musician',
                'Laboon’s Promise',
                'Skeleton’s Song',
                'Shadow Theft',
                'Nightmare Luffy',
                'Final Shadow',
                'Kuma Appears',
                'Nothing Happened',
                'After the Battle',
                'Night’s End',
                'Thriller Bark Ends',
                'New Voyage',
                'Red Hair',
                'Ace vs. Blackbeard',
                'Fate',
                'Darkness',
                'Severed Bonds',
                'The Beginning of the End'
            ]
        },
        {
            start: 301,
            titles: [
                'Here Comes the Boss',
                'Final Showdown',
                'Boss Luffy',
                'Long Island Adventure',
                'Foxy Pirates',
                'Silver Fox',
                'Groggy Ring',
                'Boxing Match',
                'Groggy Monsters',
                'Donut Race',
                'Final Round',
                'Goal!!',
                'Main Event',
                'Combat',
                'Haki',
                'Shanks Appears',
                'Davy Back Fight Ends',
                'Aokiji',
                'The Strongest Man',
                'The Sea Changes',
                'Water Seven',
                'Puffing Tom',
                'City of Water',
                'Franky',
                'Franky Family',
                'Iceberg',
                'Assassins',
                'Love',
                'My Name Is Franky',
                'Battle',
                'Luffy vs. Usopp',
                'Leaving',
                'Robin',
                'The Sea Train',
                'Wave',
                'Cipher Pol No. 9',
                'Cutty Flam',
                'Dark Cloud',
                'Decision',
                'Separation',
                'Demon',
                'CP9',
                'Battlefront',
                'Power',
                'Monster',
                'Franky',
                'Six Powers',
                'Awakening',
                'Luffy',
                'Going Merry',
                'Rocketman',
                'Train Battle',
                'Sea Train',
                'Judicial Island',
                'Spandam',
                'Declaration of War',
                'Cut It',
                'Monster',
                'Carnage',
                'The Value of Life',
                'Oars',
                'Victory',
                'Escape',
                'Farewell',
                'The Thousand Sunny',
                'New Ship',
                'Crew',
                'Sea',
                'Departure',
                'Aftermath',
                'New Bounties',
                'Home',
                'Reunion',
                'Hero',
                'Pirates',
                'New World',
                'Adventure',
                'Rumors',
                'Dreams',
                'Departure',
                'Thriller Bark',
                'Ghost Island',
                'Zombie',
                'Shadow',
                'Hogback',
                'Cindry',
                'Monster Trio',
                'Gecko Moria',
                'Nightmare',
                'Shadow’s Asgard',
                'Tyrant Kuma',
                'The Undying',
                'Luffy vs. Moria',
                'Dawn',
                'Oars Defeated',
                'After the Battle',
                'Nothing Happened',
                'New Journey',
                'Red Hair',
                'Ace vs. Blackbeard',
                'Duel',
                'Fate',
                'Darkness',
                'Showdown',
                'Bonds',
                'End',
                'Beginning',
                'Arrival',
                'Island',
                'Amazons',
                'Amazon Lily',
                'Kuja Pirates',
                'Snake Princess',
                'Boa Hancock',
                'Love',
                'Enemy',
                'Power',
                'Luffy vs. Sisters',
                'Judgment',
                'Escape',
                'Impel Down',
                'Gate',
                'Hell',
                'Jailers',
                'Warden',
                'Magellan',
                'Poison',
                'Chaos',
                'Escape',
                'Freedom',
                'New Prisoners',
                'Bon Clay',
                'Allies',
                'Level 6',
                'Blackbeard',
                'Worst Prison',
                'Riot',
                'Breakout',
                'Battle',
                'Impel Down Falls',
                'Marineford',
                'War',
                'Whitebeard',
                'Execution',
                'Powerhouses',
                'Clash',
                'Pirates vs Marines',
                'Chaos',
                'Ace',
                'Fire Fist',
                'Desperation',
                'Luffy Arrives',
                'Brothers',
                'Rescue',
                'Betrayal',
                'Magma',
                'Death',
                'End of War',
                'Aftermath',
                'Shock',
                'New Era',
                'Loss',
                'Resolve',
                'Farewell',
                'Training',
                'Rayleigh',
                'Two Years',
                'Promise',
                'Timeskip',
                'Reunion',
                'Sabaody',
                'Return',
                'New Looks',
                'Pacifista',
                'Fake Straw Hats',
                'Real Crew',
                'Battle',
                'Departure',
                'New World',
                'Underwater',
                'Fish-Man Island',
                'Sea Forest',
                'Princess',
                'Hody Jones',
                'Hatred',
                'Noah',
                'Poseidon',
                'Battle Begins',
                'Luffy vs. Hody',
                'Blood',
                'History',
                'Truth',
                'Promise',
                'War',
                'Victory',
                'Banquet',
                'Departure',
                'Toward the New World',
                'Next Adventure',
                'New Era',
                'Punk Hazard',
                'Island of Fire and Ice',
                'Gas',
                'Caesar Clown',
                'Experiment',
                'Children',
                'Alliance',
                'Law',
                'Samurai',
                'Plan',
                'SAD',
                'Smile',
                'Shinokuni',
                'Escape',
                'Battle',
                'Victory',
                'Alliance Confirmed',
                'Departure',
                'Toward Dressrosa',
                'New Threat',
                'Dressrosa',
                'Toy Soldier',
                'Colosseum',
                'Tournament',
                'Lucy',
                'Gladiators',
                'Donquixote Doflamingo',
                'Strings',
                'Power',
                'Chaos',
                'Revolution',
                'Smile Factory',
                'Destruction',
                'Memories',
                'Truth',
                'Law’s Past',
                'Corazon',
                'Brothers',
                'Final Battle',
                'King',
                'Luffy vs. Doflamingo',
                'Gear Fourth',
                'King Kong Gun',
                'Victory',
                'Aftermath',
                'New Bounties',
                'Separation',
                'Toward Zou',
                'Elephant Island',
                'Arrival',
                'Zou',
                'Minks',
                'Jack',
                'Road Poneglyph',
                'Alliance',
                'Big Mom',
                'Sanji',
                'Invitation',
                'Departure',
                'Rescue',
                'Whole Cake Island',
                'Sweet City',
                'Charlotte Family',
                'Pudding',
                'Wedding',
                'Betrayal',
                'Escape',
                'Sanji’s Past',
                'Germa',
                'Judge',
                'Assassin',
                'Cake',
                'Big Mom',
                'Chase',
                'Katakuri',
                'Mirror World',
                'Luffy vs. Katakuri',
                'Future Sight',
                'Victory',
                'Escape',
                'Aftermath',
                'Reunion',
                'New Bounties',
                'Toward Wano',
                'Land of Samurai',
                'Arrival',
                'Kaido',
                'Defeat',
                'Prison',
                'Training',
                'Alliance',
                'Udon',
                'Haki',
                'Liberation',
                'Battle',
                'Oden',
                'Past',
                'Legend',
                'Promise',
                'Beginning of the War'
            ]
        },
        {
            start: 601,
            titles: [
                'Romance Dawn for the New World',
                'Beyond the Bottom of the Sea',
                'Keep Quiet',
                'Toward the Sun',
                'Kraken and Crush',
                'Deep-Sea Adventure',
                '100,000 vs. 10',
                'Underwater Paradise',
                'Tiger’s Rampage',
                'Madam Shirley’s Prediction',
                'Hody Jones',
                'Steroids',
                'Hardening',
                'To the Fish-Man Island Palace',
                'Mark of the Sun',
                'Ann’s Past',
                'Coral Hill',
                'Proposal',
                'Justice',
                'Otohime and Tiger',
                'Fisher Tiger',
                'The Last Wish',
                'Tiger vs. Queen',
                'Sea Forest',
                'Oath',
                'Neptune Brothers',
                'Luffy vs. Hody',
                'Flashback',
                'Former Shichibukai',
                'Dragon Palace Collapses',
                'Gyro',
                'Knowing',
                'Friend or Foe',
                '100,000 vs. 1',
                'Hody Defeated',
                'General from the Land of the Future',
                'Ancient Weapon',
                'Escape',
                'Big News',
                'To the New World',
                'The Name of This Era Is “Whitebeard”',
                'Too Early to Count',
                'Phantom',
                'To the New World',
                'Death Match',
                'Frog in the Well',
                'Stop It',
                '100 Million vs. 1,000',
                'Pirate Alliance',
                'Two Changes',
                'The Pirate Alliance',
                'New World’s Rules',
                'Hero’s Hat',
                'Law’s Proposal',
                'Punk Hazard',
                'Smiley',
                'Udon and Ice',
                'A Major Incident',
                'The Worst',
                'Shichibukai Law',
                'The Samurai of Wano',
                'Warlord Law',
                'CC',
                'Mastermind',
                'Candy',
                'Yeti Cool Brothers',
                'Cool Fight',
                'Pirate Alliance Strategy',
                'Vice Admiral Smoker',
                'Dragon’s Claw',
                'Gas-Gas Fruit',
                'Vergo',
                'Vergo vs. Smoker',
                'Law vs. Vergo',
                'Shinokuni',
                'Escape from Punk Hazard',
                'Counterattack',
                'Caesar’s Defeat',
                'Toward Dressrosa',
                'Arrival',
                'Smile',
                'Land of Passion, Dressrosa',
                'Welcome to Dressrosa',
                'The Gypsy Woman',
                'Round 1',
                'Gyats',
                'Lucy',
                'The Coliseum',
                'A Gladiator’s Resolve',
                'SAD Factory',
                'King of the Pirates’ Dream',
                'Assassination Attempt',
                'The Tontatta Tribe',
                'Princess of the Dwarves',
                'Leaf of Love',
                'Commander',
                'Bowing Down',
                'Doflamingo Appears',
                'The Battle Begins',
                'His Name Is Fujitora',
                'Adventure in Dressrosa',
                'Corrida Coliseum',
                'Waiting Room',
                'Lucy and Moocy',
                'Maynard the Pursuer',
                'Battle Royale',
                'Block B',
                'Colosseum Chaos',
                'King Punch',
                'Opening the Curtain',
                'Adventure in the Land of Love',
                'Violet',
                'Usoland',
                'Lucy and the Donquixote Family',
                'Battlefield',
                'Donquixote Doflamingo',
                'Dressrosa’s Forgotten Past',
                'Toys',
                'Opening of the Factory',
                'Prison',
                'Law',
                'Royal Bloodline',
                'Change of Plans',
                'Law vs. Trebol',
                'The Forgotten',
                'Tragedy',
                'One Piece',
                'A Promise',
                'Execution',
                'Three Cards',
                'Operation SOP',
                'Underground World',
                'The Revolutionary Army',
                'Fujitora vs. Sabo',
                'Commander-in-Chief',
                'Officer Tower',
                'Kyros',
                'Sugar',
                'Collapse',
                'Admiral Fujitora',
                'The Birdcage',
                'Usopp the Hero',
                'Dressrosa Trembles',
                'The Revolutionary Chief of Staff',
                'Straw Hat Luffy',
                'Star of Hope',
                'Supreme Leader',
                'My Battle',
                'Gear Fourth',
                'The Force That Binds',
                'Sabo vs. Burgess',
                'Palm',
                'Kyros’ Resolution',
                'Revolutionary Army',
                'A Man’s World',
                'Stars',
                'Justice',
                'Donquixote Doflamingo',
                'Victory',
                'The Town',
                'The Ultimate',
                'White Hot Battle',
                'Declaration',
                'The End',
                'The Aftermath',
                'New World News',
                'Coincidence',
                'Limit',
                'The Fifth Emperor',
                'Spear',
                'Adventure Begins',
                'Zou',
                'Emergency',
                'The Mink Tribe',
                'Zunesha',
                'Elephant Island',
                'Zunesha’s Crime',
                'The World',
                'Command',
                'Curse',
                'Zou’s Secret',
                'Road Poneglyph',
                'Sanji’s Whereabouts',
                'Alliance',
                'Sanji’s Decision',
                'Gypsy Woman',
                'Promise',
                'The Devil’s Fruit',
                'Whole Cake Island',
                'Emperor',
                'Dessert',
                'Army',
                'Big Mom',
                'The Queen',
                'The Enemy',
                'Soldier',
                'Threat',
                'Plan',
                'Final Preparations',
                'Execution',
                'Emperor of the Sea',
                'Sanji’s Past',
                'Germa 66',
                'East Blue',
                'Betrayal',
                'Fate',
                'Reunion',
                'Luffy vs. Sanji',
                'Separation',
                'End',
                'Rook',
                'Assassin',
                'Tea Party',
                'End of the Line',
                'Take Me with You',
                'Dog-End',
                'Raid',
                'Here Come the Waves',
                'Chopper and Carrot',
                'Beyond the Emperor',
                'Another Emperor',
                'Descendants',
                'World',
                'Plan',
                'Tamate Box',
                '0 and 4',
                'Totto Land',
                'Luffy vs. Cracker',
                'Mirror World',
                'A Man’s Duty',
                'Promise',
                'Kingdom',
                'Vinsmoke Judge',
                'Wedding',
                'Betrayal',
                'Mother',
                'Luffy vs. Katakuri',
                'The Secret',
                'Arms',
                'Iron Body',
                'East Blue Again',
                'The Power of Hunger',
                'Gear Fourth',
                'Luffy vs. Sanji',
                'Rage',
                'The Emperor’s Dream',
                'Farewell',
                'Goodbye',
                'Beyond the Sea',
                'Departure',
                'Germa’s Failure',
                'Fight',
                'Emperor',
                'Revenge',
                'Morgans',
                'Big News',
                'Rook',
                'Reunion',
                'Yonkou',
                'Toward Wano',
                'Emperor',
                'Tea Party',
                'Knights',
                'Surprise',
                'Awakening',
                'Nightmare',
                'Escape',
                'Return Fire',
                'Soul',
                'End',
                'The Man Who Will Become Pirate King',
                'Katakuri',
                'Special Paramecia',
                'Snakeman',
                'A Woman’s Honor',
                'Pudding',
                'Farewell',
                'Reunion',
                'Big Mom Pirates',
                'The Final',
                'Toward the Reverie',
                'Goodbye',
                'The Dream of One Man',
                'Who',
                'The Way',
                'Holy Land',
                'Reverie',
                'World Conference',
                'Princess',
                'Assassination Attempt',
                'Beloved',
                'World Nobles',
                'Stronghold',
                'Army',
                'Alliance',
                'The Enemy',
                'End',
                'The World',
                'Toward Wano',
                'Bad End Musical'
            ]
        },
        {
            start: 901,
            titles: [
                'Beasts',
                'End Roll',
                'Fifth Emperor',
                'Luffy vs. Kaido',
                'Prophecy',
                'Holy Land Mary Geoise',
                'The Empty Throne',
                'Reverie',
                'Seppuku',
                'Onward to Wano',
                'Adventure in the Land of Samurai',
                'Amigasa Village',
                'Tsuru',
                'Okobore Town',
                'Bakura Town',
                'Great Sumō Inferno Tournament',
                'Food Shortage',
                'Luffy vs. Holdem',
                'Ruins of Oden Castle',
                'Memories',
                'Shutenmaru',
                'The Stars Take the Stage',
                'Emperor Kaido vs. Luffy',
                'Haki in the Land of Wano',
                'The Blank',
                'Prisoner Mine',
                'Otoko',
                'Introducing Komurasaki the Oiran',
                'Wano Country Shogun Orochi',
                'Ebisu Town',
                'Big Mom',
                'Shogun and Oiran',
                'A Warrior’s Mercy',
                'Hyogoro the Flower',
                'Queen',
                'Sumō Inferno',
                'Gyukimaru on Oihagi Bridge',
                'Her Secret',
                'Old Man Hyo',
                'Spark of Rebellion',
                'The Star of Ebisu',
                'The Daimyo of Hakumai, Shimotsuki Yasuie',
                'SMILE',
                'Partner',
                'O-Lin',
                'Queen vs. Big Mom',
                'Queen’s Gamble',
                'Introducing Kawamatsu the Kappa',
                'Mummy',
                'A Soldier’s Dream',
                'Rampage',
                'Hiyori and Kawamatsu',
                'Once Upon a Fox',
                'Like a Dragon',
                'Enma',
                'Big News',
                'Ultimate',
                'Promised Port',
                'Samurai',
                'Oden Kozuki',
                'The Man Who Danced',
                'Whitebeard',
                'Becoming Samurai',
                'Oden’s Adventure',
                'The Kurozumi Clan',
                'Roger and Whitebeard',
                'Roger’s Adventure',
                'Oden’s Return',
                'The Fool of a Lord',
                'Oden vs. Kaido',
                'Boiled Alive',
                'I Am Oden, and I Was Born to Boil',
                'Kozuki Clan',
                'Onward to Onigashima',
                'Kurozumi Orochi’s Plot',
                'Let’s Go to Onigashima!!',
                'Party’s Off!!',
                'Introducing the Tobi Roppo',
                'Family Problem',
                'Fighting Music',
                'Joining the Fight',
                'Scoundrel',
                'Thunder',
                'My Bible',
                'New Onigashima Project',
                'My Name',
                'War',
                'Sorry for the Wait',
                'I Don’t Feel Like We’re Losing',
                'Isolation',
                'Let Us Die!!!',
                'Remnants',
                'Wano’s Dream',
                'My Other Name Is Yamato',
                'Kin’emon’s Clever Trick',
                'Island of the Strongest',
                'Flames',
                'Ancient Types',
                'The Sake I Brewed While Waiting for You',
                'Straw Hat Luffy',
                'Battle of Monsters on Onigashima',
                'Yonko vs. the New Generation',
                'Night on the Board',
                'Kibi Dango',
                'Demon Child',
                'The Chivalrous “Hyougorou of the Flowers”',
                'Tanuki-san',
                'Atamayama Bandits Leader, Ashura Douji',
                'Hell',
                'Dynasty Traits',
                'The Moral Code of Anko',
                'Itch',
                'Anarchy in the BM',
                'The Ham Actor of Life',
                'Chains',
                'This Is Otama!!',
                'Order',
                'Jinbe vs. Who’s Who',
                'Heliceratops',
                'Robin vs. Black Maria',
                'Demonio',
                'Introducing the Hanagata',
                'Like Two Peas in a Pod',
                'So-and-so',
                'Twin Dragons Painting',
                'Crucial Time',
                'A Crisis Beyond Imagination',
                'Brachiosaurus',
                'Tower',
                'Echoes the Impermanence of All Things',
                'Warrior of Science',
                'Oden’s Cherished Sword',
                'Shimotsuki Kouzaburou',
                'Sanji vs. Queen',
                'Zoro vs. King',
                'Bushido Is Found in Death',
                'Shuron Hakke',
                'Kid & Law vs. Big Mom',
                'Ootori',
                'Praying Into Brats’ Ear',
                'Komurasaki',
                'Poetic Epithets Don’t Match With the “Winners”',
                'Let’s Die Together!!!',
                'Warrior of Liberation',
                'Next Level',
                'Raizou',
                'The Capital’s Sky',
                'Twenty Years',
                'A World to Aim For',
                'Honor',
                'Shogun of Wanokuni, Kouzuki Momonosuke',
                'A New Morning',
                'The New Emperors',
                'Entei',
                'New Era',
                'Cross Guild',
                'The End',
                'New Emperor',
                'Captain Koby’s Case',
                'Luffy’s Dream',
                'Future Island, Egghead',
                'Adventure in the Land of Science',
                'My Only Family',
                'Egghead, Labo Phase',
                'Six Vegapunk',
                'Ohara’s Will',
                'Punk Records',
                'A Genius’ Dream',
                'All Things That Are Desired Are Born in This World',
                'The Strongest Human Race',
                'Hero Sortie',
                'The Weight of Memory',
                'Miss Buckingham Stussy',
                'Mark III',
                'Labo Phase Death Game',
                'Old Friends',
                'Should Have Noticed Sooner',
                'Escape Limit',
                'The “Yonkou” Akagami Pirates',
                'The Legendary Hero',
                'Tenth Ship Captain of the Kurohige Pirates, Kuzan',
                'Let’s Go Get It!!',
                'The Truth About That Day',
                'The Attempted Murder of a Tenryuubito',
                'Nefertari Cobra Dies',
                'Gorousei',
                'Battleship Bags',
                'Last Lesson',
                'The Barricading Incident',
                'Kizaru',
                'Sentoumaru',
                'The Tyrant Kuma Rampage on the Holy Land Incident',
                'Luffy vs. Kizaru',
                '“Gorousei” Warrior God of Defense Science, Jay Garcia Saturn-sei',
                'A World Where You Are Better Off Dead',
                'Kumachi',
                'Ginny',
                'Bonney’s Birth',
                'Pacifist',
                'Thanks, Bonney'
            ]
        },
        {
            start: 1101,
            titles: [
                'To Bonney',
                'Kuma’s Life',
                'Sorry, Daddy',
                'Thanks, Daddy',
                'The Height of Folly',
                'On Your Side',
                'I Have Been Looking for You!!',
                'Answer, World',
                'Interception',
                'Starfall',
                'Sun Shield',
                'Hard Aspect',
                'Stalemate',
                'The Wings of Icarus',
                'Continental Fragments',
                'Conflict',
                'Mo',
                'Be Free',
                'Emeth',
                'Atlas',
                'The Swell of an Age',
                'When the Time Is Right',
                'The Two Void Weeks',
                'Best Friend',
                'What Death Means',
                'Settling the Score',
                'Adventure in the Land of Mystery',
                'RPG',
                'Liv Doll',
                'The Accursed Prince',
                'Loki of the Underworld',
                'Adventure in Elbaph',
                'I Want You to Praise Me',
                'The Owl Library',
                'Friends’ Sakazuki',
                'The Land That Awaits Sun',
                'Introducing Shamrock',
                'Harley',
                'Mountain-Eater',
                'Scopper Gaban',
                'An Older Woman',
                'What I’m Afraid Of',
                'Holy Knights',
                'A Time for Warriors',
                'Fire at the 2nd Forest Area on Branch Route 8',
                'Within Stillness, There Is Motion',
                'What We’re Afraid Of',
                'Ronja',
                'One Second',
                'Domi Reversi',
                'That’s Enough, I Got the Idea!!',
                'A Horrible Day',
                'The Birth of Loki',
                'I Can’t Even Die',
                'The Rocks Pirates',
                'Idols',
                'The Legendary Bar',
                'Rocks vs. Harald',
                'The Island of Fate',
                'The God Valley Incident',
                'A Song of Love Bound Under a Hail of Arrows',
                'God Valley Battle Royale',
                'Promise',
                'Davy’s Blood',
                'Reverberations',
                'New Stories',
                'Ida’s Son',
                'The Snows of Elbaph'
            ]
        }
    ];

    for (const r of ranges) {
        if (chapterNum < r.start) continue;
        const idx = chapterNum - r.start;
        if (idx >= 0 && idx < r.titles.length) return r.titles[idx];
    }

    return '';
}

function toSmartTitleCase(input) {
    const str = (input || '').toString().trim();
    if (!str) return '';

    // Preserve words exactly as-is for acronyms / IDs.
    const preserveExact = new Set(['OK', 'RPG', 'CP9', 'SMILE', 'SAD']);
    const lowerWords = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'the', 'to']);

    const tokens = str.split(/(\s+)/); // keep whitespace

    // Identify word positions (first/last) ignoring whitespace tokens.
    const wordTokenIdxs = [];
    for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        if (!tok || /^\s+$/.test(tok)) continue;
        if (/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(tok)) wordTokenIdxs.push(i);
    }
    const firstWordTokIdx = wordTokenIdxs[0];
    const lastWordTokIdx = wordTokenIdxs[wordTokenIdxs.length - 1];

    return tokens.map((tok, i) => {
        if (!tok || /^\s+$/.test(tok)) return tok;

        // Split leading/trailing punctuation so we can case the core word.
        const m = tok.match(/^([("'“‘\[{<]*)(.*?)([)"'”’\]}>.,!?;:]*)$/);
        if (!m) return tok;
        const [, lead, coreRaw, trail] = m;
        const core = coreRaw || '';

        // If it has no letters, don't touch it.
        if (!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(core)) return tok;

        const coreStripped = core.replace(/^[#]+/, '');
        const upperKey = coreStripped.toUpperCase();

        // Roman numerals: keep as uppercase.
        if (/^(?:[IVXLCDM]+)$/.test(upperKey)) {
            return `${lead}${upperKey}${trail}`;
        }

        // Preserve alphanumeric tokens (e.g., "2nd", "100,000", "Mark III")
        if (/\d/.test(coreStripped)) return tok;

        if (preserveExact.has(upperKey)) {
            return `${lead}${upperKey}${trail}`;
        }

        const lowerKey = coreStripped.toLowerCase();
        const isFirstWord = i === firstWordTokIdx;
        const isLastWord = i === lastWordTokIdx;

        // Keep "vs" / "vs." lowercase, ensuring we don't double-add a dot.
        if (lowerKey === 'vs' || lowerKey === 'vs.') {
            const hasDot = trail.includes('.');
            const newTrail = trail.replace('.', '');
            return `${lead}vs${hasDot ? '.' : ''}${newTrail}`;
        }

        // Small words lowercased unless first/last word.
        if (!isFirstWord && !isLastWord && lowerWords.has(lowerKey)) {
            return `${lead}${lowerKey}${trail}`;
        }

        // Default: Title-case the word, respecting apostrophes (Davy’s, I’m, Don’t)
        const parts = core.split(/(['’])/);
        const suffixesToKeepLower = new Set(['s', 't', 'm', 'd', 're', 've', 'll']);
        const cased = parts.map((p) => {
            if (p === '\'' || p === '’') return p;

            // If this segment follows an apostrophe and is a common suffix, keep it lowercase.
            // Example: "Davy’s" => ["Davy", "’", "s"] -> "Davy’s" (not "Davy’S")
            const prev = parts[parts.indexOf(p) - 1];
            if ((prev === '\'' || prev === '’') && suffixesToKeepLower.has(p.toLowerCase())) {
                return p.toLowerCase();
            }

            return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
        }).join('');

        return `${lead}${cased}${trail}`;
    }).join('');
}

/**
 * Show loading state
 */
function showLoading(container) {
    container.innerHTML = '<div class="loading">Loading...</div>';
}

/**
 * Show empty state
 */
function showEmptyState(container, message = 'No content available') {
    container.innerHTML = `
        <div class="empty-state">
            <h2>${message}</h2>
            <p>Check back later for new content!</p>
        </div>
    `;
}

/**
 * Get URL parameter
 */
function getUrlParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}
