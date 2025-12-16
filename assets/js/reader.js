// Manga reader functionality

let currentSeries = null;
let currentChapter = null;
let currentPageIndex = 0;
let pages = [];
let keyboardListenerAttached = false;
let isLoggedInForProgress = false;
let leftOffTimer = null;

document.addEventListener('DOMContentLoaded', () => {
    insertNavigation();
    initReader();
});

async function initReader() {
    const seriesId = getUrlParameter('series');
    const chapterId = getUrlParameter('chapter');
    const pageParam = getUrlParameter('page');
    
    if (!seriesId) {
        document.body.innerHTML = '<div class="container"><h1>Series not found</h1></div>';
        return;
    }
    
    currentSeries = await getSeriesById(seriesId);
    if (!currentSeries) {
        document.body.innerHTML = '<div class="container"><h1>Series not found</h1></div>';
        return;
    }
    
    // Get chapters
    // Use stable numeric sorting (ch1, ch2, ...) when possible
    currentSeries.chapters = getSortedChapters(currentSeries.chapters || []);
    const chapters = currentSeries.chapters || [];
    if (chapters.length === 0) {
        document.body.innerHTML = '<div class="container"><h1>No chapters available</h1></div>';
        return;
    }
    
    currentChapter = chapterId 
        ? chapters.find(ch => ch.id === chapterId) 
        : chapters[0];
    
    if (!currentChapter) {
        currentChapter = chapters[0];
    }
    
    pages = currentChapter.pages || [];
    const requestedPage = pageParam ? parseInt(pageParam, 10) : 1;
    const requestedIdx = Number.isFinite(requestedPage) ? Math.max(requestedPage - 1, 0) : 0;
    currentPageIndex = pages.length ? Math.min(requestedIdx, pages.length - 1) : 0;

    // Track recently viewed chapter (only if logged in; endpoint requires auth)
    try {
        const meRes = await fetch('/api/me');
        const me = await meRes.json();
        isLoggedInForProgress = !!me.user;
        if (isLoggedInForProgress) {
            trackRecent('chapter', seriesId, currentChapter.id);
            queueSaveLeftOff(seriesId, currentChapter.id);
        }
    } catch {
        // no-op
    }
    
    renderReader();
}

