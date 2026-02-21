// app.js - Updated with fixes for:
// 1. Delete playlist and videos
// 2. Chart gallery download + lightbox view
// 3. Flashcards fix (flip works now)
// 4. Stats - removed pips, added P/L in dollars
const YOUTUBE_API_KEY = 'AIzaSyB8jTuP8fvn4eOmZeaymdbCGCju2SiIT40';  
// ==================== FIREBASE CONFIGURATION ====================
const firebaseConfig = {
    apiKey: "AIzaSyBM0yKyBpqCCK3FdM0KxoxEZ39TajLql_A",
    authDomain: "ict-trading-hub.firebaseapp.com",
    databaseURL: "https://ict-trading-hub-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "ict-trading-hub",
    storageBucket: "ict-trading-hub.firebasestorage.app",
    messagingSenderId: "509749854931",
    appId: "1:509749854931:web:36e28e5cbec5c60633ca26"
};

// Contract multipliers for P/L calculation
const contractMultipliers = {
    'ES': 50, 'NQ': 20, 'YM': 5, 'RTY': 50,
    'CL': 1000, 'GC': 100, 'SI': 5000, 'NG': 10000,
    'PL': 100, 'PA': 100, 'HG': 25000, 'ZC': 50,
    'ZS': 50, 'ZW': 50, 'HE': 400, 'LE': 400,
    'ZB': 31.25, 'ZF': 15.625, 'ZN': 15.625, '2YY': 15.625,
    '6J': 12.5, '6E': 12.5, '6B': 6.25, '6A': 10, '6C': 10, '6S': 12.5
};

try {
    firebase.initializeApp(firebaseConfig);
    window.db = firebase.database();
} catch(e) {
    alert("Firebase error: " + e.message);
}

const defaultConcepts = [
    { id: 'order-block', title: 'Order Block', category: 'concepts', description: 'Area where institutional traders have placed large orders.', completed: false },
    { id: 'fvg', title: 'Fair Value Gap', category: 'concepts', description: 'A gap between high and low of consecutive candles.', completed: false },
    { id: 'breaker-block', title: 'Breaker Block', category: 'setups', description: 'When price breaks a previous order block.', completed: false },
    { id: 'liquidity-grab', title: 'Liquidity Grab', category: 'setups', description: 'Price grabs stop liquidity before reversing.', completed: false },
    { id: 'market-structure', title: 'Market Structure', category: 'concepts', description: 'Understanding swing highs and lows.', completed: false }
];

// ==================== STORE ====================
const store = {
    data: null,
    save() {
        if (this.data) {
            if (!this.data.notes) this.data.notes = [];
            if (!this.data.journal) this.data.journal = [];
            if (!this.data.flashcards) this.data.flashcards = [];
            if (!this.data.gallery) this.data.gallery = [];
            if (!this.data.playlists) this.data.playlists = [];
            if (!this.data.dailyChecklist) this.data.dailyChecklist = [false, false, false, false];
            
            db.ref('ictHubData').set(this.data).catch(err => {
                localStorage.setItem('ictHubData', JSON.stringify(this.data));
            });
        }
    }
};

let currentPlaylistId = null;
let editingNoteId = null;
let editingJournalId = null;
let currentCardIndex = 0;
let editingFlashcardId = null;
let currentLightboxImage = null;

// ==================== LOAD DATA ====================
function loadData() {
    db.ref('ictHubData').once('value')
        .then((snapshot) => {
            const data = snapshot.val();
            
            if (data) {
                store.data = {
                    concepts: data.concepts || defaultConcepts,
                    notes: data.notes || [],
                    journal: data.journal || [],
                    flashcards: data.flashcards || [],
                    gallery: data.gallery || [],
                    playlists: data.playlists || [],
                    dailyChecklist: data.dailyChecklist || [false, false, false, false]
                };
            } else {
                store.data = {
                    concepts: defaultConcepts,
                    notes: [],
                    journal: [],
                    flashcards: [],
                    gallery: [],
                    playlists: [],
                    dailyChecklist: [false, false, false, false]
                };
                db.ref('ictHubData').set(store.data);
            }
            
            renderAll();
        })
        .catch((error) => {
            const localData = localStorage.getItem('ictHubData');
            if (localData) {
                store.data = JSON.parse(localData);
            } else {
                store.data = {
                    concepts: defaultConcepts,
                    notes: [],
                    journal: [],
                    flashcards: [],
                    gallery: [],
                    playlists: [],
                    dailyChecklist: [false, false, false, false]
                };
            }
            renderAll();
        });
}

function renderAll() {
    updateDashboard();
    renderPlaylists();
    renderJournal();
    renderNotes();
    renderFlashcards();
    renderGallery();
    renderStats();
    updateTimes();
    setInterval(updateTimes, 60000);
}

setTimeout(loadData, 2000);

// ==================== NAVIGATION ====================
function navigateTo(page) {
    const pages = ['dashboard', 'courses', 'journal', 'notes', 'flashcards', 'gallery', 'stats'];
    const pageIndex = pages.indexOf(page);
    
    if (pageIndex >= 0) {
        document.querySelectorAll('.sidebar nav li').forEach((li, i) => li.classList.remove('active'));
        document.querySelectorAll('.sidebar nav li')[pageIndex].classList.add('active');
    }
    
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById(page + 'Page').classList.remove('hidden');
    
    document.getElementById('sidebar').classList.remove('open');
    
    if (page === 'courses') {
        document.getElementById('playlistsSection').classList.remove('hidden');
        document.getElementById('playlistVideos').classList.add('hidden');
    }
    
    if (page === 'stats') renderStats();
}

// ==================== THEME TOGGLE ====================
function toggleTheme() {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    document.getElementById('themeToggle').innerHTML = isLight ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
}

