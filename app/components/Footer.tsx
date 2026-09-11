import { Instagram, Facebook, Music2, MapPin } from "lucide-react";

// Socials live here rather than as a homepage section. Discovery runs
// socials -> site, not the other way around, so on-site links are for
// people checking us out mid-decision - they belong on every page, small,
// and out of the way of the booking CTA. They used to sit on the homepage
// under a "Follow For Launch Updates" heading, which both competed with
// Book Now and stopped making sense the day we opened.
const SOCIALS = [
  { href: "https://www.instagram.com/tee365.mishawaka", label: "Tee365 on Instagram", Icon: Instagram },
  { href: "https://www.facebook.com/people/Tee365/61578292102933/", label: "Tee365 on Facebook", Icon: Facebook },
  { href: "https://www.tiktok.com/@tee36568?_t=ZT-8ybYXacTg5X&_r=1", label: "Tee365 on TikTok", Icon: Music2 },
  { href: "https://share.google/d8bNieAsQUqaYomQZ", label: "Tee365 on Google Maps", Icon: MapPin },
];

export default function Footer() {
  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-neutral-400 md:flex-row md:items-center md:justify-between">
        <p>© {new Date().getFullYear()} Tee365</p>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <a className="hover:text-white" href="/join">
            Membership
          </a>
          <a className="hover:text-white" href="/gift-cards">
            Gift cards
          </a>
          <a className="hover:text-white" href="/about">
            About
          </a>
          <a className="hover:text-white" href="/events">
            Events
          </a>
          <a className="hover:text-white" href="/contact">
            Contact
          </a>
          <a className="hover:text-white" href="/faq">
            FAQ
          </a>
          <a className="hover:text-white" href="/privacy">
            Privacy
          </a>
          <a className="hover:text-white" href="/terms">
            Terms
          </a>
        </div>

        <div className="flex items-center gap-4">
          {SOCIALS.map(({ href, label, Icon }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="nofollow noreferrer noopener"
              aria-label={label}
              className="text-white/60 transition hover:text-white"
            >
              <Icon size={18} />
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}

