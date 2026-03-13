# Newsify — Remade and Running

Newsify is a misinformation-filtering news platform that verifies news articles and images using AI and trusted sources. It aggregates news from multiple reliable publications and cross-checks the validity of media content. This is a fully functional recreation of the original project, developed in 2026 as part of my Grade 10 hackathon experience.

### **Demo Video:** [Newsify Video](https://www.youtube.com/watch?v=fQQC8_rNQTc&t=13140s)
### **Website:** [Newsify Live](https://newsify-seven.vercel.app)
---

## What is Newsify

Newsify fetches live news articles and runs two-tier verification on every story:

- **Tier 1 — Heuristic Analysis:** Scans headlines for clickbait patterns, sensational words, ALL CAPS, punctuation, and credibility markers.
- **Tier 2 — Google Fact Check API:** Cross-references headlines against claims verified by Snopes, PolitiFact, AFP, and other professional fact-checkers.

Users can also submit suspicious articles for review, subscribe to a newsletter, and send feedback. All user data is stored in Supabase.

---

## Tech Stack

| Layer          | Technology |
|----------------|------------|
| Frontend       | React (JSX) |
| News Data      | NewsAPI |
| Fact Checking  | Google Fact Check Tools API + Heuristic Engine |
| Database       | Supabase (PostgreSQL) |
| Styling        | CSS-in-JS (no external UI library) |

---

## Prerequisites

Before starting, make sure you have:

- Node.js v16 or higher
- npm (comes with Node.js)
- A code editor (VS Code or WebStorm recommended)

---

## Setup Instructions

### Step 1 — Clone the Project

```bash
git clone https://github.com/yourusername/newsify.git
cd newsify
```

Or create a new React app and replace files:
```bash
npx create-react-app newsify
cd newsify
```
### Step 2 — Install Dependencies
```bash
npm install
```
### Step 3 — Add Project Files

1. Delete src/App.js and src/App.css.

2. Copy Newsify.jsx into the src/ folder.

3. Update src/index.js import:

4. import App from './Newsify';

5. Place your logo (Designer.png) in the public/ folder.

### Step 4 — Configure API Keys

Create a .env file in the root folder:
```bash
REACT_APP_NEWS_API_KEY=your_newsapi_key_here
REACT_APP_FACT_CHECK_KEY=your_google_fact_check_key_here
REACT_APP_SUPABASE_URL=https://your-project-id.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

> Do not commit .env to GitHub.

### Step 5 — Supabase Setup

Sign up at supabase.com and create a new project.

``` bash
Copy Project URL → REACT_APP_SUPABASE_URL.
Copy anon public key → REACT_APP_SUPABASE_ANON_KEY.
```
#### Create Tables via SQL Editor
```sql
CREATE TABLE newsletter (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  created_at timestamp DEFAULT now()
);

CREATE TABLE feedback (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text,
  email text,
  feedback text NOT NULL,
  created_at timestamp DEFAULT now()
);

CREATE TABLE news_submissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  article_text text NOT NULL,
  status text DEFAULT 'pending',
  created_at timestamp DEFAULT now()
);
```
### Step 6 — Run the App
```bash
npm start
```

> Open http://localhost:3000 to view the app.


## Badge Meanings
| Badge              | Meaning                                |
| ------------------ | -------------------------------------- |
| Verified           | Confirmed credible by fact-checkers    |
| Disputed           | Flagged as false or misleading         |
| Mixed              | Partially verified                     |
| Unverified         | No strong signals detected             |
| Likely Sensational | Heuristic detected clickbait patterns  |
| Credible Language  | Heuristic detected credibility markers |

## Troubleshooting
| Problem                     | Fix                                                                          |
| --------------------------- | ---------------------------------------------------------------------------- |
| News not loading            | Check `REACT_APP_NEWS_API_KEY` and restart server                            |
| All cards show "Unverified" | Google Fact Check may not have that claim — heuristic runs as fallback       |
| Supabase insert failing     | Table names must match exactly: `newsletter`, `feedback`, `news_submissions` |
| Logo not showing            | Ensure `Designer.png` is in `public/`                                        |
| API keys not working        | Restart `npm start` after editing `.env`                                     |
| CORS error in production    | Free NewsAPI blocks browser requests — use backend proxy                     |

## License
MIT — free to use, modify, and distribute.

Built with React, NewsAPI, Google Fact Check Tools, and Supabase.

