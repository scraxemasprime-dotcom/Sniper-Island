const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    name: 'sid',
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: false, // set true if serving over HTTPS
        maxAge: 1000 * 60 * 60 * 24 * 14 // 14 days
    }
}));

// Uploads (avatars)
const uploadsRoot = path.join(__dirname, 'uploads');
const avatarsDir = path.join(uploadsRoot, 'avatars');
fs.mkdirSync(avatarsDir, { recursive: true });

const avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, avatarsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        cb(null, `${req.session.userId}${ext || '.png'}`);
    }
});

const uploadAvatar = multer({
    storage: avatarStorage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (req, file, cb) => {
        const ok = /^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype || '');
        cb(ok ? null : new Error('Only image files are allowed.'), ok);
    }
});

// Serve pages (routes must come before static middleware)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'docs', 'manga.html'));
});

app.get('/manga', (req, res) => {
    res.sendFile(path.join(__dirname, 'docs', 'manga.html'));
});

// Chapters route - must be before static middleware
app.get('/chapters', (req, res, next) => {
    console.log('Chapters route hit! Query:', req.query);
    const filePath = path.resolve(__dirname, 'docs', 'chapters.html');
    console.log('Serving chapters page from:', filePath);
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error('Error sending chapters.html:', err);
            res.status(500).send('Error loading chapters page: ' + err.message);
        } else {
            console.log('Chapters page sent successfully');
        }
    });
});

app.get('/reader', (req, res) => {
    res.sendFile(path.join(__dirname, 'docs', 'reader.html'));
});

app.get('/auth', (req, res) => {
    res.sendFile(path.join(__dirname, 'docs', 'auth.html'));
});

app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, 'docs', 'profile.html'));
});

// Backward-compat: old URLs redirect to the combined auth page
app.get('/login', (req, res) => res.redirect('/auth#login'));
app.get('/register', (req, res) => res.redirect('/auth#register'));

app.get('/account', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'docs', 'account.html'));
});

// API routes for JSON data
app.get('/api/manga', (req, res) => {
    try {
        const baseJsonPath = path.join(__dirname, 'data', 'manga.json');
        const base = JSON.parse(fs.readFileSync(baseJsonPath, 'utf8'));
        const baseSeries = Array.isArray(base.series) ? base.series : [];

        // Build chapters/pages dynamically from filesystem so new chapter folders appear automatically.
        const contentMangaRoot = path.join(__dirname, 'content', 'manga');
        const series = baseSeries.map((s) => {
            const seriesId = s.id;
            const dynamicChapters = seriesId
                ? buildChaptersFromFs(contentMangaRoot, seriesId, Array.isArray(s.chapters) ? s.chapters : [])
                : (Array.isArray(s.chapters) ? s.chapters : []);

            return {
                ...s,
                chapters: dynamicChapters
            };
        });

        res.json({ ...base, series });
    } catch (err) {
        console.error('Error generating /api/manga:', err);
        res.status(500).json({ error: 'Failed to load manga data' });
    }
});

// Auth API
app.get('/api/me', (req, res) => {
    const user = getCurrentUser(req);
    if (!user) return res.json({ user: null });
    return res.json({
        user: {
            id: user.id,
            username: user.username,
            createdAt: user.createdAt,
            avatarUrl: user.avatarUrl || '',
            bio: user.bio || ''
        }
    });
});

// Update profile (username + bio)
app.post('/api/profile', requireAuthJson, (req, res) => {
    const nextUsernameRaw = (req.body.username || '').toString().trim();
    const nextBioRaw = (req.body.bio || '').toString();

    const db = readUsersDb();
    const idx = db.users.findIndex(u => u.id === req.session.userId);
    if (idx < 0) return res.status(401).json({ error: 'Not logged in' });

    const current = db.users[idx];
    let nextUsername = current.username;
    if (nextUsernameRaw) {
        if (!/^[a-zA-Z0-9_]{3,24}$/.test(nextUsernameRaw)) {
            return res.status(400).json({ error: 'Username must be 3-24 chars (letters, numbers, underscore).' });
        }
        const exists = db.users.some(u => u.id !== current.id && u.username.toLowerCase() === nextUsernameRaw.toLowerCase());
        if (exists) return res.status(409).json({ error: 'Username already exists.' });
        nextUsername = nextUsernameRaw;
    }

    const nextBio = nextBioRaw.trim().slice(0, 280);

    db.users[idx] = { ...current, username: nextUsername, bio: nextBio };
    writeUsersDb(db);
    return res.json({
        ok: true,
        user: {
            id: db.users[idx].id,
            username: db.users[idx].username,
            createdAt: db.users[idx].createdAt,
            avatarUrl: db.users[idx].avatarUrl || '',
            bio: db.users[idx].bio || ''
        }
    });
});

