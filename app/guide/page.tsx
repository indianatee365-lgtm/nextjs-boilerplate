import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "First Time at Tee365 | Quick Guide",
  description: "Everything you need to get playing at Tee365 - GSPro basics, Who's Up, Clubbie Corner, house rules, and troubleshooting.",
  robots: { index: false, follow: false },
};

const GUIDE_CSS = `
  :root {
    --bg: #0b0f0d;
    --surface: #131917;
    --surface-2: #182019;
    --border: rgba(255,255,255,0.10);
    --text: #f2f5f3;
    --text-muted: #9ba79e;
    --accent: #00a651;
    --accent-dark: #009447;
    --accent-soft: rgba(0,166,81,0.14);
    --flag: #e8a33d;
    --flag-soft: rgba(232,163,61,0.12);
    --flag-border: rgba(232,163,61,0.35);
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: var(--bg);
    color: var(--text);
  }
  body {
    font-family: "Karla", ui-sans-serif, system-ui, -apple-system, sans-serif;
    font-size: 16px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  h1, h2 {
    font-family: "Fraunces", Georgia, serif;
    text-wrap: balance;
    margin: 0;
  }
  .review-flag {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    background: var(--flag);
    color: #24170a;
    font-family: "Karla", sans-serif;
    font-weight: 700;
    font-size: 0.8rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 0.6rem 1rem;
  }
  .page {
    max-width: 680px;
    margin: 0 auto;
    padding: 2.5rem 1.5rem 5rem;
  }
  .hero {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-bottom: 2.75rem;
  }
  .eyebrow {
    font-family: "Karla", sans-serif;
    font-weight: 700;
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .hero h1 {
    font-size: clamp(2rem, 5vw, 2.6rem);
    font-weight: 600;
    color: var(--text);
  }
  .hero p {
    color: var(--text-muted);
    font-size: 1.05rem;
    max-width: 52ch;
  }
  .callout {
    display: flex;
    gap: 0.9rem;
    align-items: flex-start;
    background: var(--accent-soft);
    border: 1px solid rgba(0,166,81,0.35);
    border-radius: 10px;
    padding: 1.1rem 1.25rem;
    margin: 0 0 2.75rem;
  }
  .callout .glyph {
    font-family: "Fraunces", serif;
    font-size: 1.6rem;
    line-height: 1;
    color: var(--accent);
    flex-shrink: 0;
  }
  .callout p {
    margin: 0;
    color: var(--text);
    font-size: 0.98rem;
  }
  section {
    margin-bottom: 2.75rem;
  }
  section h2 {
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 0.9rem;
    padding-bottom: 0.7rem;
    border-bottom: 1px solid var(--border);
  }
  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
    counter-reset: step;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  .steps li {
    counter-increment: step;
    display: grid;
    grid-template-columns: 1.9rem 1fr;
    gap: 0.9rem;
    align-items: baseline;
  }
  .steps li::before {
    content: counter(step);
    font-family: "Fraunces", serif;
    font-weight: 500;
    font-size: 1.1rem;
    color: var(--accent);
  }
  .tip {
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 0 8px 8px 0;
    padding: 0.9rem 1.1rem;
    margin-top: 1rem;
    font-size: 0.95rem;
    color: var(--text-muted);
  }
  .tip strong { color: var(--text); }
  .needs-input {
    background: var(--flag-soft);
    border: 1.5px dashed var(--flag-border);
    border-radius: 10px;
    padding: 1rem 1.15rem;
    margin-top: 1rem;
  }
  .needs-input .tag {
    display: inline-block;
    font-family: "Karla", sans-serif;
    font-weight: 700;
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--flag);
    margin-bottom: 0.4rem;
  }
  .needs-input p {
    margin: 0;
    color: var(--text);
    font-size: 0.95rem;
  }
  .rules {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  .rules li {
    display: flex;
    gap: 0.7rem;
    align-items: flex-start;
    color: var(--text);
    font-size: 0.98rem;
  }
  .rules li::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    margin-top: 0.6em;
    flex-shrink: 0;
  }
  .rules li.strong {
    color: #ffb4a8;
  }
  .rules li.strong::before {
    background: #ff6b52;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1.1rem 1.25rem;
  }
  .restart-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    background: #fff;
    color: #111;
    font-family: "Karla", sans-serif;
    font-weight: 600;
    font-size: 0.85rem;
    padding: 0.4rem 0.8rem;
    border-radius: 4px;
    margin: 0.6rem 0;
  }
  .call-block {
    text-align: center;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.75rem 1.5rem;
  }
  .call-block p {
    color: var(--text-muted);
    margin: 0 0 0.6rem;
  }
  .call-block .number {
    font-family: "Fraunces", serif;
    font-size: 1.5rem;
    font-weight: 500;
    color: var(--accent);
  }
  footer {
    margin-top: 3rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 0.85rem;
    text-align: center;
  }
`;