function renderReader() {
    const container = document.querySelector('.reader-container') || document.body;
    
    const chapters = currentSeries.chapters || [];
    const currentChapterIndex = chapters.findIndex(ch => ch.id === currentChapter.id);
    const hasPrev = currentPageIndex > 0 || currentChapterIndex > 0;
    const hasNext = (pages.length > 0 && currentPageIndex < pages.length - 1) || currentChapterIndex < chapters.length - 1;
    
    const seriesName = currentSeries.name || 'Unknown Series';
    const seriesId = currentSeries?.id || getUrlParameter('series');
    const currentChapterLabel = getChapterDisplayLabel(currentChapter, currentChapterIndex, seriesId);
    
    container.innerHTML = `
        <div class="reader-controls">
            <div class="reader-left">
                <button onclick="window.location.href='/chapters?series=${seriesId}'" class="reader-btn">← Back to Chapters</button>
                <button onclick="openComments()" type="button" class="reader-btn reader-icon-btn" aria-label="Comments" title="Comments">
                    <img src="/assets/images/comments.png" class="reader-icon-img" alt="" aria-hidden="true">
                </button>
            </div>
            <div class="reader-center">
                <select id="chapterSelect" onchange="changeChapter(this.value)" aria-label="Select chapter">
                    ${chapters.map((ch, idx) => 
                        `<option value="${ch.id}" ${ch.id === currentChapter.id ? 'selected' : ''}>
                            ${getChapterDisplayLabel(ch, idx, seriesId)}
                        </option>`
                    ).join('')}
                </select>
            </div>
            <div class="reader-right">
                <button onclick="previousPage()" class="reader-btn" ${!hasPrev ? 'disabled' : ''}>← Previous</button>
                <button onclick="nextPage()" class="reader-btn" ${!hasNext ? 'disabled' : ''}>Next →</button>
            </div>
        </div>
        <div class="manga-page-container" id="pageContainer">
            ${pages.length > 0 ? 
                `<img src="${pages[currentPageIndex]}" alt="Page ${currentPageIndex + 1}" class="manga-page" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22600%22%3E%3Crect fill=%22%23ddd%22 width=%22400%22 height=%22600%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23999%22%3EPage not found%3C/text%3E%3C/svg%3E'">` 
                : '<div class="empty-state">No pages available</div>'
            }
        </div>
    `;
    
    // Add click handler for page navigation
    const pageContainer = document.getElementById('pageContainer');
    if (pageContainer) {
        pageContainer.addEventListener('click', handlePageClick);
    }
    
    // Keyboard navigation
    if (!keyboardListenerAttached) {
        document.addEventListener('keydown', handleKeyboard);
        keyboardListenerAttached = true;
    }
}

function openComments() {
    try {
        const chapters = currentSeries?.chapters || [];
        const idx = chapters.findIndex(ch => ch.id === currentChapter?.id);
        const label = getChapterDisplayLabel(currentChapter, idx >= 0 ? idx : 0, currentSeries?.id || getUrlParameter('series'));
        if (typeof openChapterComments === 'function') {
            openChapterComments(currentSeries?.id || getUrlParameter('series'), currentChapter?.id, label);
        }
    } catch {
        // no-op
    }
}

function handlePageClick(e) {
    const container = e.currentTarget;
    const containerRect = container.getBoundingClientRect();
    const clickX = e.clientX - containerRect.left;
    const containerWidth = containerRect.width;
    
    // If click is on the left half, go to previous page
    // If click is on the right half, go to next page
    if (clickX < containerWidth / 2) {
        previousPage();
    } else {
        nextPage();
    }
}

function handleKeyboard(e) {
    if (e.key === 'ArrowLeft') {
        previousPage();
    } else if (e.key === 'ArrowRight') {
        nextPage();
    }
}

function previousPage() {
    if (currentPageIndex > 0) {
        currentPageIndex--;
        updatePageInUrl(currentPageIndex + 1);
        queueSaveLeftOff(currentSeries?.id || getUrlParameter('series'), currentChapter?.id);
        renderReader();
        window.scrollTo(0, 0);
        return;
    }

    // At first page: go to previous chapter (last page)
    goToAdjacentChapter(-1);
}

function nextPage() {
    if (currentPageIndex < pages.length - 1) {
        currentPageIndex++;
        updatePageInUrl(currentPageIndex + 1);
        queueSaveLeftOff(currentSeries?.id || getUrlParameter('series'), currentChapter?.id);
        renderReader();
        window.scrollTo(0, 0);
        return;
    }

    // At last page: go to next chapter (first page)
    goToAdjacentChapter(1);
}

async function changeChapter(chapterId) {
    const chapters = currentSeries.chapters || [];
    currentChapter = chapters.find(ch => ch.id === chapterId);
    if (currentChapter) {
        pages = currentChapter.pages || [];
        currentPageIndex = 0;
        updateChapterInUrl(currentChapter.id);
        updatePageInUrl(1);
        queueSaveLeftOff(currentSeries?.id || getUrlParameter('series'), currentChapter?.id);
        renderReader();
        window.scrollTo(0, 0);
    }
}

function goToAdjacentChapter(direction) {
    const chapters = currentSeries.chapters || [];
    const currentChapterIndex = chapters.findIndex(ch => ch.id === currentChapter.id);
    if (currentChapterIndex < 0) return;

    const nextIndex = currentChapterIndex + direction;
    if (nextIndex < 0 || nextIndex >= chapters.length) return;

    currentChapter = chapters[nextIndex];
    pages = currentChapter.pages || [];
    currentPageIndex = direction < 0 ? Math.max((pages.length || 1) - 1, 0) : 0;

    updateChapterInUrl(currentChapter.id);
    updatePageInUrl(currentPageIndex + 1);
    queueSaveLeftOff(currentSeries?.id || getUrlParameter('series'), currentChapter?.id);
    renderReader();
    window.scrollTo(0, 0);
}

function updateChapterInUrl(chapterId) {
    try {
        const url = new URL(window.location.href);
        url.searchParams.set('chapter', chapterId);
        window.history.replaceState({}, '', url.toString());
    } catch (e) {
        // no-op
    }
}

function updatePageInUrl(page) {
    try {
        const url = new URL(window.location.href);
        url.searchParams.set('page', String(page));
        window.history.replaceState({}, '', url.toString());
    } catch (e) {
        // no-op
    }
}

function queueSaveLeftOff(seriesId, chapterId) {
    if (!isLoggedInForProgress) return;
    if (!seriesId || !chapterId) return;

    if (leftOffTimer) clearTimeout(leftOffTimer);
    leftOffTimer = setTimeout(() => {
        saveLeftOff(seriesId, chapterId, currentPageIndex, pages.length);
    }, 400);
}

function getSortedChapters(chapters) {
    const list = Array.isArray(chapters) ? [...chapters] : [];
    list.sort((a, b) => {
        const na = parseInt(String(a?.id || '').replace(/\D/g, ''), 10) || 0;
        const nb = parseInt(String(b?.id || '').replace(/\D/g, ''), 10) || 0;
        return na - nb;
    });
    return list;
}

function getChapterNumberForDisplay(chapter, index) {
    const fromId = parseInt(String(chapter?.id || '').replace(/\D/g, ''), 10);
    return Number.isFinite(fromId) && fromId > 0 ? fromId : index + 1;
}

function getChapterDisplayLabel(chapter, index, seriesId) {
    const chapterNumber = getChapterNumberForDisplay(chapter, index);
    const rawTitle = (chapter?.title || '').toString().trim();
    const stripped = stripLeadingChapterPrefix(rawTitle, chapterNumber);
    // Prefer shared UI override map from ui.js (loaded before reader.js on reader page)
    const overrideTitle = typeof getChapterTitleOverride === 'function'
        ? getChapterTitleOverride(seriesId, chapter?.id)
        : '';

    // If there's no meaningful title (empty, or only a "Chapter X" prefix), render just "Chapter X"
    if (!stripped && !overrideTitle) {
        return `Chapter ${chapterNumber}`;
    }

    const displayTitleRaw = stripped || overrideTitle;
    const displayTitle = typeof toSmartTitleCase === 'function' ? toSmartTitleCase(displayTitleRaw) : displayTitleRaw;
    return `Chapter ${chapterNumber}: ${displayTitle}`;
}

function stripLeadingChapterPrefix(title, chapterNumber) {
    if (!title) return '';
    const num = String(chapterNumber);
    const escapedNum = num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // "Chapter 1:", "Chapter #1 -", "Ch. 1 —", etc.
    const chapterPrefix = new RegExp(
        `^\\s*(?:chapter|ch\\.?)(?:\\s*#)?\\s*${escapedNum}\\s*(?:[:\\-–—\\.]+\\s*)?`,
        'i'
    );

    // "1:", "#1 -", "1. " at the start (only when it matches this chapterNumber)
    const numericPrefix = new RegExp(
        `^\\s*#?\\s*${escapedNum}\\s*(?:[:\\-–—\\.]+\\s*)`,
        'i'
    );

    return title.replace(chapterPrefix, '').replace(numericPrefix, '').trim();
}

// Make functions globally available
window.previousPage = previousPage;
window.nextPage = nextPage;
window.changeChapter = changeChapter;
window.openComments = openComments;
