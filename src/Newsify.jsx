import { useState, useEffect, useCallback, useRef } from "react";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const NEWS_API_KEY      = process.env.REACT_APP_NEWS_API_KEY;
const NEWS_API_URL     = "https://newsapi.org/v2/top-headlines";
const FACT_CHECK_KEY    = process.env.REACT_APP_FACT_CHECK_KEY;
const FACT_CHECK_URL    = "https://factchecktools.googleapis.com/v1alpha1/claims:search";
const SUPABASE_URL      = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;
const CATEGORIES = ["General","Business","Entertainment","Health","Science","Sports","Technology"];

// ─── SUPABASE ────────────────────────────────────────────────────────────────
const supabase = {
  from: (table) => ({
    insert: async (rows) => {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify(rows),
        });
        return res.ok ? { error: null } : { error: await res.json() };
      } catch (e) { return { error: e }; }
    },
  }),
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmtDate = (d) => {
  const diff = Date.now() - new Date(d);
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `${Math.floor(diff / 60000)} min ago`;
  if (h < 24) return `${h} hrs ago`;
  return new Date(d).toLocaleDateString("en-US", { day:"numeric", month:"short", year:"numeric" });
};

// ─── FACT CHECK ───────────────────────────────────────────────────────────────
// Tier 1: Heuristic analysis — always works on any headline
function heuristicCheck(title, description = "") {
  const text = (title + " " + description).toLowerCase();
  const sensational = [
    "you won't believe","shocking","bombshell","explosive","secret","exposed",
    "they don't want you to know","miracle","cure","never before",
    "mainstream media won't","wake up","deep state","hoax",
    "breaking!!!","urgent!!!","must share","100% proven","doctors hate",
    "this one weird","share before","they're hiding"
  ];
  const credible = [
    "study finds","research shows","according to","officials say","report:",
    "survey:","data shows","scientists","university","published","confirmed",
    "per the","sources say","analysts","researchers","journal"
  ];
  const allCaps   = title.replace(/\s/g,"").length > 8 && (title.match(/[A-Z]/g)||[]).length / title.replace(/\s/g,"").length > 0.5;
  const excessPunct = /(!!+|\?\?+)/.test(title);
  const sensHits  = sensational.filter(w => text.includes(w)).length;
  const credHits  = credible.filter(w => text.includes(w)).length;

  if (allCaps || excessPunct || sensHits >= 2)
    return { status:"false", rating:"Likely Sensational", source:"Heuristic", reason:"Contains clickbait or sensational language patterns" };
  if (sensHits === 1 && credHits === 0)
    return { status:"mixed",  rating:"Needs Verification", source:"Heuristic", reason:"Contains some unverified or sensational language" };
  if (credHits >= 2)
    return { status:"true",   rating:"Credible Language",  source:"Heuristic", reason:"Contains credibility markers (study, data, officials)" };
  return { status:"neutral", rating:"Unverified", source:"Heuristic", reason:"No strong credibility signals detected" };
}

// Tier 2: Google Fact Check Tools API — checks against known fact-checked claims
async function googleFactCheck(title) {
  try {
    const q = title.split(" ")
      .filter(w => !["the","is","a","an","of","on","in","and","for","with","this","that","to"].includes(w.toLowerCase()))
      .slice(0, 6).join(" ");
    const res  = await fetch(`${FACT_CHECK_URL}?key=${FACT_CHECK_KEY}&query=${encodeURIComponent(q)}&languageCode=en-US&pageSize=5`);
    const data = await res.json();
    if (!res.ok) { console.warn("Google FC API:", data?.error?.message); return null; }
    if (data.claims?.length) {
      for (const claim of data.claims) {
        const rev = claim.claimReview?.[0];
        if (rev?.textualRating) {
          const r   = rev.textualRating.toLowerCase();
          const ok  = ["true","correct","accurate","confirmed","verified"].some(x => r.includes(x));
          const bad = ["false","incorrect","misleading","disputed","fake","wrong","misinformation","pants"].some(x => r.includes(x));
          return {
            status: ok ? "true" : bad ? "false" : "mixed",
            rating: rev.textualRating,
            source: rev.publisher?.name || "Google Fact Check",
            reason: `Fact-checked by ${rev.publisher?.name || "a fact-checker"}`
          };
        }
      }
    }
    return null; // no claim found — fall through to heuristic
  } catch (e) {
    console.warn("Google FC failed:", e.message);
    return null;
  }
}