if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light-theme');
    document.getElementById('themeToggle').innerHTML = '<i class="fas fa-sun"></i>';
}

// ==================== GLOBAL SEARCH ====================
function handleGlobalSearch() {
    const query = document.getElementById('globalSearch').value.toLowerCase();
    if (query.length < 2) return;
    
    const notes = store.data?.notes || [];
    const matchingNotes = notes.filter(n => 
        n.title.toLowerCase().includes(query) || 
        (n.content && n.content.toLowerCase().includes(query))
    );
    
    if (matchingNotes.length > 0) {
        navigateTo('notes');
        document.getElementById('notesSearch').value = query;
        searchNotes();
    }
}

// ==================== MODAL FUNCTIONS ====================
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function openJournalModal() {
    editingJournalId = null;
    document.getElementById('journalModalTitle').textContent = 'New Trade Entry';
    document.getElementById('journalDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('journalEntryTime').value = '';
    document.getElementById('journalExitTime').value = '';
    document.getElementById('journalContract').value = '';
    document.getElementById('journalDirection').value = '';
    document.getElementById('journalStatus').value = 'win';
    document.getElementById('journalEntry').value = '';
    document.getElementById('journalExit').value = '';
    document.getElementById('journalContracts').value = '1';
    document.getElementById('journalSL').value = '';
    document.getElementById('journalTP').value = '';
    document.getElementById('journalPoints').value = '';
    document.getElementById('journalProfit').value = '';
    document.getElementById('journalSetup').value = '';
    document.getElementById('journalNotes').value = '';
    populateChartDropdown();
    openModal('journalModal');
}

function populateChartDropdown() {
    const sel = document.getElementById('journalChart');
    let html = '<option value="">-- Select a chart --</option>';
    if (store.data && store.data.gallery) {
        store.data.gallery.forEach((g, index) => {
            html += '<option value="' + index + '">Chart - ' + new Date(g.createdAt).toLocaleDateString() + '</option>';
        });
    }
    sel.innerHTML = html;
}

function populateVideoDropdown() {
    const sel = document.getElementById('noteVideo');
    let html = '<option value="">-- Select a video --</option>';
    if (store.data && store.data.playlists) {
        store.data.playlists.forEach(p => {
            if (p.videos) {
                p.videos.forEach(v => {
                    html += '<option value="' + p.id + '|' + v.id + '">' + p.name + ': ' + v.title + '</option>';
                });
            }
        });
    }
    sel.innerHTML = html;
}

function getVideoName(videoId) {
    if (!videoId || !store.data) return '';
    const [pid, vid] = videoId.split('|');
    const p = store.data.playlists.find(x => x.id === pid);
    if (p) {
        const v = p.videos.find(x => x.id === vid);
        if (v) return v.title;
    }
    return '';
}

function getChartImage(index) {
    if (!store.data || !store.data.gallery || index === '') return null;
    const idx = parseInt(index);
    if (store.data.gallery[idx]) {
        return store.data.gallery[idx].image;
    }
    return null;
}

function openNoteModal() {
    editingNoteId = null;
    document.getElementById('noteModalTitle').textContent = 'New Note';
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteCategory').value = 'General';
    document.getElementById('noteContent').value = '';
    document.getElementById('noteTakeaway').value = '';
    document.getElementById('noteQuestions').value = '';
    populateVideoDropdown();
    openModal('noteModal');
}

// ==================== AUTO-CALCULATE P/L ====================
function calculateTradePL() {
    const entry = parseFloat(document.getElementById('journalEntry').value) || 0;
    const exit = parseFloat(document.getElementById('journalExit').value) || 0;
    const contracts = parseInt(document.getElementById('journalContracts').value) || 1;
    const contract = document.getElementById('journalContract').value;
    const direction = document.getElementById('journalDirection').value;
    
    if (!entry || !exit || !contract || !direction) {
        document.getElementById('journalPoints').value = '';
        document.getElementById('journalProfit').value = '';
        return;
    }
    
    // Calculate points (absolute difference)
    let points = exit - entry;
    if (direction === 'Short') {
        points = entry - exit;
    }
    
    // Calculate P/L ($)
    const multiplier = contractMultipliers[contract] || 50;
    const profit = points * multiplier * contracts;
    
    document.getElementById('journalPoints').value = points.toFixed(2);
    document.getElementById('journalProfit').value = profit.toFixed(2);
}

// Add event listeners for auto-calculation
document.addEventListener('DOMContentLoaded', function() {
    const calcFields = ['journalEntry', 'journalExit', 'journalContracts', 'journalContract', 'journalDirection'];
    calcFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', calculateTradePL);
            el.addEventListener('change', calculateTradePL);
        }
    });
});

// ==================== SUBMIT FUNCTIONS ====================
function submitPlaylist() {
    const name = document.getElementById('playlistName').value;
    if (!name) { alert('Enter a name!'); return; }
    
    if (!store.data.playlists) store.data.playlists = [];
    store.data.playlists.push({ id: Date.now().toString(), name: name, description: document.getElementById('playlistDesc').value, videos: [] });
    store.save();
    closeModal('playlistModal');
    document.getElementById('playlistName').value = '';
    document.getElementById('playlistDesc').value = '';
    renderPlaylists();
    updateDashboard();
}

function submitVideo() {
    const title = document.getElementById('videoTitle').value;
    const url = document.getElementById('videoUrl').value;
    if (!title || !url) { alert('Enter title and URL!'); return; }
    const p = store.data.playlists.find(x => x.id === currentPlaylistId);
    if (p) {
        if (!p.videos) p.videos = [];
        p.videos.push({ id: Date.now().toString(), title: title, url: url, watched: false });
        store.save();
    }
    closeModal('videoModal');
    document.getElementById('videoTitle').value = '';
    document.getElementById('videoUrl').value = '';
    renderVideos();
    updateDashboard();
}

