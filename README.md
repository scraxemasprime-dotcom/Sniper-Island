# Sniper Island

A local web application for reading manga.

## Setup

1. Install Node.js (if not already installed)
2. Install dependencies:
   ```bash
   npm install
   ```

## Running the Server

Start the local server:
```bash
npm start
```

The app will be available at: http://localhost:3000

## Routes

- `/` - Home page with featured manga
- `/manga` - Manga library (browse all manga)
- `/reader?manga=id` - Manga reader (read manga chapters)

## Project Structure

```
manga-anime-site/
  pages/          - HTML pages
  assets/         - CSS and JavaScript files
  data/           - JSON data files (manga.json)
  content/        - Manga content (images)
```

## Adding Manga

1. Add manga entries to `data/manga.json`
2. Add manga images to `content/manga/[manga-id]/`
3. Update the JSON with correct paths to your images