// Combined: Google first, heuristic if Google has no data
async function getFactCheck(title, description = "") {
  const googleResult = await googleFactCheck(title);
  if (googleResult) return googleResult;           // ✅ Google had a match
  return heuristicCheck(title, description);       // ⚡ Fall back to heuristic
}

// ─── MOCK DATA ────────────────────────────────────────────────────────────────
const MOCK = [
  { title:"Scientists Discover Carbon Capture Breakthrough", description:"Researchers at MIT developed a technique that captures CO₂ from the atmosphere at previously impossible scales, offering new hope for climate action.", source:{name:"Science Daily"}, publishedAt:new Date(Date.now()-7200000).toISOString(), urlToImage:"https://images.unsplash.com/photo-1532094349884-543559cfc512?w=600&q=80", url:"#", author:"Dr. Sarah Chen" },
  { title:"You WON'T BELIEVE What They're Hiding About 5G Towers!!!", description:"SHOCKING truth exposed! The mainstream media refuses to report on the devastating secret behind 5G technology that affects your health.", source:{name:"Unknown Blog"}, publishedAt:new Date(Date.now()-3600000).toISOString(), urlToImage:"https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80", url:"#", author:"Anonymous" },
  { title:"Global AI Summit Reaches Historic Safety Agreement", description:"World leaders and tech giants signed landmark guidelines for artificial intelligence development and deployment worldwide.", source:{name:"TechCrunch"}, publishedAt:new Date(Date.now()-18000000).toISOString(), urlToImage:"https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=600&q=80", url:"#", author:"Marcus Johnson" },
  { title:"Study Finds Mediterranean Diet Reduces Heart Disease Risk by 30%", description:"A large-scale clinical study published in the New England Journal of Medicine confirms the cardiovascular benefits of the Mediterranean diet after 7 years of data.", source:{name:"Nature"}, publishedAt:new Date(Date.now()-28800000).toISOString(), urlToImage:"https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&q=80", url:"#", author:"Prof. Elena Vasquez" },
  { title:"Miracle Cure Doctors Don't Want You to Know About!", description:"This one weird trick cures everything — cancer, diabetes, aging. Share before they delete this!", source:{name:"HealthTruth.net"}, publishedAt:new Date(Date.now()-43200000).toISOString(), urlToImage:"https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=600&q=80", url:"#", author:"Dr. John" },
  { title:"NASA Confirms Water Ice Deposits on Mars Surface", description:"Accessible water ice on the Martian surface opens new possibilities for future crewed missions to the red planet, scientists confirm.", source:{name:"NASA"}, publishedAt:new Date(Date.now()-86400000).toISOString(), urlToImage:"https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?w=600&q=80", url:"#", author:"Dr. James Park" },
  { title:"Central Banks Signal Coordinated Rate Cuts Across G7", description:"Finance ministers reached an informal consensus that overlapping rate reductions could stabilize global markets amid ongoing uncertainty.", source:{name:"Bloomberg"}, publishedAt:new Date(Date.now()-10800000).toISOString(), urlToImage:"https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=600&q=80", url:"#", author:"Fiona Graves" },
  { title:"The REAL Reason They're Putting Chemicals in Your Water", description:"Deep state conspiracy exposed. Officials confirm what they've been hiding for decades about fluoride. Wake up sheeple!!!", source:{name:"TruthAlert"}, publishedAt:new Date(Date.now()-36000000).toISOString(), urlToImage:"https://images.unsplash.com/photo-1611605698335-8b1569810432?w=600&q=80", url:"#", author:"Anon" },
  { title:"Ocean Cleanup Project Removes 10 Million Pounds of Plastic", description:"The Ocean Cleanup initiative announced it has extracted a record amount of plastic from the Great Pacific Garbage Patch this quarter.", source:{name:"BBC"}, publishedAt:new Date(Date.now()-172800000).toISOString(), urlToImage:"https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80", url:"#", author:"Liam Foster" },
];