function submitJournal() {
    if (!store.data.journal) store.data.journal = [];
    
    // Get chart image if selected
    const chartIndex = document.getElementById('journalChart').value;
    const chartImage = chartIndex !== '' ? getChartImage(chartIndex) : null;
    
    const entry = {
        id: editingJournalId || Date.now().toString(),
        date: document.getElementById('journalDate').value,
        entryTime: document.getElementById('journalEntryTime').value,
        exitTime: document.getElementById('journalExitTime').value,
        contract: document.getElementById('journalContract').value,
        direction: document.getElementById('journalDirection').value,
        status: document.getElementById('journalStatus').value,
        entry: document.getElementById('journalEntry').value,
        exit: document.getElementById('journalExit').value,
        contracts: document.getElementById('journalContracts').value,
        sl: document.getElementById('journalSL').value,
        tp: document.getElementById('journalTP').value,
        points: document.getElementById('journalPoints').value,
        profit: document.getElementById('journalProfit').value,
        setup: document.getElementById('journalSetup').value,
        notes: document.getElementById('journalNotes').value,
        chartImage: chartImage
    };
    
    if (editingJournalId) {
        const idx = store.data.journal.findIndex(x => x.id === editingJournalId);
        if (idx >= 0) store.data.journal[idx] = entry;
    } else {
        store.data.journal.unshift(entry);
    }
    
    store.save();
    closeModal('journalModal');
    renderJournal();
    updateDashboard();
}

function submitNote() {
    const title = document.getElementById('noteTitle').value;
    if (!title) { alert('Enter a title!'); return; }
    
    if (!store.data.notes) store.data.notes = [];
    
    const note = {
        id: editingNoteId || Date.now().toString(),
        title: title,
        videoId: document.getElementById('noteVideo').value,
        category: document.getElementById('noteCategory').value,
        content: document.getElementById('noteContent').value,
        takeaway: document.getElementById('noteTakeaway').value,
        questions: document.getElementById('noteQuestions').value,
        createdAt: new Date().toISOString()
    };
    
    if (editingNoteId) {
        const idx = store.data.notes.findIndex(x => x.id === editingNoteId);
        if (idx >= 0) store.data.notes[idx] = note;
    } else {
        store.data.notes.unshift(note);
    }
    
    store.save();
    closeModal('noteModal');
    renderNotes();
    updateDashboard();
}

function submitFlashcard() {
    const term = document.getElementById('flashcardTerm').value;
    const def = document.getElementById('flashcardDefinition').value;
    if (!term) { alert('Enter a term!'); return; }
    
    if (!store.data.flashcards) store.data.flashcards = [];
    
    if (editingFlashcardId) {
        const card = store.data.flashcards.find(x => x.id === editingFlashcardId);
        if (card) {
            card.term = term;
            card.definition = def;
        }
        editingFlashcardId = null;
    } else {
        store.data.flashcards.push({ id: Date.now().toString(), term: term, definition: def });
    }
    
    store.save();
    closeModal('flashcardModal');
    document.getElementById('flashcardTerm').value = '';
    document.getElementById('flashcardDefinition').value = '';
    document.getElementById('flashcardModalTitle').textContent = 'New Flashcard';
    document.getElementById('flashcardSaveBtn').textContent = 'Save';
    currentCardIndex = 0;
    renderFlashcards();
}

function openFlashcardModal() {
    editingFlashcardId = null;
    document.getElementById('flashcardModalTitle').textContent = 'New Flashcard';
    document.getElementById('flashcardSaveBtn').textContent = 'Save';
    document.getElementById('flashcardTerm').value = '';
    document.getElementById('flashcardDefinition').value = '';
    openModal('flashcardModal');
}

function editFlashcard(id) {
    const c = (store.data.flashcards || []).find(x => x.id === id);
    if (!c) return;
    editingFlashcardId = id;
    document.getElementById('flashcardModalTitle').textContent = 'Edit Flashcard';
    document.getElementById('flashcardSaveBtn').textContent = 'Update';
    document.getElementById('flashcardTerm').value = c.term;
    document.getElementById('flashcardDefinition').value = c.definition;
    openModal('flashcardModal');
}

function deleteFlashcard(id) {
    if (confirm('Delete this flashcard?')) {
        if (!store.data.flashcards) store.data.flashcards = [];
        store.data.flashcards = store.data.flashcards.filter(x => x.id !== id);
        store.save();
        currentCardIndex = 0;
        renderFlashcards();
    }
}

// ==================== DOWNLOAD NOTES ====================
function downloadNoteTxt(noteId) {
    const n = (store.data.notes || []).find(x => x.id === noteId);
    if (!n) return;
    
    let content = n.title + '\n';
    content += 'Category: ' + n.category + '\n';
    content += 'Date: ' + new Date(n.createdAt).toLocaleDateString() + '\n\n';
    content += 'Notes:\n' + (n.content || '') + '\n\n';
    if (n.takeaway) content += 'Key Takeaways:\n' + n.takeaway + '\n\n';
    if (n.questions) content += 'Questions:\n' + n.questions + '\n';
    
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = n.title.replace(/[^a-z0-9]/gi, '_') + '.txt';
    a.click();
}