app.post('/api/avatar', requireAuthJson, uploadAvatar.single('avatar'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

        const db = readUsersDb();
        const idx = db.users.findIndex(u => u.id === req.session.userId);
        if (idx < 0) return res.status(401).json({ error: 'Not logged in' });

        const ext = path.extname(req.file.filename || '').toLowerCase();
        const avatarUrl = `/uploads/avatars/${req.session.userId}${ext}?t=${Date.now()}`;
        db.users[idx] = { ...db.users[idx], avatarUrl };
        writeUsersDb(db);

        return res.json({ ok: true, avatarUrl });
    } catch (err) {
        console.error('Avatar upload error:', err);
        return res.status(500).json({ error: 'Failed to upload avatar.' });
    }
});

// Favorites API (per-account)
app.get('/api/favorites', requireAuthJson, (req, res) => {
    const user = getCurrentUser(req);
    return res.json({ favorites: Array.isArray(user.favorites) ? user.favorites : [] });
});

app.post('/api/favorites', requireAuthJson, (req, res) => {
    const seriesId = (req.body.seriesId || '').toString().trim();
    if (!seriesId) return res.status(400).json({ error: 'seriesId is required' });

    const db = readUsersDb();
    const idx = db.users.findIndex(u => u.id === req.session.userId);
    if (idx < 0) return res.status(401).json({ error: 'Not logged in' });

    const user = db.users[idx];
    const favs = new Set(Array.isArray(user.favorites) ? user.favorites : []);
    favs.add(seriesId);
    db.users[idx] = { ...user, favorites: Array.from(favs) };
    writeUsersDb(db);

    return res.json({ ok: true, favorites: db.users[idx].favorites });
});

app.delete('/api/favorites/:seriesId', requireAuthJson, (req, res) => {
    const seriesId = (req.params.seriesId || '').toString().trim();
    if (!seriesId) return res.status(400).json({ error: 'seriesId is required' });

    const db = readUsersDb();
    const idx = db.users.findIndex(u => u.id === req.session.userId);
    if (idx < 0) return res.status(401).json({ error: 'Not logged in' });

    const user = db.users[idx];
    const favs = new Set(Array.isArray(user.favorites) ? user.favorites : []);
    favs.delete(seriesId);
    db.users[idx] = { ...user, favorites: Array.from(favs) };
    writeUsersDb(db);

    return res.json({ ok: true, favorites: db.users[idx].favorites });
});

