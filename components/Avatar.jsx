import { colorFor, initials } from '@/lib/client/api';

export default function Avatar({ name, size = 28, ring = false }) {
  const bg = colorFor(name);
  return (
    <span
      title={name}
      style={{ background: bg, width: size, height: size, fontSize: size * 0.4 }}
      className={`inline-grid place-items-center rounded-full font-semibold text-white shrink-0 ${
        ring ? 'ring-2 ring-white' : ''
      }`}
    >
      {initials(name)}
    </span>
  );
}