function downloadNoteDoc(noteId) {
    const n = (store.data.notes || []).find(x => x.id === noteId);
    if (!n) return;
    
    let content = '<html><head><meta charset="UTF-8"><title>' + n.title + '</title></head><body>';
    content += '<h1>' + n.title + '</h1>';
    content += '<p><strong>Category:</strong> ' + n.category + '</p>';
    content += '<p><strong>Date:</strong> ' + new Date(n.createdAt).toLocaleDateString() + '</p>';
    content += '<h2>Notes</h2><p>' + (n.content || '').replace(/\n/g, '<br>') + '</p>';
    if (n.takeaway) content += '<h2>Key Takeaways</h2><p>' + n.takeaway.replace(/\n/g, '<br>') + '</p>';
    if (n.questions) content += '<h2>Questions</h2><p>' + n.questions.replace(/\n/g, '<br>') + '</p>';
    content += '</body></html>';
    
    const blob = new Blob([content], { type: 'application/msword' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = n.title.replace(/[^a-z0-9]/gi, '_') + '.doc';
    a.click();
}

// ==================== DELETE PLAYLIST AND VIDEO ====================
function deletePlaylist(playlistId, event) {
    event.stopPropagation();
    if (confirm('Delete this playlist and all its videos?')) {
        if (!store.data.playlists) store.data.playlists = [];
        store.data.playlists = store.data.playlists.filter(x => x.id !== playlistId);
        store.save();
        renderPlaylists();
        updateDashboard();
    }
}

function deleteVideo(videoId, event) {
    event.stopPropagation();
    if (confirm('Delete this video?')) {
        const p = store.data.playlists.find(x => x.id === currentPlaylistId);
        if (p && p.videos) {
            p.videos = p.videos.filter(x => x.id !== videoId);
            store.save();
            renderVideos();
            updateDashboard();
        }
    }
}

// ==================== LIGHTBOX FOR CHARTS ====================
function openLightbox(imageSrc) {
    currentLightboxImage = imageSrc;
    document.getElementById('lightboxImage').src = imageSrc;
    document.getElementById('lightboxModal').classList.remove('hidden');
}

function closeLightbox() {
    document.getElementById('lightboxModal').classList.add('hidden');
    currentLightboxImage = null;
}

function downloadLightboxImage() {
    if (!currentLightboxImage) return;
    const a = document.createElement('a');
    a.href = currentLightboxImage;
    a.download = 'chart_' + Date.now() + '.png';
    a.click();
}

// ==================== DOWNLOAD CHART FROM GALLERY ====================
function downloadChart(chartId, event) {
    event.stopPropagation();
    const chart = (store.data.gallery || []).find(x => x.id === chartId);
    if (!chart) return;
    const a = document.createElement('a');
    a.href = chart.image;
    a.download = 'chart_' + new Date(chart.createdAt).toISOString().split('T')[0] + '.png';
    a.click();
}

// ==================== RENDER FUNCTIONS ====================
function updateDashboard() {
    if (!store.data) return;
    
    const notes = store.data.notes || [];
    const journal = store.data.journal || [];
    const playlists = store.data.playlists || [];
    
    document.getElementById('totalVideos').textContent = getWatchedCount();
    document.getElementById('totalJournal').textContent = journal.length;
    document.getElementById('totalNotes').textContent = notes.length;
    document.getElementById('videosWatched').textContent = getWatchedCount();
    document.getElementById('notesCount').textContent = notes.length;
    
    document.getElementById('playlistCount').textContent = playlists.length;
    let totalV = 0, watchedV = 0;
    playlists.forEach(p => { 
        if (p.videos) {
            totalV += p.videos.length; 
            watchedV += p.videos.filter(v => v.watched).length; 
        }
    });
    document.getElementById('totalVideoCount').textContent = totalV;
    document.getElementById('watchedCount').textContent = watchedV;

    const recentList = document.getElementById('recentNotesList');
    if (notes.length > 0) {
        recentList.innerHTML = notes.slice(0, 3).map(n => 
            '<div class="note-item" onclick="navigateTo(\'notes\')"><div class="note-title">' + n.title + '</div><div class="note-date">' + new Date(n.createdAt).toLocaleDateString() + '</div></div>'
        ).join('');
    } else {
        recentList.innerHTML = '<p class="empty-state">No notes yet</p>';
    }
}

function getWatchedCount() {
    if (!store.data) return 0;
    let c = 0;
    (store.data.playlists || []).forEach(p => { 
        if (p.videos) {
            c += p.videos.filter(v => v.watched).length; 
        }
    });
    return c;
}

function renderPlaylists() {
    if (!store.data) return;
    const playlists = store.data.playlists || [];
    const grid = document.getElementById('playlistsGrid');
    if (playlists.length === 0) {
        grid.innerHTML = '<div class="empty-state-large"><i class="fas fa-video"></i><p>No playlists</p><button class="btn-primary" onclick="openModal(\'playlistModal\')">Add Playlist</button></div>';
        return;
    }
    grid.innerHTML = playlists.map(p => {
        const videos = p.videos || [];
        const w = videos.filter(v => v.watched).length;
        const prog = videos.length ? Math.round(w / videos.length * 100) : 0;
        return '<div class="playlist-card" onclick="openPlaylist(\'' + p.id + '\')">' +
        '<button class="playlist-delete" onclick="deletePlaylist(\'' + p.id + '\', event)" title="Delete Playlist"><i class="fas fa-trash"></i></button>' +
        '<h4>' + p.name + '</h4><p>' + (p.description || '') + '</p><div style="color:var(--text-muted)">' + videos.length + ' videos</div>' +
        '<div class="playlist-progress"><div class="progress-bar"><div class="progress-fill" style="width:' + prog + '%"></div></div><span>' + prog + '%</span></div></div>';
    }).join('');
}

function openPlaylist(id) {
    currentPlaylistId = id;
    const p = store.data.playlists.find(x => x.id === id);
    document.getElementById('playlistsSection').classList.add('hidden');
    document.getElementById('playlistVideos').classList.remove('hidden');
    document.getElementById('selectedPlaylistTitle').textContent = p.name;
    renderVideos();
}

function backToPlaylists() {
    currentPlaylistId = null;
    document.getElementById('playlistVideos').classList.add('hidden');
    document.getElementById('playlistsSection').classList.remove('hidden');
}

function renderVideos() {
    if (!store.data || !currentPlaylistId) return;
    const p = store.data.playlists.find(x => x.id === currentPlaylistId);
    const list = document.getElementById('videosList');
    if (!p || !p.videos || p.videos.length === 0) {
        list.innerHTML = '<p class="empty-state">No videos</p>';
        return;
    }
    list.innerHTML = p.videos.map(v => 
        '<div class="video-item' + (v.watched ? ' watched' : '') + '">' +
        '<input type="checkbox" ' + (v.watched ? 'checked' : '') + ' onchange="toggleVideo(\'' + v.id + '\')">' +
        '<div class="video-info"><div class="video-title">' + v.title + '</div><div class="video-url"><a href="' + v.url + '" target="_blank">' + v.url + '</a></div></div>' +
        '<button class="video-delete" onclick="deleteVideo(\'' + v.id + '\', event)" title="Delete Video"><i class="fas fa-trash"></i></button>' +
        '</div>'
    ).join('');
}

function toggleVideo(id) {
    const p = store.data.playlists.find(x => x.id === currentPlaylistId);
    if (p) {
        const v = p.videos.find(x => x.id === id);
        if (v) { v.watched = !v.watched; store.save(); renderVideos(); updateDashboard(); }
    }
}

function renderNotes(search) {
    if (!store.data) return;
    let notes = store.data.notes || [];
    if (search) {
        const q = search.toLowerCase();
        notes = notes.filter(n => n.title.toLowerCase().includes(q) || (n.content && n.content.toLowerCase().includes(q)));
    }
    const grid = document.getElementById('notesGrid');
    if (notes.length === 0) {
        grid.innerHTML = '<div class="empty-state-large"><i class="fas fa-sticky-note"></i><p>No notes</p><button class="btn-primary" onclick="openNoteModal()">New Note</button></div>';
        return;
    }
    grid.innerHTML = notes.map(n => {
        let videoLink = '';
        if (n.videoId) {
            const vTitle = getVideoName(n.videoId);
            if (vTitle) videoLink = '<div class="video-link"><i class="fas fa-video"></i> ' + vTitle + '</div>';
        }
        let takeaway = '';
        if (n.takeaway) takeaway = '<div class="note-takeaway"><i class="fas fa-lightbulb"></i> ' + n.takeaway + '</div>';
        let questions = '';
        if (n.questions) questions = '<div class="note-questions"><i class="fas fa-question-circle"></i> ' + n.questions + '</div>';
        
        return '<div class="note-card">' + videoLink +
        '<span class="note-category">' + n.category + '</span>' +
        '<h4>' + n.title + '</h4>' +
        '<p class="note-preview">' + (n.content || '') + '</p>' +
        takeaway + questions +
        '<div class="note-footer"><span class="note-date">' + new Date(n.createdAt).toLocaleDateString() + '</span>' +
        '<div class="note-actions">' +
        '<button onclick="downloadNoteTxt(\'' + n.id + '\')" title="Download TXT"><i class="fas fa-file-alt"></i></button>' +
        '<button onclick="downloadNoteDoc(\'' + n.id + '\')" title="Download DOC"><i class="fas fa-file-word"></i></button>' +
        '<button onclick="editNote(\'' + n.id + '\')"><i class="fas fa-edit"></i></button>' +
        '<button onclick="deleteNote(\'' + n.id + '\')"><i class="fas fa-trash"></i></button></div></div></div>';
    }).join('');
}

function searchNotes() {
    renderNotes(document.getElementById('notesSearch').value);
}

function editNote(id) {
    const n = (store.data.notes || []).find(x => x.id === id);
    if (!n) return;
    editingNoteId = id;
    document.getElementById('noteModalTitle').textContent = 'Edit Note';
    document.getElementById('noteTitle').value = n.title;
    document.getElementById('noteCategory').value = n.category || 'General';
    document.getElementById('noteContent').value = n.content || '';
    document.getElementById('noteTakeaway').value = n.takeaway || '';
    document.getElementById('noteQuestions').value = n.questions || '';
    populateVideoDropdown();
    document.getElementById('noteVideo').value = n.videoId || '';
    openModal('noteModal');
}

function deleteNote(id) {
    if (confirm('Delete this note?')) {
        if (!store.data.notes) store.data.notes = [];
        store.data.notes = store.data.notes.filter(x => x.id !== id);
        store.save();
        renderNotes();
        updateDashboard();
    }
}

function renderJournal() {
    if (!store.data) return;
    let entries = store.data.journal || [];
    
    // Filter by date if set
    const filterDate = document.getElementById('journalDateFilter')?.value;
    if (filterDate) {
        entries = entries.filter(e => e.date === filterDate);
    }
    
    const container = document.getElementById('journalEntries');
    if (entries.length === 0) {
        container.innerHTML = '<div class="empty-state-large"><i class="fas fa-book-open"></i><p>No entries</p><button class="btn-primary" onclick="openJournalModal()">New Entry</button></div>';
        return;
    }
    container.innerHTML = entries.map(e => {
        // Build chart image if exists
        let chartHtml = '';
        if (e.chartImage) {
            chartHtml = '<div class="journal-chart"><img src="' + e.chartImage + '" alt="Trade chart"></div>';
        }
        
        // Trade details
        let detailsHtml = '<div class="entry-details">';
        if (e.contract) detailsHtml += '<div class="detail-item"><span>Contract</span><strong>' + e.contract + '</strong></div>';
        if (e.direction) detailsHtml += '<div class="detail-item"><span>Direction</span><strong>' + e.direction + '</strong></div>';
        if (e.entry) detailsHtml += '<div class="detail-item"><span>Entry</span><strong>' + e.entry + '</strong></div>';
        if (e.exit) detailsHtml += '<div class="detail-item"><span>Exit</span><strong>' + e.exit + '</strong></div>';
        if (e.contracts) detailsHtml += '<div class="detail-item"><span>Contracts</span><strong>' + e.contracts + '</strong></div>';
        if (e.sl) detailsHtml += '<div class="detail-item"><span>Stop Loss</span><strong>' + e.sl + '</strong></div>';
        if (e.tp) detailsHtml += '<div class="detail-item"><span>Take Profit</span><strong>' + e.tp + '</strong></div>';
        if (e.points) detailsHtml += '<div class="detail-item"><span>Points</span><strong>' + e.points + '</strong></div>';
        if (e.profit) detailsHtml += '<div class="detail-item"><span>Profit/Loss</span><strong>' + (parseFloat(e.profit) >= 0 ? '+' : '') + '$' + e.profit + '</strong></div>';
        detailsHtml += '</div>';
        
        // Setup
        let setupHtml = e.setup ? '<div class="entry-setup"><strong>Setup:</strong> ' + e.setup + '</div>' : '';
        
        // Notes
        let notesHtml = e.notes ? '<div class="entry-notes"><h5>Notes</h5><p>' + e.notes + '</p></div>' : '';
        
        // Status
        const statusClass = e.status === 'win' ? 'win' : (e.status === 'loss' ? 'loss' : (e.status === 'open' ? 'open' : 'breakeven'));
        
        return '<div class="journal-entry">' +
        '<div class="entry-header"><div><div class="entry-date">' + new Date(e.date).toLocaleDateString() + '</div><span class="entry-session">' + (e.entryTime || '') + (e.exitTime ? ' - ' + e.exitTime : '') + '</span></div><span class="entry-result ' + statusClass + '">' + (e.status || 'win').toUpperCase() + '</span></div>' +
        detailsHtml +
        setupHtml + chartHtml + notesHtml +
        '<div class="entry-actions">' +
        '<button onclick="editJournal(\'' + e.id + '\')"><i class="fas fa-edit"></i></button>' +
        '<button onclick="deleteJournal(\'' + e.id + '\')"><i class="fas fa-trash"></i></button></div>' +
        '</div>';
    }).join('');
}

function filterJournalByDate() {
    renderJournal();
}

function editJournal(id) {
    const e = (store.data.journal || []).find(x => x.id === id);
    if (!e) return;
    editingJournalId = id;
    document.getElementById('journalModalTitle').textContent = 'Edit Trade Entry';
    document.getElementById('journalDate').value = e.date;
    document.getElementById('journalEntryTime').value = e.entryTime || '';
    document.getElementById('journalExitTime').value = e.exitTime || '';
    document.getElementById('journalContract').value = e.contract || '';
    document.getElementById('journalDirection').value = e.direction || '';
    document.getElementById('journalStatus').value = e.status || 'win';
    document.getElementById('journalEntry').value = e.entry || '';
    document.getElementById('journalExit').value = e.exit || '';
    document.getElementById('journalContracts').value = e.contracts || '1';
    document.getElementById('journalSL').value = e.sl || '';
    document.getElementById('journalTP').value = e.tp || '';
    document.getElementById('journalPoints').value = e.points || '';
    document.getElementById('journalProfit').value = e.profit || '';
    document.getElementById('journalSetup').value = e.setup || '';
    document.getElementById('journalNotes').value = e.notes || '';
    populateChartDropdown();
    openModal('journalModal');
}

function deleteJournal(id) {
    if (confirm('Delete this entry?')) {
        if (!store.data.journal) store.data.journal = [];
        store.data.journal = store.data.journal.filter(x => x.id !== id);
        store.save();
        renderJournal();
        updateDashboard();
    }
}

function renderFlashcards() {
    if (!store.data) return;
    const cards = store.data.flashcards || [];
    document.getElementById('totalCards').textContent = cards.length;
    document.getElementById('currentCardNum').textContent = cards.length ? currentCardIndex + 1 : 0;
    const container = document.getElementById('flashcardContainer');
    const nav = document.getElementById('flashcardNav');
    if (cards.length === 0) {
        container.innerHTML = '<div class="empty-state-large"><i class="fas fa-layer-group"></i><p>No flashcards</p><button class="btn-primary" onclick="openFlashcardModal()">New</button></div>';
        nav.classList.add('hidden');
        return;
    }
    nav.classList.remove('hidden');
    const c = cards[currentCardIndex];
    container.innerHTML = '<div class="flashcard-actions">' +
        '<button onclick="editFlashcard(\'' + c.id + '\')" title="Edit"><i class="fas fa-edit"></i></button>' +
        '<button onclick="deleteFlashcard(\'' + c.id + '\')" title="Delete"><i class="fas fa-trash"></i></button>' +
        '</div>' +
        '<div class="flashcard-wrapper" onclick="this.classList.toggle(\'flipped\')">' +
        '<div class="flashcard-inner">' +
        '<div class="flashcard-front">' +
        '<h4>' + c.term + '</h4>' +
        '<p class="flip-hint">Click to flip</p>' +
        '</div>' +
        '<div class="flashcard-back">' +
        '<h4>Definition</h4>' +
        '<p>' + c.definition + '</p>' +
        '</div>' +
        '</div></div>';
}

function prevCard() {
    const cards = store.data.flashcards || [];
    if (cards.length) { currentCardIndex = (currentCardIndex - 1 + cards.length) % cards.length; renderFlashcards(); }
}
function nextCard() {
    const cards = store.data.flashcards || [];
    if (cards.length) { currentCardIndex = (currentCardIndex + 1) % cards.length; renderFlashcards(); }
}
function shuffleCards() {
    const cards = store.data.flashcards || [];
    if (cards.length) { currentCardIndex = Math.floor(Math.random() * cards.length); renderFlashcards(); }
}

function renderGallery() {
    if (!store.data) return;
    const g = store.data.gallery || [];
    const grid = document.getElementById('galleryGrid');
    if (g.length === 0) {
        grid.innerHTML = '<div class="empty-state-large"><i class="fas fa-images"></i><p>No charts</p></div>';
        return;
    }
    
    const filterDate = document.getElementById('galleryDateFilter')?.value;
    let filteredG = g;
    if (filterDate) {
        filteredG = g.filter(i => new Date(i.createdAt).toISOString().split('T')[0] === filterDate);
    }
    
    grid.innerHTML = filteredG.map(i => 
        '<div class="gallery-item" onclick="openLightbox(\'' + i.image + '\')">' +
        '<button class="gallery-download" onclick="downloadChart(\'' + i.id + '\', event)" title="Download"><i class="fas fa-download"></i></button>' +
        '<button class="delete-btn" onclick="deleteChart(\'' + i.id + '\', event)"><i class="fas fa-trash"></i></button>' +
        '<img src="' + i.image + '">' +
        '<div class="gallery-info"><span class="gallery-date">' + new Date(i.createdAt).toLocaleDateString() + '</span></div></div>'
    ).join('');
    
    if (filteredG.length === 0) {
        grid.innerHTML = '<div class="empty-state-large"><i class="fas fa-images"></i><p>No charts for this date</p></div>';
    }
}

function filterGalleryByDate() {
    renderGallery();
}

function deleteChart(id, event) {
    if (event) event.stopPropagation();
    if (confirm('Delete this chart?')) {
        if (!store.data.gallery) store.data.gallery = [];
        store.data.gallery = store.data.gallery.filter(x => x.id !== id);
        store.save();
        renderGallery();
    }
}

document.getElementById('uploadChartInput').onchange = function(e) {
    if (this.files[0]) {
        const r = new FileReader();
        r.onload = ev => { 
            if (!store.data.gallery) store.data.gallery = [];
            store.data.gallery.unshift({ id: Date.now().toString(), image: ev.target.result, createdAt: new Date().toISOString() }); 
            store.save(); 
            renderGallery(); 
        };
        r.readAsDataURL(this.files[0]);
    }
};

// ==================== STATS - P/L IN DOLLARS ====================
function renderStats() {
    if (!store.data) return;
    
    const journal = store.data.journal || [];
    const playlists = store.data.playlists || [];
    
    const totalTrades = journal.length;
    const wins = journal.filter(e => e.status === 'win').length;
    const losses = journal.filter(e => e.status === 'loss').length;
    const winRate = totalTrades > 0 ? Math.round((wins / totalTrades) * 100) : 0;
    
    let totalPL = 0;
    let todayPL = 0;
    let bestTrade = 0;
    let worstTrade = 0;
    const today = new Date().toISOString().split('T')[0];
    
    // By contract and by direction
    const byContract = {};
    const byDirection = { 'Long': { wins: 0, losses: 0, pl: 0 }, 'Short': { wins: 0, losses: 0, pl: 0 } };
    
    journal.forEach(e => {
        const profit = parseFloat(e.profit) || 0;
        
        totalPL += profit;
        
        // Today's P/L
        if (e.date === today) {
            todayPL += profit;
        }
        
        // Best/Worst
        if (profit > bestTrade) bestTrade = profit;
        if (profit < worstTrade) worstTrade = profit;
        
        // By Contract
        if (e.contract) {
            if (!byContract[e.contract]) byContract[e.contract] = { wins: 0, losses: 0, pl: 0 };
            if (e.status === 'win') byContract[e.contract].wins++;
            if (e.status === 'loss') byContract[e.contract].losses++;
            byContract[e.contract].pl += profit;
        }
        
        // By Direction
        if (e.direction && byDirection[e.direction]) {
            if (e.status === 'win') byDirection[e.direction].wins++;
            if (e.status === 'loss') byDirection[e.direction].losses++;
            byDirection[e.direction].pl += profit;
        }
    });
    
    // Display stats
    document.getElementById('statsTotalTrades').textContent = totalTrades;
    document.getElementById('statsWins').textContent = wins;
    document.getElementById('statsLosses').textContent = losses;
    document.getElementById('statsWinRate').textContent = winRate + '%';
    
    // P/L in dollars
    const formatPL = (pl) => pl >= 0 ? '+$' + pl.toFixed(0) : '-$' + Math.abs(pl).toFixed(0);
    document.getElementById('statsTotalPL').textContent = formatPL(totalPL);
    document.getElementById('statsTodayPL').textContent = formatPL(todayPL);
    document.getElementById('statsBestTrade').textContent = formatPL(bestTrade);
    document.getElementById('statsWorstTrade').textContent = formatPL(worstTrade);
    
    // Video count
    let watchedVideos = 0;
    playlists.forEach(p => {
        if (p.videos) watchedVideos += p.videos.filter(v => v.watched).length;
    });
    document.getElementById('statsVideos').textContent = watchedVideos;
    
    // Win rate circle
    const winRateCircle = document.getElementById('winRateCircle');
    winRateCircle.style.background = 'conic-gradient(var(--success) ' + (winRate * 3.6) + 'deg, var(--dark) 0deg)';
    winRateCircle.textContent = winRate + '%';
    document.getElementById('winRatePercent').textContent = winRate + '%';
    
    // By Contract display
    const byContractDiv = document.getElementById('statsByContract');
    if (Object.keys(byContract).length > 0) {
        byContractDiv.innerHTML = Object.entries(byContract).map(c => {
            const total = c[1].wins + c[1].losses;
            const wr = total > 0 ? Math.round((c[1].wins / total) * 100) : 0;
            return '<div class="stat-by-item"><div class="stat-by-header"><span>' + c[0] + '</span><span>' + wr + '%</span></div><div class="stat-by-bar"><div class="stat-by-fill" style="width:' + wr + '%"></div></div><div class="stat-by-details">W: ' + c[1].wins + ' L: ' + c[1].losses + ' P/L: ' + formatPL(c[1].pl) + '</div></div>';
        }).join('');
    } else {
        byContractDiv.innerHTML = '<p class="empty-state">No contract data yet</p>';
    }
    
    // By Direction display
    const byDirectionDiv = document.getElementById('statsByDirection');
    byDirectionDiv.innerHTML = Object.entries(byDirection).map(d => {
        const total = d[1].wins + d[1].losses;
        const wr = total > 0 ? Math.round((d[1].wins / total) * 100) : 0;
        return '<div class="stat-by-item"><div class="stat-by-header"><span>' + d[0] + '</span><span>' + wr + '%</span></div><div class="stat-by-bar"><div class="stat-by-fill" style="width:' + wr + '%"></div></div><div class="stat-by-details">W: ' + d[1].wins + ' L: ' + d[1].losses + ' P/L: ' + formatPL(d[1].pl) + '</div></div>';
    }).join('');
}

function updateTimes() {
    const h = new Date().getUTCHours();
    const sydney = document.getElementById('sydneyTime');
    const tokyo = document.getElementById('tokyoTime');
    const london = document.getElementById('londonTime');
    const newyork = document.getElementById('newyorkTime');
    if (sydney) sydney.textContent = String((h + 24 - 2) % 24).padStart(2, '0') + ':00';
    if (tokyo) tokyo.textContent = String((h + 24 - 9) % 24).padStart(2, '0') + ':00';
    if (london) london.textContent = String((h + 24 - 0) % 24).padStart(2, '0') + ':00';
    if (newyork) newyork.textContent = String((h + 24 - 5) % 24).padStart(2, '0') + ':00';
    
    const sessions = [{ n: 'Sydney', s: 22, e: 7 }, { n: 'Tokyo', s: 0, e: 9 }, { n: 'London', s: 8, e: 17 }, { n: 'NY', s: 13, e: 22 }];
    let active = 'Off';
    sessions.forEach(s => { if (s.s > s.e ? (h >= s.s || h < s.e) : (h >= s.s && h < s.e)) active = s.n; });
    const activeEl = document.getElementById('activeSession');
    if (activeEl) activeEl.textContent = active;
}
// ===============================================
// PLAYLIST IMPORT FUNCTIONS
// ===============================================

function openImportModal() {
    document.getElementById('playlistUrl').value = '';
    document.getElementById('importPlaylistName').value = '';
    document.getElementById('importProgress').classList.add('hidden');
    document.getElementById('importResult').classList.add('hidden');
    openModal('importModal');
}

async function importPlaylist() {
    const url = document.getElementById('playlistUrl').value.trim();
    const customName = document.getElementById('importPlaylistName').value.trim();
    
    if (!url) {
        alert('Please enter a YouTube playlist URL');
        return;
    }
    
    if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY === 'YOUR_API_KEY_HERE') {
        alert('Please add your YouTube API key in app.js first!');
        return;
    }
    
    const playlistId = extractPlaylistId(url);
    if (!playlistId) {
        alert('Invalid YouTube playlist URL');
        return;
    }
    
    document.getElementById('importProgress').classList.remove('hidden');
    document.getElementById('importResult').classList.add('hidden');
    
    try {
        const result = await fetchPlaylistVideos(playlistId);
        
        if (result.videos.length === 0) {
            alert('No videos found in this playlist');
            return;
        }
        
        const playlistName = customName || result.title;
        
        if (!store.data.playlists) store.data.playlists = [];
        const newPlaylist = {
            id: Date.now().toString(),
            name: playlistName,
            description: 'Imported from YouTube',
            videos: result.videos.map(v => ({
                id: v.id,
                title: v.title,
                url: 'https://www.youtube.com/watch?v=' + v.id,
                watched: false
            }))
        };
        
        store.data.playlists.push(newPlaylist);
        store.save();
        
        document.getElementById('importProgress').classList.add('hidden');
        const resultDiv = document.getElementById('importResult');
        resultDiv.innerHTML = '<p style="color: var(--success)"><i class="fas fa-check-circle"></i> Successfully imported "' + playlistName + '" with ' + result.videos.length + ' videos!</p>';
        resultDiv.classList.remove('hidden');
        
        setTimeout(() => {
            closeModal('importModal');
            renderPlaylists();
            updateDashboard();
        }, 2000);
        
    } catch (error) {
        alert('Error importing playlist: ' + error.message);
        document.getElementById('importProgress').classList.add('hidden');
    }
}

function extractPlaylistId(url) {
    const patterns = [
        /[?&]list=([a-zA-Z0-9_-]+)/,
        /youtube\.com\/playlist\?list=([a-zA-Z0-9_-]+)/,
        /youtube\.com\/@[\w]+\/videos\?list=([a-zA-Z0-9_-]+)/
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

async function fetchPlaylistVideos(playlistId) {
    const videos = [];
    let nextPageToken = '';
    let playlistTitle = '';
    
    do {
        let url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${YOUTUBE_API_KEY}`;
        if (nextPageToken) {
            url += `&pageToken=${nextPageToken}`;
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error.message);
        }
        
        if (!playlistTitle && data.items.length > 0) {
            playlistTitle = data.items[0].snippet.title;
            playlistTitle = playlistTitle.replace(/\s*-\s*Playlist\s*$/i, '').trim();
        }
        
        for (const item of data.items) {
            if (item.snippet.resourceId && item.snippet.resourceId.videoId) {
                videos.push({
                    id: item.snippet.resourceId.videoId,
                    title: item.snippet.title
                });
            }
        }
        
        nextPageToken = data.nextPageToken;
        
    } while (nextPageToken);
    
    return { title: playlistTitle, videos };
}