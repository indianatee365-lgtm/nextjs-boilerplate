"use client";
export default function HomePage() {
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 42, marginBottom: 8 }}>Tee365</h1>
      <p style={{ fontSize: 18, marginTop: 0 }}>
        24/7 indoor golf simulators. Location and launch date coming soon.
      </p>

      <div style={{ display: "flex", gap: 12, margin: "20px 0", flexWrap: "wrap" }}>
        <a
          href="#waitlist"
          style={{
            background: "#111",
            color: "#fff",
            padding: "10px 14px",
            borderRadius: 10,
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Join the Founding List
        </a>

        <a
          href="#giftcards"
          style={{
            border: "1px solid #ccc",
            color: "#111",
            padding: "10px 14px",
            borderRadius: 10,
            textDecoration: "none",
            fontWeight: 600,
            opacity: 0.6,
            pointerEvents: "none",
          }}
        >
          Gift cards (soon)
        </a>
      </div>

      <h2>Founding Members</h2>
      <ul>
        <li>Locked-in membership price for life</li>
        <li>Extra d
