const OFFICIAL_LOGO_URL = "/storage/ppa-teorico-logo-official-cropped_9d1ad595.webp";
const OFFICIAL_DARK_LOGO_URL = "/storage/ppa-teorico-logo-dark-official_c9eda981.png";
const OFFICIAL_MARK_URL = "/storage/ppa-teorico-icon-192_3067ed54.png";

export function OfficialBrandLogo({ className = "", variant = "dark" }: { className?: string; variant?: "light" | "dark" }) {
  const src = variant === "dark" ? OFFICIAL_DARK_LOGO_URL : OFFICIAL_LOGO_URL;
  return <img src={src} alt="PPA Teórico — Tutor Adaptativo" className={`official-brand-logo official-brand-logo--${variant} ${className}`.trim()} loading="eager" />;
}

export function OfficialBrandMark({ className = "" }: { className?: string }) {
  return <img src={OFFICIAL_MARK_URL} alt="PPA Teórico" className={`official-brand-mark ${className}`.trim()} loading="eager" />;
}