// ─── STYLES ───────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Lora:ital,wght@0,600;0,700;1,500&display=swap');

  :root {
    --navy:    #0f172a;
    --navy2:   #1e293b;
    --navy3:   #334155;
    --coral:   #f43f5e;
    --coral2:  #fb7185;
    --sky:     #0ea5e9;
    --amber:   #f59e0b;
    --emerald: #10b981;
    --red:     #ef4444;
    --bg:      #f8fafc;
    --bg2:     #f1f5f9;
    --white:   #ffffff;
    --text:    #0f172a;
    --text2:   #475569;
    --text3:   #94a3b8;
    --border:  #e2e8f0;
    --border2: #cbd5e1;
    --shadow:  0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
    --shadow2: 0 4px 24px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06);
    --shadow3: 0 20px 40px rgba(0,0,0,0.12);
  }
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  html { scroll-behavior:smooth; }
  body { font-family:'Outfit',system-ui,sans-serif; background:var(--bg); color:var(--text); -webkit-font-smoothing:antialiased; }

  /* NAVBAR */
  .navbar {
    background:var(--navy); padding:0 32px;
    display:flex; align-items:center; gap:28px;
    height:62px; position:sticky; top:0; z-index:100;
    box-shadow:0 2px 20px rgba(0,0,0,0.25);
  }
  .navbar::after {
    content:''; position:absolute; bottom:0; left:0; right:0; height:2px;
    background:linear-gradient(90deg,var(--coral),var(--sky),var(--coral));
    background-size:200% 100%; animation:shimmer-bar 4s linear infinite;
  }
  @keyframes shimmer-bar { 0%{background-position:0% 0} 100%{background-position:200% 0} }

  .brand { display:flex; align-items:center; gap:10px; text-decoration:none; flex-shrink:0; }
  .brand-icon {
    width:28px; height:28px; border-radius:6px;
    display:flex; align-items:center; justify-content:center;
    overflow:hidden; flex-shrink:0;
  }
  .brand-name { font-size:20px; font-weight:800; color:#fff; letter-spacing:-0.5px; }
  .brand-name span { color:var(--coral2); }

  .search-wrap {
    flex:1; max-width:400px; display:flex; align-items:center;
    background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.12);
    border-radius:10px; overflow:hidden; transition:all 0.2s;
  }
  .search-wrap:focus-within {
    background:rgba(255,255,255,0.13); border-color:rgba(14,165,233,0.5);
    box-shadow:0 0 0 3px rgba(14,165,233,0.15);
  }
  .search-wrap input {
    flex:1; background:none; border:none; outline:none;
    padding:10px 16px; color:#fff; font-size:14px;
    font-family:'Outfit',sans-serif;
  }
  .search-wrap input::placeholder { color:rgba(255,255,255,0.35); }
  .search-wrap button {
    background:none; border:none; padding:0 16px;
    color:rgba(255,255,255,0.5); font-size:17px; cursor:pointer; transition:color 0.2s;
  }
  .search-wrap button:hover { color:var(--sky); }

  .nav-actions { margin-left:auto; display:flex; gap:8px; align-items:center; }
  .nbtn { padding:8px 16px; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; font-family:'Outfit',sans-serif; transition:all 0.18s; letter-spacing:0.2px; }
  .nbtn-ghost { background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.12); color:rgba(255,255,255,0.75); }
  .nbtn-ghost:hover { background:rgba(255,255,255,0.13); color:#fff; }
  .nbtn-coral { background:var(--coral); border:1px solid var(--coral); color:#fff; box-shadow:0 4px 14px rgba(244,63,94,0.35); }
  .nbtn-coral:hover { background:#e11d48; transform:translateY(-1px); }

  /* CATEGORY NAV */
  .cat-nav {
    background:var(--white); border-bottom:1px solid var(--border);
    padding:0 32px; display:flex; overflow-x:auto; scrollbar-width:none;
    box-shadow:var(--shadow);
  }
  .cat-nav::-webkit-scrollbar { display:none; }
  .cat-btn {
    padding:14px 18px; background:none; border:none;
    border-bottom:2px solid transparent;
    font-size:13.5px; font-weight:500; color:var(--text2);
    cursor:pointer; transition:all 0.18s; white-space:nowrap;
    font-family:'Outfit',sans-serif;
  }
  .cat-btn:hover { color:var(--text); }
  .cat-btn.active { color:var(--coral); border-bottom-color:var(--coral); font-weight:700; }

  /* HEADING */
  .page-heading-wrap { text-align:center; padding:40px 24px 12px; }
  .page-heading { font-family:'Lora',Georgia,serif; font-size:clamp(22px,3vw,30px); font-weight:700; color:var(--navy); }
  .page-subheading { margin-top:6px; font-size:14px; color:var(--text3); }
  .heading-line { width:48px; height:3px; border-radius:2px; background:linear-gradient(90deg,var(--coral),var(--sky)); margin:14px auto 0; }

  /* LEGEND */
  .legend {
    display:flex; align-items:center; gap:16px; justify-content:center;
    padding:14px 24px; flex-wrap:wrap;
    font-size:12px; color:var(--text3);
  }
  .legend-item { display:flex; align-items:center; gap:5px; }
  .legend-dot { width:8px; height:8px; border-radius:50%; }

  /* AI BANNER */
  .ai-banner {
    max-width:1220px; margin:0 auto 0; padding:0 24px;
  }
  .ai-banner-inner {
    background:linear-gradient(135deg,rgba(14,165,233,0.08),rgba(244,63,94,0.05));
    border:1px solid rgba(14,165,233,0.2); border-radius:12px;
    padding:12px 18px; display:flex; align-items:center; gap:12px;
    font-size:13px; color:var(--text2);
  }
  .ai-banner-inner .ai-icon { font-size:20px; flex-shrink:0; }
  .ai-banner code { background:rgba(14,165,233,0.1); color:var(--sky); padding:2px 7px; border-radius:4px; font-size:12px; font-family:'Courier New',monospace; }

  /* MAIN */
  .main-container { max-width:1220px; margin:0 auto; padding:24px 24px 72px; }
  .news-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:26px; }
  @media(max-width:960px) { .news-grid { grid-template-columns:repeat(2,1fr); } }
  @media(max-width:580px)  { .news-grid { grid-template-columns:1fr; } .nav-actions { display:none; } }

  /* CARD */
  .news-card {
    background:var(--white); border-radius:14px; border:1px solid var(--border);
    overflow:hidden; display:flex; flex-direction:column;
    box-shadow:var(--shadow); transition:transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
  }
  .news-card:hover { transform:translateY(-4px); box-shadow:var(--shadow3); border-color:var(--border2); }
  .news-card.flagged { border-color:rgba(239,68,68,0.35); box-shadow:0 0 0 1px rgba(239,68,68,0.15); }

  .card-img-wrap { position:relative; height:210px; overflow:hidden; background:var(--bg2); flex-shrink:0; }
  .card-img { width:100%; height:100%; object-fit:cover; display:block; transition:transform 0.4s ease; }
  .news-card:hover .card-img { transform:scale(1.05); }
  .img-overlay { position:absolute; inset:0; background:linear-gradient(to top,rgba(15,23,42,0.55) 0%,transparent 55%); }

  .source-badge {
    position:absolute; bottom:10px; right:10px;
    background:rgba(15,23,42,0.75); backdrop-filter:blur(8px);
    color:#fff; font-size:10px; font-weight:700;
    padding:4px 9px; border-radius:20px;
    border:1px solid rgba(255,255,255,0.15);
    max-width:130px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  }

  /* FC BADGE */
  .fc-badge {
    position:absolute; top:10px; left:10px;
    font-size:10px; font-weight:700; padding:4px 10px; border-radius:20px;
    backdrop-filter:blur(8px); border:1px solid currentColor;
    display:flex; align-items:center; gap:5px; letter-spacing:0.3px;
  }
  .fc-dot { width:6px; height:6px; border-radius:50%; background:currentColor; flex-shrink:0; }
  .fc-true    { color:#10b981; background:rgba(16,185,129,0.18); }
  .fc-false   { color:#ef4444; background:rgba(239,68,68,0.22);  }
  .fc-mixed   { color:#f59e0b; background:rgba(245,158,11,0.18); }
  .fc-neutral { color:rgba(255,255,255,0.7); background:rgba(0,0,0,0.3); border-color:rgba(255,255,255,0.2); }
  .fc-checking{
    color:rgba(255,255,255,0.6); background:rgba(0,0,0,0.3);
    border-color:rgba(255,255,255,0.15); animation:fc-pulse 1.3s ease infinite;
  }
  @keyframes fc-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

  /* CARD BODY */
  .card-body { padding:18px 18px 16px; flex:1; display:flex; flex-direction:column; gap:9px; }
  .card-category-tag {
    display:inline-flex; align-items:center;
    font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px;
    color:var(--coral); background:rgba(244,63,94,0.08);
    padding:3px 9px; border-radius:20px; width:fit-content;
  }
  .card-title {
    font-family:'Lora',Georgia,serif;
    font-size:16px; font-weight:600; line-height:1.45; color:var(--navy);
    display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;
  }
  .card-desc {
    font-size:13px; color:var(--text2); line-height:1.65; flex:1;
    display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
  }

  /* FC REASON strip */
  .fc-reason {
    font-size:11px; color:var(--text3); line-height:1.5;
    background:var(--bg2); border-radius:6px; padding:6px 10px;
    border-left:3px solid var(--border2);
    display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
  }
  .fc-reason.reason-false { border-left-color:#ef4444; background:rgba(239,68,68,0.05); color:#b91c1c; }
  .fc-reason.reason-true  { border-left-color:#10b981; background:rgba(16,185,129,0.05); color:#065f46; }
  .fc-reason.reason-mixed { border-left-color:#f59e0b; background:rgba(245,158,11,0.05); color:#92400e; }

  .card-footer { margin-top:auto; padding-top:12px; border-top:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .card-meta { font-size:11.5px; color:var(--text3); line-height:1.5; }
  .card-meta strong { color:var(--text2); font-weight:600; }
  .read-btn {
    flex-shrink:0; padding:7px 16px;
    background:var(--navy); color:#fff; border:none; border-radius:8px;
    font-size:12.5px; font-weight:600; cursor:pointer;
    font-family:'Outfit',sans-serif; transition:all 0.18s; white-space:nowrap;
  }
  .read-btn:hover { background:var(--coral); transform:translateY(-1px); box-shadow:0 4px 12px rgba(244,63,94,0.3); }

  /* SKELETON */
  @keyframes sk-shimmer { 0%{background-position:-600px 0} 100%{background-position:600px 0} }
  .sk {
    background:linear-gradient(90deg,var(--bg2) 25%,var(--bg) 50%,var(--bg2) 75%);
    background-size:600px 100%; animation:sk-shimmer 1.5s infinite; border-radius:6px;
  }
  .skel-card { background:var(--white); border:1px solid var(--border); border-radius:14px; overflow:hidden; box-shadow:var(--shadow); }

  /* EMPTY */
  .empty { text-align:center; padding:72px 20px; color:var(--text3); }
  .empty-icon { font-size:52px; margin-bottom:14px; opacity:0.6; }
  .empty h3 { font-size:18px; font-weight:600; color:var(--text2); margin-bottom:6px; }

  /* MODAL */
  .overlay {
    position:fixed; inset:0; background:rgba(15,23,42,0.6);
    backdrop-filter:blur(6px); z-index:200;
    display:flex; align-items:center; justify-content:center; padding:20px;
    animation:fade-in 0.2s ease;
  }
  @keyframes fade-in { from{opacity:0} to{opacity:1} }
  .modal {
    background:var(--white); border-radius:16px;
    width:100%; max-width:480px; padding:32px;
    position:relative; max-height:90vh; overflow-y:auto;
    box-shadow:var(--shadow3); animation:modal-up 0.25s ease;
  }
  @keyframes modal-up { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
  .modal-emoji { font-size:36px; margin-bottom:12px; display:block; }
  .modal h2 { font-family:'Lora',serif; font-size:22px; font-weight:700; color:var(--navy); margin-bottom:6px; }
  .modal p  { font-size:14px; color:var(--text2); margin-bottom:22px; line-height:1.65; }
  .field { margin-bottom:16px; }
  .field label { display:block; font-size:11px; font-weight:700; color:var(--text3); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.7px; }
  .field input, .field textarea {
    width:100%; padding:11px 14px; border:1.5px solid var(--border); border-radius:9px;
    font-size:14px; font-family:'Outfit',sans-serif; color:var(--text); background:var(--bg);
    outline:none; transition:all 0.18s; resize:vertical;
  }
  .field input:focus, .field textarea:focus { border-color:var(--sky); background:var(--white); box-shadow:0 0 0 3px rgba(14,165,233,0.12); }
  .modal-submit {
    width:100%; padding:12px; background:var(--coral); color:#fff; border:none;
    border-radius:9px; font-size:14px; font-weight:700;
    font-family:'Outfit',sans-serif; cursor:pointer; transition:all 0.18s;
    box-shadow:0 4px 14px rgba(244,63,94,0.3);
  }
  .modal-submit:hover { background:#e11d48; transform:translateY(-1px); }
  .modal-submit:disabled { opacity:0.5; cursor:not-allowed; transform:none; box-shadow:none; }
  .modal-close {
    position:absolute; top:16px; right:18px; background:none; border:none;
    font-size:20px; cursor:pointer; color:var(--text3); padding:4px; border-radius:6px; transition:all 0.15s;
  }
  .modal-close:hover { color:var(--text); background:var(--bg2); }
  .msg-ok  { margin-top:14px; padding:12px 16px; background:#ecfdf5; color:#065f46; border-radius:9px; font-size:13.5px; font-weight:500; border:1px solid #a7f3d0; }
  .msg-err { margin-top:14px; padding:12px 16px; background:#fff1f2; color:#9f1239; border-radius:9px; font-size:13.5px; font-weight:500; border:1px solid #fecdd3; }

  /* FOOTER */
  .footer {
    background:var(--navy); padding:28px 32px;
    display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:14px;
  }
  .footer-left { font-size:13px; color:rgba(255,255,255,0.4); }
  .footer-left strong { color:rgba(255,255,255,0.75); font-weight:700; }
  .footer-links { display:flex; gap:4px; }
  .footer-link {
    color:rgba(255,255,255,0.45); cursor:pointer; padding:6px 12px;
    background:none; border:none; font-size:13px; font-family:'Outfit',sans-serif;
    transition:all 0.15s; border-radius:6px;
  }
  .footer-link:hover { color:#fff; background:rgba(255,255,255,0.08); }

  @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
  .fade-up { animation:fadeUp 0.4s ease both; }
`;

// ─── SKELETON ─────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="skel-card">
      <div className="sk" style={{ height:210 }} />
      <div style={{ padding:"18px 18px 16px", display:"flex", flexDirection:"column", gap:10 }}>
        <div className="sk" style={{ height:10, width:"30%" }} />
        <div className="sk" style={{ height:18 }} />
        <div className="sk" style={{ height:18, width:"80%" }} />
        <div className="sk" style={{ height:12 }} />
        <div className="sk" style={{ height:12, width:"60%" }} />
        <div className="sk" style={{ height:36, borderRadius:8 }} />
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:4, paddingTop:12, borderTop:"1px solid #e2e8f0" }}>
          <div className="sk" style={{ height:12, width:"40%" }} />
          <div className="sk" style={{ height:32, width:90, borderRadius:8 }} />
        </div>
      </div>
    </div>
  );
}

// ─── NEWS CARD ────────────────────────────────────────────────────────────────
function NewsCard({ article, index, category }) {
  const [fc, setFc]     = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      const result = await getFactCheck(article.title, article.description);
      if (!alive) return;
      setFc(result); setDone(true);
    }, index * 300 + 200);
    return () => { alive = false; clearTimeout(t); };
  }, [article.title, article.description, index]);

  const getBadge = () => {
    if (!done) return { cls:"fc-checking", label:"Analysing…" };
    if (!fc)   return { cls:"fc-neutral",  label:"Unverified" };
    const map = { true:"fc-true", false:"fc-false", mixed:"fc-mixed", neutral:"fc-neutral" };
    return { cls: map[fc.status] || "fc-neutral", label: fc.rating || "Unverified" };
  };

  const { cls, label } = getBadge();
  const isFlagged = done && fc?.status === "false";

  return (
    <article className={`news-card fade-up${isFlagged ? " flagged" : ""}`}
      style={{ animationDelay:`${Math.min(index*0.065,0.55)}s` }}>
      <div className="card-img-wrap">
        {article.urlToImage
          ? <img className="card-img" src={article.urlToImage} alt="" loading="lazy"
              onError={e => e.target.parentElement.style.background="#e2e8f0"} />
          : <div style={{ width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:40,opacity:0.2 }}>📰</div>
        }
        <div className="img-overlay" />
        <span className="source-badge">{article.source?.name}</span>
        <span className={`fc-badge ${cls}`} title={fc?.source ? `Source: ${fc.source}` : "Analysing…"}>
          <span className="fc-dot" />
          {label}{fc?.source === "Google Fact Check" || (fc?.source && fc.source !== "Heuristic") ? " ✓" : ""}
        </span>
      </div>

      <div className="card-body">
        <span className="card-category-tag">{category || "News"}</span>
        <div className="card-title">{article.title}</div>
        {article.description && <div className="card-desc">{article.description}</div>}

        {/* AI reasoning strip — shows once analysis is done */}
        {done && fc?.reason && (
          <div className={`fc-reason reason-${fc.status}`}>
            🤖 {fc.reason}
          </div>
        )}

        <div className="card-footer">
          <div className="card-meta">
            <strong>{article.author?.split(",")[0]?.slice(0,28) || "Staff"}</strong><br/>
            {fmtDate(article.publishedAt)}
          </div>
          <button className="read-btn"
            onClick={() => article.url !== "#" && window.open(article.url,"_blank")}>
            Read More →
          </button>
        </div>
      </div>
    </article>
  );
}

// ─── MODALS ──────────────────────────────────────────────────────────────────
function SubscribeModal({ onClose }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy]   = useState(false);
  const [msg, setMsg]     = useState(null);
  const go = async () => {
    if (!email.includes("@")) return;
    setBusy(true);
    const { error } = await supabase.from("newsletter").insert([{ email }]);
    setMsg(error ? "err" : "ok"); setBusy(false);
    if (!error) setTimeout(onClose, 1800);
  };
  return (
    <div className="overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal">
        <button className="modal-close" onClick={onClose}>×</button>
        <span className="modal-emoji">📬</span>
        <h2>Stay in the Loop</h2>
        <p>Get curated, fact-checked headlines delivered to your inbox. No spam, no misinformation — ever.</p>
        <div className="field">
          <label>Email Address</label>
          <input type="email" placeholder="you@email.com" value={email}
            onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key==="Enter"&&go()} autoFocus />
        </div>
        {msg==="ok"  && <div className="msg-ok">✓ You're subscribed! Welcome to Newsify.</div>}
        {msg==="err" && <div className="msg-err">✗ Something went wrong. Check Supabase config.</div>}
        {!msg && <button className="modal-submit" onClick={go} disabled={busy}>{busy?"Subscribing…":"Subscribe — It's Free"}</button>}
      </div>
    </div>
  );
}

function SubmitModal({ onClose }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg]   = useState(null);
  const go = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("news_submissions").insert([{ article_text: text, status:"pending" }]);
    setMsg(error ? "err" : "ok"); setBusy(false);
    if (!error) setTimeout(onClose, 1800);
  };
  return (
    <div className="overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal">
        <button className="modal-close" onClick={onClose}>×</button>
        <span className="modal-emoji">🔍</span>
        <h2>Submit for Fact-Check</h2>
        <p>Paste a suspicious article, headline, or claim and our system will queue it for review.</p>
        <div className="field">
          <label>Article or Claim</label>
          <textarea rows={5} placeholder="Paste article text or headline here…" value={text} onChange={e => setText(e.target.value)} autoFocus />
        </div>
        {msg==="ok"  && <div className="msg-ok">✓ Submitted! We'll review it shortly.</div>}
        {msg==="err" && <div className="msg-err">✗ Submission failed. Check Supabase config.</div>}
        {!msg && <button className="modal-submit" onClick={go} disabled={busy||!text.trim()}>{busy?"Submitting…":"Submit for Review"}</button>}
      </div>
    </div>
  );
}

function FeedbackModal({ onClose }) {
  const [f, setF]       = useState({ name:"", email:"", feedback:"" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg]   = useState(null);
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }));
  const go = async () => {
    if (!f.feedback.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("feedback").insert([f]);
    setMsg(error ? "err" : "ok"); setBusy(false);
    if (!error) setTimeout(onClose, 1800);
  };
  return (
    <div className="overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal">
        <button className="modal-close" onClick={onClose}>×</button>
        <span className="modal-emoji">💬</span>
        <h2>Send Feedback</h2>
        <p>Help us make Newsify better. We read every message.</p>
        <div className="field"><label>Your Name</label><input placeholder="Name" value={f.name} onChange={set("name")} /></div>
        <div className="field"><label>Email</label><input type="email" placeholder="you@email.com" value={f.email} onChange={set("email")} /></div>
        <div className="field"><label>Feedback</label><textarea rows={4} placeholder="Tell us what you think…" value={f.feedback} onChange={set("feedback")} autoFocus /></div>
        {msg==="ok"  && <div className="msg-ok">✓ Feedback sent! Thank you so much.</div>}
        {msg==="err" && <div className="msg-err">✗ Failed to send. Check Supabase config.</div>}
        {!msg && <button className="modal-submit" onClick={go} disabled={busy||!f.feedback.trim()}>{busy?"Sending…":"Send Feedback"}</button>}
      </div>
    </div>
  );
}

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [cat, setCat]           = useState("General");
  const [query, setQuery]       = useState("");
  const [modal, setModal]       = useState(null);
  const inputRef = useRef();

  const loadNews = useCallback(async (category, q) => {
    setLoading(true); setArticles([]);
    try {
      const url = q
        ? `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&sortBy=publishedAt&pageSize=18&language=en&apiKey=${NEWS_API_KEY}`
        : `${NEWS_API_URL}?country=in&category=${category.toLowerCase()}&pageSize=18&apiKey=${NEWS_API_KEY}`;
      const res  = await fetch(url);
      const data = await res.json();
      const list = (data.articles || []).filter(a => a.title && a.title !== "[Removed]");
      setArticles(list.length ? list : MOCK);
    } catch { setArticles(MOCK); }
    setLoading(false);
  }, []);

  useEffect(() => { loadNews("General", ""); }, [loadNews]);

  const doSearch = () => { if (query.trim()) loadNews(null, query.trim()); };
  const handleCat = (c) => { setCat(c); setQuery(""); loadNews(c, ""); };
  const heading = query ? `Results for "${query}"` : `Top ${cat} Headlines`;

  return (
    <>
      <style>{css}</style>

      {/* Navbar */}
      <nav className="navbar">
        <a className="brand" href="#">
          <div className="brand-icon"><img src={"Designer.png"} alt="Newsify" style={{ width:"28px", height:"28px", objectFit:"contain", borderRadius:"6px", display:"block" }} /></div>
          <span className="brand-name">News<span>ify</span></span>
        </a>
        <div className="search-wrap">
          <input ref={inputRef} type="text" placeholder="Search news, topics, sources…"
            value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key==="Enter"&&doSearch()} />
          <button onClick={doSearch}>⌕</button>
        </div>
        <div className="nav-actions">
          <button className="nbtn nbtn-ghost" onClick={() => setModal("submit")}>Submit News</button>
          <button className="nbtn nbtn-ghost" onClick={() => setModal("feedback")}>Feedback</button>
          <button className="nbtn nbtn-coral" onClick={() => setModal("subscribe")}>Subscribe</button>
        </div>
      </nav>

      {/* Category nav */}
      <div className="cat-nav">
        {CATEGORIES.map(c => (
          <button key={c} className={`cat-btn${c===cat?" active":""}`} onClick={() => handleCat(c)}>{c}</button>
        ))}
      </div>

      {/* Heading */}
      <div className="page-heading-wrap">
        <h1 className="page-heading">Newsify — {heading}</h1>
        <p className="page-subheading">
          Google Fact Check + Heuristic analysis on every story
        </p>
        <div className="heading-line" />
      </div>

      {/* Legend */}
      <div className="legend">
        {[
          ["#10b981","Credible / Verified"],
          ["#ef4444","Disputed / Sensational"],
          ["#f59e0b","Needs Verification"],
          ["#94a3b8","Unverified / Neutral"],
        ].map(([color, label]) => (
          <div className="legend-item" key={label}>
            <div className="legend-dot" style={{ background:color }} />
            <span>{label}</span>
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="main-container">
        {loading ? (
          <div className="news-grid">{Array(9).fill(0).map((_,i) => <SkeletonCard key={i} />)}</div>
        ) : articles.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📭</div>
            <h3>No articles found</h3>
            <p>Try a different search term or category.</p>
          </div>
        ) : (
          <div className="news-grid">
            {articles.map((a,i) => <NewsCard key={a.url||i} article={a} index={i} category={cat} />)}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-left">
          <strong>Newsify</strong> — Fighting misinformation, one headline at a time. © 2025
        </div>
        <div className="footer-links">
          <button className="footer-link" onClick={() => setModal("submit")}>Submit News</button>
          <button className="footer-link" onClick={() => setModal("subscribe")}>Newsletter</button>
          <button className="footer-link" onClick={() => setModal("feedback")}>Feedback</button>
        </div>
      </footer>

      {/* Modals */}
      {modal==="subscribe" && <SubscribeModal onClose={() => setModal(null)} />}
      {modal==="submit"    && <SubmitModal    onClose={() => setModal(null)} />}
      {modal==="feedback"  && <FeedbackModal  onClose={() => setModal(null)} />}
    </>
  );
}
