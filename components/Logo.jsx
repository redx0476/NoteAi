// NOTEAI logo: a rounded gradient badge with a mic + live waveform, paired with
// a wordmark. Sizes scale with the `size` prop.
export function LogoMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="noteaiGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2f6bff" />
          <stop offset="1" stopColor="#7b5bff" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#noteaiGrad)" />
      {/* mic */}
      <rect x="16" y="9" width="8" height="15" rx="4" fill="white" />
      <path d="M13 19a7 7 0 0 0 14 0" stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <path d="M20 26v4" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      {/* waveform */}
      <g stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.9">
        <path d="M9 30.5v-3" />
        <path d="M31 30.5v-3" />
      </g>
    </svg>
  );
}

export default function Logo({ size = 30, showText = true }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <LogoMark size={size} />
      {showText && (
        <span className="text-[19px] font-extrabold tracking-tight text-ink dark:text-white">
          NOTE<span className="text-brand">AI</span>
        </span>
      )}
    </div>
  );
}
