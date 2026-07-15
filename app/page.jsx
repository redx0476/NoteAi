'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { auth } from '@/lib/client/api';
import Avatar from '@/components/Avatar';
import Section from '@/components/marketing/Section';
import MarketingNav from '@/components/marketing/MarketingNav';
import MarketingFooter from '@/components/marketing/MarketingFooter';
import {
  IconMic,
  IconChat,
  IconSearch,
  IconStar,
  IconVideo,
  IconImport,
  IconCheck,
  IconShare,
  IconSend,
} from '@/components/Icons';

const FEATURES = [
  {
    icon: IconMic,
    title: 'Live transcription',
    desc: 'Word-by-word captions in real time with automatic punctuation, powered by Deepgram.',
  },
  {
    icon: IconStar,
    title: 'Instant AI summaries',
    desc: 'Every meeting turns into a clear summary with decisions, action items, and key takeaways.',
  },
  {
    icon: IconChat,
    title: 'Ask your meetings',
    desc: 'Chat with your transcripts — ask questions and get answers grounded in what was said.',
  },
  {
    icon: IconShare,
    title: 'Speaker recognition',
    desc: 'Automatic speaker labels so you always know who said what across the conversation.',
  },
  {
    icon: IconSearch,
    title: 'Highlights & search',
    desc: 'Star the moments that matter and search across every meeting to find them instantly.',
  },
  {
    icon: IconImport,
    title: 'Import any audio',
    desc: 'Upload existing recordings and get them transcribed, summarized, and searchable.',
  },
];

const STEPS = [
  {
    icon: IconVideo,
    title: 'Record or join',
    desc: 'Record from your device or capture Google Meet and Microsoft Teams calls with the browser extension.',
  },
  {
    icon: IconMic,
    title: 'Transcribe live',
    desc: 'Watch the conversation turn into text in real time, with speaker labels and timestamps.',
  },
  {
    icon: IconStar,
    title: 'Summarize & ask',
    desc: 'Get an instant summary with action items — then ask follow-up questions about anything discussed.',
  },
];

const STATS = [
  { value: '4+ hrs', label: 'saved every week' },
  { value: 'Real-time', label: 'live captions' },
  { value: '99%', label: 'searchable notes' },
  { value: '1-click', label: 'summaries' },
];

const TESTIMONIALS = [
  {
    quote: 'NOTEAI captures every detail so I can stay present in the conversation instead of scribbling notes.',
    name: 'Laura Brown',
    role: 'VP of Sales',
  },
  {
    quote: 'The instant summaries and action items save my team hours after every single meeting.',
    name: 'Tim Draper',
    role: 'Product Lead',
  },
  {
    quote: 'Being able to ask questions about past meetings is a superpower. I use it almost every day.',
    name: 'Brandon Savage',
    role: 'Head of Enablement',
  },
];

const INTEGRATIONS = ['Google Meet', 'Microsoft Teams', 'Zoom', 'Audio import', 'Chrome extension'];