app.post('/api/register', async (req, res) => {
    try {
        const username = (req.body.username || '').toString().trim();
        const password = (req.body.password || '').toString();

        if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
            return res.status(400).json({ error: 'Username must be 3-24 chars (letters, numbers, underscore).' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters.' });
        }

        const db = readUsersDb();
        const exists = db.users.some(u => u.username.toLowerCase() === username.toLowerCase());
        if (exists) return res.status(409).json({ error: 'Username already exists.' });

        const passwordHash = await bcrypt.hash(password, 10);
        const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const user = { id, username, passwordHash, createdAt: new Date().toISOString(), favorites: [], bio: '' };
        db.users.push(user);
        writeUsersDb(db);

        req.session.userId = user.id;
        return res.json({ ok: true, user: { id: user.id, username: user.username, createdAt: user.createdAt } });
    } catch (err) {
        console.error('Register error:', err);
        return res.status(500).json({ error: 'Registration failed.' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const username = (req.body.username || '').toString().trim();
        const password = (req.body.password || '').toString();

        const db = readUsersDb();
        const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (!user) return res.status(401).json({ error: 'Invalid username or password.' });

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return res.status(401).json({ error: 'Invalid username or password.' });

        req.session.userId = user.id;
        return res.json({ ok: true, user: { id: user.id, username: user.username, createdAt: user.createdAt } });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'Login failed.' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('sid');
        return res.json({ ok: true });
    });
});

// Delete account (confirmation required)
app.delete('/api/account', requireAuthJson, async (req, res) => {
    try {
        const password = (req.body.password || '').toString();
        const confirmText = (req.body.confirmText || '').toString().trim();
        if (confirmText !== 'DELETE') return res.status(400).json({ error: 'Type DELETE to confirm.' });

        const db = readUsersDb();
        const idx = db.users.findIndex(u => u.id === req.session.userId);
        if (idx < 0) return res.status(401).json({ error: 'Not logged in' });

        const user = db.users[idx];
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return res.status(401).json({ error: 'Invalid password.' });

        db.users.splice(idx, 1);
        writeUsersDb(db);

        req.session.destroy(() => {
            res.clearCookie('sid');
            return res.json({ ok: true });
        });
    } catch (err) {
        console.error('Delete account error:', err);
        return res.status(500).json({ error: 'Failed to delete account.' });
    }
});

// Recently viewed (per-account)
app.get('/api/recent', requireAuthJson, (req, res) => {
    const user = getCurrentUser(req);
    return res.json({ recent: Array.isArray(user.recentViewed) ? user.recentViewed : [] });
});

app.post('/api/recent', requireAuthJson, (req, res) => {
    const type = (req.body.type || '').toString().trim(); // 'series' | 'chapter'
    const seriesId = (req.body.seriesId || '').toString().trim();
    const chapterId = (req.body.chapterId || '').toString().trim();

    if (!type || !seriesId) return res.status(400).json({ error: 'type and seriesId are required' });
    if (type !== 'series' && type !== 'chapter') return res.status(400).json({ error: 'Invalid type' });
    if (type === 'chapter' && !chapterId) return res.status(400).json({ error: 'chapterId is required for chapter type' });

    const db = readUsersDb();
    const idx = db.users.findIndex(u => u.id === req.session.userId);
    if (idx < 0) return res.status(401).json({ error: 'Not logged in' });

    const user = db.users[idx];
    const prev = Array.isArray(user.recentViewed) ? user.recentViewed : [];
    const key = `${type}:${seriesId}:${type === 'chapter' ? chapterId : ''}`;

    const nextItem = {
        key,
        type,
        seriesId,
        chapterId: type === 'chapter' ? chapterId : '',
        at: new Date().toISOString()
    };

    const filtered = prev.filter(i => i && i.key !== key);
    const next = [nextItem, ...filtered].slice(0, 25);

    db.users[idx] = { ...user, recentViewed: next };
    writeUsersDb(db);

    return res.json({ ok: true, recent: next });
});

app.delete('/api/recent', requireAuthJson, (req, res) => {
    const db = readUsersDb();
    const idx = db.users.findIndex(u => u.id === req.session.userId);
    if (idx < 0) return res.status(401).json({ error: 'Not logged in' });

    const user = db.users[idx];
    db.users[idx] = { ...user, recentViewed: [] };
    writeUsersDb(db);

    return res.json({ ok: true, recent: [] });
});

// Comments (per chapter)
app.get('/api/comments', (req, res) => {
    const seriesId = (req.query.seriesId || '').toString().trim();
    const chapterId = (req.query.chapterId || '').toString().trim();
    if (!seriesId || !chapterId) return res.status(400).json({ error: 'seriesId and chapterId are required' });

    const db = readCommentsDb();
    const list = db.comments
        .filter(c => c.seriesId === seriesId && c.chapterId === chapterId)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .slice(-200);
    return res.json({ comments: list });
});

app.post('/api/comments', requireAuthJson, (req, res) => {
    const seriesId = (req.body.seriesId || '').toString().trim();
    const chapterId = (req.body.chapterId || '').toString().trim();
    const text = (req.body.text || '').toString().trim();
    if (!seriesId || !chapterId) return res.status(400).json({ error: 'seriesId and chapterId are required' });
    if (!text) return res.status(400).json({ error: 'Comment cannot be empty' });
    if (text.length > 800) return res.status(400).json({ error: 'Comment is too long (max 800 chars)' });

    const user = getCurrentUser(req);
    if (!user) return res.status(401).json({ error: 'Not logged in' });

    const db = readCommentsDb();
    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const comment = {
        id,
        seriesId,
        chapterId,
        userId: user.id,
        username: user.username,
        text,
        createdAt: new Date().toISOString()
    };
    db.comments.push(comment);
    writeCommentsDb(db);
    return res.json({ ok: true, comment });
});

app.delete('/api/comments/:id', requireAuthJson, (req, res) => {
    const id = (req.params.id || '').toString().trim();
    if (!id) return res.status(400).json({ error: 'id is required' });

    const user = getCurrentUser(req);
    if (!user) return res.status(401).json({ error: 'Not logged in' });

    const db = readCommentsDb();
    const idx = db.comments.findIndex(c => c.id === id);
    if (idx < 0) return res.status(404).json({ error: 'Comment not found' });

    const comment = db.comments[idx];
    if (comment.userId !== user.id) return res.status(403).json({ error: 'Not allowed' });

    db.comments.splice(idx, 1);
    writeCommentsDb(db);
    return res.json({ ok: true });
});

// Public user profiles (safe fields only)
app.get('/api/users/:id', (req, res) => {
    const id = (req.params.id || '').toString().trim();
    if (!id) return res.status(400).json({ error: 'id is required' });
    const db = readUsersDb();
    const user = db.users.find(u => u.id === id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({
        user: {
            id: user.id,
            username: user.username,
            avatarUrl: user.avatarUrl || '',
            createdAt: user.createdAt || '',
            bio: user.bio || '',
            favorites: Array.isArray(user.favorites) ? user.favorites : []
        }
    });
});

app.post('/api/users/batch', (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const normalized = ids
        .map(x => (x || '').toString().trim())
        .filter(Boolean)
        .slice(0, 200);

    const db = readUsersDb();
    const byId = new Map(db.users.map(u => [u.id, u]));
    const users = normalized
        .map(id => byId.get(id))
        .filter(Boolean)
        .map(u => ({
            id: u.id,
            username: u.username,
            avatarUrl: u.avatarUrl || '',
            createdAt: u.createdAt || ''
        }));

    return res.json({ users });
});

function buildChaptersFromFs(contentMangaRoot, seriesId, baseChapters) {
    const seriesDir = path.join(contentMangaRoot, seriesId);
    if (!fs.existsSync(seriesDir) || !fs.statSync(seriesDir).isDirectory()) {
        return baseChapters;
    }

    const chapterDirs = fs
        .readdirSync(seriesDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .filter((name) => /^ch\d+/i.test(name));

    const baseById = new Map(baseChapters.map((c) => [c.id, c]));

    const chapters = chapterDirs.map((chapterId) => {
        const chapterDir = path.join(seriesDir, chapterId);
        const files = fs.readdirSync(chapterDir, { withFileTypes: true });
        const pages = files
            .filter((f) => f.isFile())
            .map((f) => f.name)
            .filter((name) => !/^cover\./i.test(name))
            .filter((name) => /\.(png|jpe?g|webp|gif)$/i.test(name))
            .sort(sortByNumericThenLex)
            .map((filename) => `/content/manga/${seriesId}/${chapterId}/${filename}`);

        const chapterNum = parseInt(String(chapterId).replace(/\D/g, ''), 10);
        const fallbackTitle = Number.isFinite(chapterNum) ? `Chapter ${chapterNum}` : chapterId;
        const baseChapter = baseById.get(chapterId) || {};

        return {
            ...baseChapter,
            id: chapterId,
            title: baseChapter.title || fallbackTitle,
            pages
        };
    });

    // Keep ordering stable / numeric by chapter id (ch1, ch2, ...)
    chapters.sort((a, b) => {
        const na = parseInt(String(a.id).replace(/\D/g, ''), 10) || 0;
        const nb = parseInt(String(b.id).replace(/\D/g, ''), 10) || 0;
        return na - nb;
    });

    return chapters;
}

function sortByNumericThenLex(a, b) {
    const na = extractFirstNumber(a);
    const nb = extractFirstNumber(b);
    if (na !== nb) return na - nb;
    return String(a).localeCompare(String(b));
}

function extractFirstNumber(filename) {
    const match = String(filename).match(/(\d+)/);
    return match ? parseInt(match[1], 10) : Number.POSITIVE_INFINITY;
}

function usersDbPath() {
    return path.join(__dirname, 'data', 'users.json');
}

function commentsDbPath() {
    return path.join(__dirname, 'data', 'comments.json');
}

function readCommentsDb() {
    try {
        const p = commentsDbPath();
        if (!fs.existsSync(p)) return { comments: [] };
        const raw = fs.readFileSync(p, 'utf8');
        const parsed = JSON.parse(raw);
        return { comments: Array.isArray(parsed.comments) ? parsed.comments : [] };
    } catch {
        return { comments: [] };
    }
}

function writeCommentsDb(db) {
    const p = commentsDbPath();
    fs.writeFileSync(p, JSON.stringify({ comments: db.comments || [] }, null, 2), 'utf8');
}

function readUsersDb() {
    try {
        const p = usersDbPath();
        if (!fs.existsSync(p)) return { users: [] };
        const raw = fs.readFileSync(p, 'utf8');
        const parsed = JSON.parse(raw);
        const users = Array.isArray(parsed.users) ? parsed.users : [];
        // Backward-compat: ensure favorites exists
        const normalized = users.map(u => ({
            ...u,
            favorites: Array.isArray(u.favorites) ? u.favorites : [],
            recentViewed: Array.isArray(u.recentViewed) ? u.recentViewed : [],
            leftOff: (u.leftOff && typeof u.leftOff === 'object') ? u.leftOff : null,
            avatarUrl: (typeof u.avatarUrl === 'string') ? u.avatarUrl : '',
            bio: (typeof u.bio === 'string') ? u.bio : ''
        }));
        return { users: normalized };
    } catch (e) {
        return { users: [] };
    }
}

// Chapter left off (per-account)
app.get('/api/leftoff', requireAuthJson, (req, res) => {
    const user = getCurrentUser(req);
    return res.json({ leftOff: user.leftOff || null });
});

app.post('/api/leftoff', requireAuthJson, (req, res) => {
    const seriesId = (req.body.seriesId || '').toString().trim();
    const chapterId = (req.body.chapterId || '').toString().trim();
    const pageIndex = Number(req.body.pageIndex);
    const pageCount = Number(req.body.pageCount);

    if (!seriesId || !chapterId) return res.status(400).json({ error: 'seriesId and chapterId are required' });
    if (!Number.isFinite(pageIndex) || pageIndex < 0) return res.status(400).json({ error: 'pageIndex must be >= 0' });
    if (!Number.isFinite(pageCount) || pageCount < 0) return res.status(400).json({ error: 'pageCount must be >= 0' });

    const db = readUsersDb();
    const idx = db.users.findIndex(u => u.id === req.session.userId);
    if (idx < 0) return res.status(401).json({ error: 'Not logged in' });

    const user = db.users[idx];
    const leftOff = {
        seriesId,
        chapterId,
        pageIndex,
        pageCount,
        at: new Date().toISOString()
    };

    db.users[idx] = { ...user, leftOff };
    writeUsersDb(db);

    return res.json({ ok: true, leftOff });
});

app.delete('/api/leftoff', requireAuthJson, (req, res) => {
    const db = readUsersDb();
    const idx = db.users.findIndex(u => u.id === req.session.userId);
    if (idx < 0) return res.status(401).json({ error: 'Not logged in' });

    const user = db.users[idx];
    db.users[idx] = { ...user, leftOff: null };
    writeUsersDb(db);

    return res.json({ ok: true, leftOff: null });
});

function writeUsersDb(db) {
    const p = usersDbPath();
    // Use direct write for Windows compatibility (rename cannot overwrite existing files on Windows)
    fs.writeFileSync(p, JSON.stringify({ users: db.users || [] }, null, 2), 'utf8');
}

function getCurrentUser(req) {
    const userId = req.session?.userId;
    if (!userId) return null;
    const db = readUsersDb();
    return db.users.find(u => u.id === userId) || null;
}

function requireAuth(req, res, next) {
    const user = getCurrentUser(req);
    if (!user) return res.redirect('/auth#login');
    return next();
}

function requireAuthJson(req, res, next) {
    const user = getCurrentUser(req);
    if (!user) return res.status(401).json({ error: 'Not logged in' });
    return next();
}

// Serve static files from the root directory (after routes)
app.use('/uploads', express.static(uploadsRoot));
app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Visit http://localhost:${PORT} to view the site`);
});

