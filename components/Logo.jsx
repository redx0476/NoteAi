// NOTEAI logo: a champagne-gold badge with an engraved mic + waveform, paired
// with a serif wordmark. Sizes scale with the `size` prop.
export function LogoMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="noteaiGrad" x1="4" y1="2" x2="36" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#eed49a" />
          <stop offset="0.5" stopColor="#d0a94f" />
          <stop offset="1" stopColor="#a97f28" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#noteaiGrad)" />
      {/* subtle top sheen */}
      <rect x="1" y="1" width="38" height="19" rx="10" fill="#ffffff" opacity="0.14" />
      {/* engraved mic + waveform in espresso ink */}
      <g fill="#2b2010" stroke="#2b2010">
        <rect x="16" y="9" width="8" height="15" rx="4" stroke="none" />
        <path d="M13 19a7 7 0 0 0 14 0" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        <path d="M20 26v4" strokeWidth="2.2" strokeLinecap="round" />
        <g strokeWidth="2" strokeLinecap="round" opacity="0.85">
          <path d="M9 30.5v-3" />
          <path d="M31 30.5v-3" />
        </g>
      </g>
    </svg>
  );
}

export default function Logo({ size = 30, showText = true }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <LogoMark size={size} />
      {showText && (
        <span className="font-display text-[20px] font-semibold tracking-luxe text-ink dark:text-[#f0ebe1]">
          Note<span className="text-brand dark:text-champagne italic">ai</span>
        </span>
      )}
    </div>
  );
}