// A decorative fake transcript card used in the hero.
function TranscriptMockup() {
  const reduce = useReducedMotion();
  const lines = [
    { name: 'Sarah Chen', text: 'Let’s lock the launch date for the new release.' },
    { name: 'Marcus Lee', text: 'I can have the marketing assets ready by Thursday.' },
    { name: 'Sarah Chen', text: 'Perfect — I’ll add that as an action item.' },
  ];
  return (
    <div className="card w-full max-w-md p-5 shadow-pop">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500">
            {!reduce && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            )}
          </span>
          <span className="text-sm font-semibold text-ink dark:text-white">Recording · 12:04</span>
        </div>
        <div className="flex items-end gap-0.5" aria-hidden>
          {[6, 12, 8, 16, 10, 14, 7].map((h, i) => (
            <motion.span
              key={i}
              className="w-1 rounded-full bg-brand"
              style={{ height: h }}
              animate={reduce ? {} : { scaleY: [1, 1.8, 0.7, 1.4, 1] }}
              transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.12, ease: 'easeInOut' }}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {lines.map((l, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <Avatar name={l.name} size={28} />
            <div>
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">{l.name}</div>
              <div className="mt-0.5 rounded-2xl rounded-tl-sm px-3 py-2 text-sm" style={{ background: 'var(--surface-2)', color: 'var(--text)' }}>
                {l.text}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-brand/20 bg-brand-soft p-3 dark:border-brand/30 dark:bg-brand/10">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-brand">
          <IconStar className="h-3.5 w-3.5" /> AI summary
        </div>
        <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
          Team agreed on launch date. <span className="font-medium">Action:</span> Marcus to deliver marketing
          assets by Thursday.
        </p>
      </div>
    </div>
  );
}

// Marketing landing page shown to logged-out visitors. Logged-in users are
// sent straight to the app.
export default function HomePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (auth.token()) {
      router.replace('/app');
    } else {
      setReady(true);
    }
  }, [router]);

  if (!ready) {
    return <div className="grid h-full place-items-center text-sm text-slate-400">Loading…</div>;
  }

  return (
    <div className="min-h-full" style={{ background: 'var(--bg)' }}>
      <MarketingNav />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(60% 50% at 50% 0%, rgba(201,162,75,0.16), transparent 70%), radial-gradient(40% 40% at 85% 10%, rgba(176,132,42,0.12), transparent 70%)',
          }}
        />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 md:py-24 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="chip border border-brand/25 bg-brand-soft text-[var(--accent-2)] dark:bg-brand/10 dark:text-champagne">
              <IconMic className="h-3.5 w-3.5" /> AI notetaker for every meeting
            </span>
            <h1 className="mt-5 font-display text-4xl font-medium leading-[1.08] tracking-luxe sm:text-5xl md:text-[3.7rem]" style={{ color: 'var(--text)' }}>
              Never take meeting
              <br />
              notes <span className="italic text-brand dark:text-champagne">again</span>.
            </h1>
            <p className="mt-5 max-w-lg text-lg" style={{ color: 'var(--muted)' }}>
              NOTEAI transcribes your conversations in real time, writes the summary, captures action items,
              and lets you ask questions about anything that was said.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/login?mode=signup" className="btn-primary px-5 py-3 text-base">
                Start for free
              </Link>
              <Link href="/login" className="btn-outline px-5 py-3 text-base">
                Log in
              </Link>
            </div>
            <p className="mt-4 text-sm" style={{ color: 'var(--muted)' }}>No credit card required · Free forever plan</p>
          </motion.div>

          <motion.div
            className="flex justify-center lg:justify-end"
            initial={{ opacity: 0, y: 32, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          >
            <TranscriptMockup />
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <Section className="mx-auto max-w-6xl px-5 pb-8">
        <div className="card grid grid-cols-2 gap-6 p-6 md:grid-cols-4 md:p-8">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="font-display text-3xl font-medium text-brand dark:text-champagne md:text-4xl">{s.value}</div>
              <div className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Features */}
      <Section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-medium tracking-luxe md:text-4xl" style={{ color: 'var(--text)' }}>
            Everything you need from a meeting assistant
          </h2>
          <p className="mt-4 text-lg" style={{ color: 'var(--muted)' }}>
            From live captions to searchable knowledge — NOTEAI handles the busywork so you can focus on
            the conversation.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.title}
                className="card p-6 transition hover:shadow-pop"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.45, delay: i * 0.05 }}
              >
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-brand dark:bg-brand/10">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold" style={{ color: 'var(--text)' }}>{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>{f.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </Section>

      {/* How it works */}
      <section
        id="how"
        className="border-y border-[var(--line)] py-16 md:py-24"
        style={{ background: 'var(--surface)' }}
      >
        <div className="mx-auto max-w-6xl px-5">
          <Section className="mx-auto max-w-2xl text-center">
            <span className="chip bg-brand-soft text-[var(--accent-2)] dark:bg-brand/10 dark:text-champagne">How it works</span>
            <h2 className="mt-4 font-display text-3xl font-medium tracking-luxe md:text-4xl" style={{ color: 'var(--text)' }}>
              From conversation to knowledge in three steps
            </h2>
          </Section>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <Section key={s.title} className="card relative p-6" delay={i * 0.08}>
                  <div className="absolute right-5 top-4 font-display text-5xl font-medium" style={{ color: 'var(--line)' }}>
                    {i + 1}
                  </div>
                  <div className="grid h-12 w-12 place-items-center rounded-xl text-[#1a1207]" style={{ background: 'linear-gradient(140deg, #eed49a, #c9a24b 55%, #a97f28)' }}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold" style={{ color: 'var(--text)' }}>{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>{s.desc}</p>
                </Section>
              );
            })}
          </div>
        </div>
      </section>

      {/* Integrations */}
      <Section id="integrations" className="mx-auto max-w-6xl px-5 py-16 md:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-2xl font-medium tracking-luxe md:text-3xl" style={{ color: 'var(--text)' }}>
            Works where your meetings happen
          </h2>
          <p className="mt-3" style={{ color: 'var(--muted)' }}>
            Capture calls straight from your browser or upload existing recordings.
          </p>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {INTEGRATIONS.map((name) => (
            <span
              key={name}
              className="chip border border-[var(--line)] px-4 py-2 text-sm"
              style={{ background: 'var(--surface)', color: 'var(--text)' }}
            >
              <IconCheck className="h-4 w-4 text-brand" /> {name}
            </span>
          ))}
        </div>
      </Section>

      {/* Testimonials */}
      <section className="border-t border-[var(--line)] py-16 md:py-24" style={{ background: 'var(--surface)' }}>
        <div className="mx-auto max-w-6xl px-5">
          <Section className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-medium tracking-luxe md:text-4xl" style={{ color: 'var(--text)' }}>
              Loved by teams and people
            </h2>
          </Section>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <Section key={t.name} className="card p-6" delay={i * 0.08}>
                <div className="flex gap-0.5 text-brand dark:text-champagne">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <IconStar key={s} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <p className="mt-4 font-display text-[15px] italic leading-relaxed" style={{ color: 'var(--text)' }}>“{t.quote}”</p>
                <div className="mt-5 flex items-center gap-3">
                  <Avatar name={t.name} size={36} />
                  <div>
                    <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{t.name}</div>
                    <div className="text-xs" style={{ color: 'var(--muted)' }}>{t.role}</div>
                  </div>
                </div>
              </Section>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <Section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <div
          className="relative overflow-hidden rounded-3xl px-6 py-14 text-center text-[#f0ebe1] md:px-12 md:py-20"
          style={{ background: 'radial-gradient(120% 120% at 85% 0%, #241c11 0%, #14110c 45%, #0b0a08 100%)' }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(45% 70% at 82% 0%, rgba(230,200,120,0.28), transparent 70%)' }}
          />
          <div className="relative mx-auto mb-5 h-px w-16" style={{ background: '#e6c878', opacity: 0.6 }} />
          <h2 className="relative font-display text-3xl font-medium tracking-luxe md:text-4xl">
            Turn every meeting into searchable knowledge
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-[#c9c0af]">
            Join teams who never miss a detail. Start transcribing, summarizing, and asking your meetings today.
          </p>
          <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/login?mode=signup" className="btn-primary px-6 py-3 text-base">
              Start for free
            </Link>
            <Link
              href="/login"
              className="btn inline-flex border border-[#e6c878]/40 px-6 py-3 text-base text-champagne hover:bg-[#e6c878]/10"
            >
              <IconSend className="h-4 w-4" /> Log in
            </Link>
          </div>
        </div>
      </Section>

      <MarketingFooter />
    </div>
  );
}
