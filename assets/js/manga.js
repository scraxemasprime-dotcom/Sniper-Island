// Manga page functionality

let allSeries = [];
let currentGrid = null;

document.addEventListener('DOMContentLoaded', () => {
    insertNavigation();
    loadSeriesList();
    setupSearch();
});

async function loadSeriesList() {
    const container = document.querySelector('.manga-grid') || document.body;
    showLoading(container);
    
    allSeries = await fetchSeriesData();
    
    if (allSeries.length === 0) {
        showEmptyState(container, 'No manga series available');
        return;
    }
    
    renderSeries(allSeries);
}

function renderSeries(seriesList) {
    const container = document.querySelector('.manga-grid') || document.body;
    
    if (seriesList.length === 0) {
        container.innerHTML = '';
        showEmptyState(container, 'No series found');
        return;
    }
    
    const grid = document.createElement('div');
    grid.className = 'content-grid';
    
    seriesList.forEach(series => {
        const card = createSeriesCard(series);
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
            renderSeries(allSeries);
            return;
        }
        
        const filtered = allSeries.filter(series => {
            const name = (series.name || '').toLowerCase();
            const author = (series.author || '').toLowerCase();
            return name.includes(query) || author.includes(query);
        });
        
        renderSeries(filtered);
    });
}