const GUIDE_BODY = `<div class="page">

  <div class="hero">
    <span class="eyebrow">Tee365 · Quick Guide</span>
    <h1>First time here?</h1>
    <p>Everything you need to get playing.</p>
  </div>

  <div class="callout">
    <span class="glyph">◎</span>
    <p><strong>You navigate GSPro on the projector, not the monitor.</strong> Everything you click and pick is on the big screen in front of the mat. If you're not sure where to look, look at the biggest picture in the room.</p>
  </div>

  <section>
    <h2>Getting started</h2>
    <p style="color: var(--text-muted); margin: -0.4rem 0 1rem;">You'll land on <strong style="color: var(--text);">GSPro's main menu</strong> when your session starts. From there:</p>
    <img src="/guide/gspro-main-menu.jpg" alt="GSPro main menu with the PLAY card highlighted" style="width:100%;border-radius:10px;border:1px solid var(--border);margin:1rem 0;"><ol class="steps">
      <li><span><strong>Practice</strong> = warm up on the range.<br><strong>Play</strong> = play a real round.</span></li>
      <li><span>Already in a mode and want to switch? Tap the <strong>hamburger menu (☰)</strong> in the top-right of the projector screen, then <strong>End Round</strong> — that drops you back at the main menu.</span></li>
      <li><span>For a round: choose <strong>Play</strong>, then search for your course in the search box, or use the filters on the right. <strong>If you don't see the course you're looking for, set the filter to "All," not "Installed."</strong> This trips up almost everyone.</span></li>
      <li><span>Pick your course, hit <strong>Play</strong>, choose your tees and format, then <strong>Play Course</strong> to start.</span></li>
    </ol>
    <img src="/guide/course-selection.jpg" alt="GSPro course selection screen with the search box and Installed/All filter highlighted" style="width:100%;border-radius:10px;border:1px solid var(--border);margin:1rem 0;"><p style="color: var(--text-muted); margin: 1.4rem 0 0.5rem; font-size: 0.95em;"><strong style="color: var(--text);">Playing with friends?</strong> Tap the <strong style="color: var(--text);">+</strong> tile in an empty player slot (outlined green below) to add a <strong style="color: var(--text);">temporary player</strong> &mdash; just for this round, gone the moment you're done. Steer clear of <strong style="color: var(--text);">Create New Player</strong> (outlined red below) &mdash; that saves a permanent profile to GSPro's player list, visible to every future customer on this bay, forever.</p><img src="/guide/player-setup.jpg" alt="GSPro player setup screen with an empty player-plus tile outlined in green and the Create New Player button outlined in red" style="width:100%;border-radius:10px;border:1px solid var(--border);margin:0.6rem 0;">
    <div class="tip">
      <strong>No courses near South Bend?</strong>
      <p style="margin: 0.5rem 0 0; color: var(--text-muted);">Correct — there isn't a truly local one in GSPro's library. The closest is <strong style="color: var(--text);">Harbor Shores</strong> in Benton Harbor.</p>
    </div>
    <div class="tip"><strong>Looking for a famous course and can't find it by name?</strong> Some real courses are renamed in GSPro for licensing reasons — TPC Sawgrass shows up as something else entirely, for example. <a href="/guide/courses" style="color: var(--accent);">See the real name → GSPro name list →</a></div>
  <p style="color: var(--text-muted); margin: 1.4rem 0 0.5rem; font-size: 0.95em;"><strong style="color: var(--text);">Practice</strong> opens to three options. Tap <strong style="color: var(--text);">GSPro Practice Range</strong> (outlined below) for an open range to hit as many balls as you want. <strong style="color: var(--text);">Back</strong> (top-left, also outlined) takes you back to the main menu any time.</p><img src="/guide/practice-range.jpg" alt="GSPro Practice Range selection screen with the GSPro Practice Range card and the Back button outlined" style="width:100%;border-radius:10px;border:1px solid var(--border);margin:0.6rem 0;"><p style="color: var(--text-muted); margin: 1.4rem 0 0.5rem; font-size: 0.95em;"><strong style="color: var(--text);">In the range or mid-round and want out?</strong> Look for the small hamburger icon (outlined below) in the top-right corner of the projector screen, next to the course name.</p><img src="/guide/hamburger-menu.jpg" alt="In-game view with the hamburger menu icon outlined in the top-right of the projector screen" style="width:100%;border-radius:10px;border:1px solid var(--border);margin:0.6rem 0;"><p style="color: var(--text-muted); margin: 1.4rem 0 0.5rem; font-size: 0.95em;">Tapping it opens the Game Menu. <strong style="color: var(--text);">End Round</strong> (outlined below), at the bottom, drops you back at the main menu.</p><img src="/guide/end-round.jpg" alt="Game Menu panel with the End Round button outlined at the bottom" style="width:100%;border-radius:10px;border:1px solid var(--border);margin:0.6rem 0;"></section>

  <section>
    <h2>What's "Who's Up?"</h2>
    <p><strong style="color: var(--accent); font-size: 1.05em;">That's ours, not GSPro's</strong> — it tracks <strong>range sessions</strong> under your tee365.org account. Enter your account email at the start and every swing during your range session gets logged to your account automatically, so your stats are there next time you check. <strong>It has no effect on gameplay at all</strong> — skip it entirely and your session works exactly the same.</p>
  </section>

  <section>
    <h2>Need clubs?</h2>
    <p>Bring your own, or grab a set from <strong>Clubbie Corner</strong> — our loaner-club station, available to anyone who didn't bring their own.</p>
    <div class="tip">Missing or broken clubs? Let us know at <strong style="color: var(--text);">574-444-9365</strong> or <strong style="color: var(--text);">info@tee365.org</strong>. When you're done, please return clubs to Clubbie Corner so they're there for the next person.</div>
  </section>

  <section>
    <h2>House rules</h2>
    <div class="card">
      <ul class="rules">
        <li>Clean your clubs, balls, and shoes before you play. Dirty or damaged balls and clubs can damage our equipment — dirty shoes just make a mess of the place.</li>
        <li>Outside food and drinks welcome — no glass, and keep them away from the simulator and mat. Clean up after yourself.</li>
        <li>Be courteous of others — keep music reasonable, no loud cursing.</li>
        <li>Service animals only — no other pets.</li>
        <li>Minors are always welcome with a parent or guardian. Unaccompanied, you must be 18+, or 16+ if you're a member.</li>
      </ul>
    </div>
  </section>

  <section>
    <h2>Quick tips</h2>
    <div class="card">
      <ul class="rules">
        <li>Not on the green and want to putt? Tell GSPro first — select the putter from your club selector before you swing, or it won't read as a putt.</li>
        <li>Starting a round, you can choose which tees to play from on the Round Settings screen — pick based on your skill level or how much time you have.</li>
        <li>Want a quick, low-pressure round? Select the Par 3 tees and GSPro turns every hole into a short par-3 challenge — great for practice or a fast session.</li>
      </ul>
    </div>
  </section>

  <section>
    <h2>Something not working?</h2>
    <p>Almost everything gets fixed by one of three things:</p>
    <ol class="steps" style="margin-top: 0.9rem;">
      <li><span>The restart button below, for anything simulator-related.</span></li>
      <li><span>Something in this guide — most first-time mix-ups are covered above.</span></li>
      <li><span>Giving us a call — see the number at the bottom of this page.</span></li>
    </ol>
    <p style="margin-top: 1.1rem;">Simulator acting up? There's a small restart button in the top-right corner of the monitor:</p>
    <div class="restart-btn">Simulator issue? Click to restart</div>
    <p style="color: var(--text-muted); font-size: 0.92rem;">That resets the sim on its own — no need to call anyone first.</p>
  </section>

  <div class="call-block">
    <p>Still stuck, or something feels genuinely wrong?</p>
    <div class="number">574-444-9365</div>
    <p style="margin-top: 0.6rem; font-size: 0.85rem;">We're a 24/7 automated facility, but a real person always gets your message.</p>
    <p style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--text-muted); font-size: 0.9rem;">See something that's not quite perfect &mdash; even something small? Let us know at <strong style="color: var(--text);">info@tee365.org</strong>. We're building a world-class experience here, and reports like yours are exactly how we get there.</p>
  </div>

  <footer>Tee365 · 4615 Grape Rd, Mishawaka IN</footer>

</div>`;

export default function GuidePage() {
  return (
    <>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Karla:wght@400;500;600;700&display=swap"
      />
      <style dangerouslySetInnerHTML={{ __html: GUIDE_CSS }} />
      <div dangerouslySetInnerHTML={{ __html: GUIDE_BODY }} />
    </>
  );
}
