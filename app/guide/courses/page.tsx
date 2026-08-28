import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Famous Courses in GSPro | Tee365",
  description: "Real-world famous golf courses and what GSPro actually calls them.",
  robots: { index: false, follow: false },
};

const COURSES_CSS = `
  :root {
    --bg: #0b0f0d;
    --surface: #131917;
    --border: rgba(255,255,255,0.10);
    --text: #f2f5f3;
    --text-muted: #9ba79e;
    --accent: #00a651;
    --accent-soft: rgba(0,166,81,0.14);
    --flag: #e8a33d;
    --flag-soft: rgba(232,163,61,0.12);
    --flag-border: rgba(232,163,61,0.35);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); }
  body {
    font-family: "Karla", ui-sans-serif, system-ui, -apple-system, sans-serif;
    font-size: 16px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  h1 { font-family: "Fraunces", Georgia, serif; text-wrap: balance; margin: 0; }
  .review-flag {
    position: sticky; top: 0; z-index: 10;
    display: flex; align-items: center; justify-content: center; gap: 0.5rem;
    background: var(--flag); color: #24170a;
    font-family: "Karla", sans-serif; font-weight: 700; font-size: 0.8rem;
    letter-spacing: 0.06em; text-transform: uppercase; padding: 0.6rem 1rem;
  }
  .page { max-width: 720px; margin: 0 auto; padding: 2.5rem 1.5rem 5rem; }
  .back-link {
    display: inline-block; color: var(--accent); text-decoration: none;
    font-size: 0.85rem; font-weight: 600; margin-bottom: 1.5rem;
  }
  .hero { display: flex; flex-direction: column; gap: 0.6rem; margin-bottom: 1.75rem; }
  .eyebrow {
    font-family: "Karla", sans-serif; font-weight: 700; font-size: 0.72rem;
    letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent);
  }
  .hero h1 { font-size: clamp(1.8rem, 5vw, 2.3rem); font-weight: 600; }
  .hero p { color: var(--text-muted); font-size: 1.02rem; max-width: 56ch; margin: 0; }
  .caveat {
    background: var(--flag-soft); border: 1px solid var(--flag-border);
    border-radius: 10px; padding: 1rem 1.15rem; margin-bottom: 2.25rem;
    font-size: 0.92rem; color: var(--text);
  }
  .caveat strong { color: var(--flag); }
  table {
    width: 100%; border-collapse: collapse; font-size: 0.95rem;
  }
  caption {
    text-align: left; font-family: "Karla", sans-serif; font-weight: 700;
    font-size: 0.72rem; letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--accent); margin-bottom: 0.75rem;
  }
  th {
    text-align: left; font-weight: 600; color: var(--text-muted);
    font-size: 0.78rem; letter-spacing: 0.04em; text-transform: uppercase;
    padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border);
  }
  td {
    padding: 0.7rem 0.75rem; border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  tr:last-child td { border-bottom: none; }
  .real { color: var(--text); font-weight: 500; }
  .gspro { color: var(--accent); }
  .table-wrap {
    overflow-x: auto; background: var(--surface); border: 1px solid var(--border);
    border-radius: 10px; padding: 1.25rem 1.25rem 0.5rem; margin-bottom: 2.25rem;
  }
  footer {
    margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--border);
    color: var(--text-muted); font-size: 0.85rem;
  }
`;

const COURSES_BODY = `<div class="page">
  <a class="back-link" href="/guide">← Back to the quick guide</a>

  <div class="hero">
    <span class="eyebrow">Tee365 · Reference</span>
    <h1>Famous courses, and what GSPro actually calls them</h1>
    <p>Some real courses are available under their real name. Others got a cease-and-desist at some point and now show up under a fantasy name instead.</p>
  </div>

  <div class="caveat"><strong>"DPC" = Diamond Players Club</strong> — a direct stand-in for "TPC" (Tournament Players Club). GSPro's course library is built by dozens of independent, uncoordinated designers with no single naming standard, so there's no complete published list anywhere of every renamed venue — this covers the ones we could actually confirm. If you're hunting a specific tour venue and can't find it by its real name, searching "DPC" plus a similar-sounding word is a legitimate next move, not a guess.</div>

  <div class="table-wrap">
    <table>
      <caption>Renamed — search the GSPro name instead</caption>
      <thead><tr><th>Real course</th><th>GSPro name</th></tr></thead>
      <tbody>
        <tr><td class="real">TPC Sawgrass (The Players)</td><td class="gspro">DPC Sodgrass</td></tr>
        <tr><td class="real">Augusta National (The Masters)</td><td class="gspro">Georgia Golf Club</td></tr>
        <tr><td class="real">TPC Scottsdale — Stadium Course (WM Phoenix Open)</td><td class="gspro">The Golf Club of Phoenix / DPC Scottsdale</td></tr>
      </tbody>
    </table>
  </div>

  <div class="table-wrap">
    <table>
      <caption>Available under their real name</caption>
      <thead><tr><th>Real course</th><th>Notes</th></tr></thead>
      <tbody>
        <tr><td class="real">Pebble Beach</td><td>Also has a fantasy version, "DPC Pebble" — try the real name first</td></tr>
        <tr><td class="real">St Andrews (Old Course)</td><td>Has been pulled before over trademark disputes, and fantasy versions exist too ("Sovereignbyre Links") — search first</td></tr>
        <tr><td class="real">Winged Foot</td><td>Listed as "Wing Da'Foot" (East/West) — close enough to find by search</td></tr>
        <tr><td class="real">Bethpage Black</td><td></td></tr>
        <tr><td class="real">Pinehurst No. 2</td><td>Also has a fantasy version, "DPC Pinehurst 2"</td></tr>
        <tr><td class="real">Medinah (No. 1)</td><td></td></tr>
        <tr><td class="real">Torrey Pines (South)</td><td></td></tr>
        <tr><td class="real">Bay Hill</td><td></td></tr>
        <tr><td class="real">Colonial Country Club</td><td></td></tr>
        <tr><td class="real">Muirfield Village</td><td></td></tr>
        <tr><td class="real">East Lake Golf Club</td><td></td></tr>
        <tr><td class="real">Shinnecock Hills</td><td></td></tr>
        <tr><td class="real">Oakmont</td><td></td></tr>
        <tr><td class="real">Royal Liverpool / Carnoustie / Royal Birkdale</td><td></td></tr>
        <tr><td class="real">Whistling Straits</td><td></td></tr>
        <tr><td class="real">Quail Hollow Club</td><td></td></tr>
      </tbody>
    </table>
  </div>

  <p style="color: var(--text-muted); font-size: 0.92rem;">Some courses have more than one community-made version under different names — if the real name doesn't turn anything up, try the renamed version. This list isn't exhaustive; it covers the most-requested venues.</p>

  <footer>Tee365 · 4615 Grape Rd, Mishawaka IN</footer>
</div>`;

export default function GuideCoursesPage() {
  return (
    <>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Karla:wght@400;500;600;700&display=swap"
      />
      <style dangerouslySetInnerHTML={{ __html: COURSES_CSS }} />
      <div dangerouslySetInnerHTML={{ __html: COURSES_BODY }} />
    </>
  );
}
