'use client';

export default function HomePage() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24, fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 42, marginBottom: 8 }}>Tee365</h1>
      <p style={{ fontSize: 18, marginTop: 0 }}>
        24/7 indoor golf simulators. Location and launch date coming soon.
      </p>

      <div style={{ display: 'flex', gap: 12, margin: '20px 0', flexWrap: 'wrap' }}>
        <a
          href="#waitlist"
          style={{
            background: '#111',
            color: '#fff',
            padding: '10px 14px',
            borderRadius: 10,
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Join the Founding List
        </a>

        <a
          href="#giftcards"
          style={{
            border: '1px solid #ccc',
            color: '#111',
            padding: '10px 14px',
            borderRadius: 10,
            textDecoration: 'none',
            fontWeight: 600,
            opacity: 0.6,
            pointerEvents: 'none',
          }}
        >
          Gift cards (soon)
        </a>
      </div>

      <h2>Founding Members</h2>
      <ul>
        <li>Locked-in membership price for life</li>
        <li>Extra discount for the first 12 months</li>
        <li>Early booking access</li>
        <li>Invite-only soft opening</li>
        <li>Name on the founder wall</li>
      </ul>

      <h2 id="giftcards">Gift cards</h2>
      <p>
        Gift cards will be sold through Birrdi Golf. Join the list and we’ll notify you when they go live.
      </p>

      <h2>FAQ</h2>
      <p>
        <b>Where is this?</b>
        <br />
        Mishawaka area. Address coming soon.
      </p>
      <p>
        <b>When do you open?</b>
        <br />
        Targeting 2026. Opening window announced after lease signing.
      </p>
      <p>
        <b>How does 24/7 work?</b>
        <br />
        Online booking and entry instructions. Details soon.
      </p>

      <h2 id="waitlist">Join the waitlist</h2>
      <p>Two updates only: gift cards live, booking live.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          alert('Form not connected yet. Add email provider later.');
        }}
        style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}
      >
        <input
          type="email"
          required
          placeholder="Email address"
          style={{ padding: 10, borderRadius: 10, border: '1px solid #ccc', minWidth: 260 }}
        />
        <button
          type="submit"
          style={{
            background: '#111',
            color: '#fff',
            padding: '10px 14px',
            borderRadius: 10,
            border: 'none',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Join
        </button>
      </form>

      <p style={{ color: '#666', marginTop: 14 }}>No spam. Unsubscribe anytime.</p>
    </div>
  );
}
