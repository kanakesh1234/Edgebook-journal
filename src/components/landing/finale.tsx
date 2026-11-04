import Link from "next/link";
import { Rise } from "./rise";
import { FINALE, FOOTER } from "./scene-config";

export function Finale() {
  return (
    <section id="begin" className="fin" aria-labelledby="fin-title">
      <Rise>
        <h2 id="fin-title">
          {FINALE.title} <em>{FINALE.accent}</em>
        </h2>
      </Rise>
      <Rise delay={140}>
        <div className="cx-cta cx-cta--center">
          <Link href={FINALE.primary.href} className="lp-pill lp-pill--lg">{FINALE.primary.label}</Link>
          <Link href={FINALE.secondary.href} className="lp-text-link lp-text-link--chev">{FINALE.secondary.label}</Link>
        </div>
      </Rise>
    </section>
  );
}

/** Deliberately quiet, in the manner of a single fine-print line. */
export function LandingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-footer-in">
        <p className="lp-fine">{FOOTER.disclaimer}</p>
        <div className="lp-foot-row">
          <span>&copy; {new Date().getFullYear()} Edgebook</span>
          <nav aria-label="Footer">
            <Link href="/privacy">Privacy</Link>
            <Link href="/login">Log in</Link>
            <a href={`mailto:${FOOTER.email}?subject=Edgebook`}>Contact</a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
