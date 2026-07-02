'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import Section from '@/components/marketing/Section';
import MarketingNav from '@/components/marketing/MarketingNav';
import MarketingFooter from '@/components/marketing/MarketingFooter';
import {
  IconMic,
  IconStar,
  IconChat,
  IconShare,
  IconSearch,
  IconImport,
  IconVideo,
  IconCheck,
} from '@/components/Icons';

const DETAILED = [
  {
    icon: IconMic,
    title: 'Real-time transcription',
    desc: 'Live, word-by-word captions with automatic punctuation as the conversation happens — powered by Deepgram for speed and accuracy.',
    points: ['Live streaming captions', 'Automatic punctuation', 'Timestamped transcript'],
  },
  {
    icon: IconShare,
    title: 'Speaker recognition',
    desc: 'NOTEAI separates and labels each speaker so your transcript reads like a clean, attributed conversation.',
    points: ['Automatic speaker labels', 'Rename & merge speakers', 'Per-speaker highlights'],
  },
  {
    icon: IconStar,
    title: 'AI summaries & action items',
    desc: 'One click turns any meeting into a concise summary with decisions and clearly assigned next steps.',
    points: ['Concise recap', 'Action items extracted', 'Key decisions captured'],
  },
  {
    icon: IconChat,
    title: 'Ask your meetings',
    desc: 'Chat with your transcripts. Ask what was decided, who owns what, or generate a follow-up — grounded in the actual conversation.',
    points: ['Grounded answers', 'Follow-up drafting', 'Cross-meeting context'],
  },
  {
    icon: IconSearch,
    title: 'Highlights & search',
    desc: 'Star important moments and search across every meeting to instantly resurface what matters.',
    points: ['One-tap highlights', 'Full-text search', 'Jump to the moment'],
  },
  {
    icon: IconVideo,
    title: 'Capture any call',
    desc: 'Record from your device or bring in Google Meet and Microsoft Teams calls with the browser extension.',
    points: ['Google Meet & Teams', 'Browser extension', 'Device recording'],
  },
  {
    icon: IconImport,
    title: 'Import audio',
    desc: 'Upload existing recordings and get them transcribed, summarized, and fully searchable in minutes.',
    points: ['Upload recordings', 'Auto transcription', 'Searchable archive'],
  },
];

export default function FeaturesPage() {
  return (
    <div className="min-h-full bg-[#f6f8fb] dark:bg-[#0b1020]">
      <MarketingNav />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(55% 45% at 50% 0%, rgba(47,107,255,0.14), transparent 70%)',
          }}
        />
        <div className="mx-auto max-w-3xl px-5 py-16 text-center md:py-24">
          <motion.span
            className="chip border border-brand/20 bg-brand-soft text-brand dark:border-brand/30 dark:bg-brand/10"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            Features
          </motion.span>
          <motion.h1
            className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-ink md:text-5xl dark:text-white"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.05 }}
          >
            Everything you need to never miss a detail
          </motion.h1>
          <motion.p
            className="mx-auto mt-5 max-w-xl text-lg text-slate-600 dark:text-slate-300"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1 }}
          >
            NOTEAI listens, transcribes, summarizes, and remembers — so every conversation becomes
            searchable knowledge your team can act on.
          </motion.p>
          <motion.div
            className="mt-8 flex flex-wrap justify-center gap-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.15 }}
          >
            <Link href="/login?mode=signup" className="btn-primary px-5 py-3 text-base">
              Start for free
            </Link>
            <Link href="/pricing" className="btn-outline px-5 py-3 text-base">
              See pricing
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Feature detail grid */}
      <Section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="grid gap-5 md:grid-cols-2">
          {DETAILED.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.title}
                className="card p-6 md:p-7"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.45, delay: (i % 2) * 0.06 }}
              >
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-brand to-[#7b5bff] text-white">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-xl font-bold text-ink dark:text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{f.desc}</p>
                <ul className="mt-4 space-y-2">
                  {f.points.map((p) => (
                    <li key={p} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-soft text-brand dark:bg-brand/10">
                        <IconCheck className="h-3.5 w-3.5" />
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>
      </Section>

      {/* CTA */}
      <Section className="mx-auto max-w-6xl px-5 pb-24">
        <div className="rounded-3xl bg-gradient-to-br from-brand to-[#7b5bff] px-6 py-14 text-center text-white md:px-12">
          <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">Ready to try NOTEAI?</h2>
          <p className="mx-auto mt-3 max-w-lg text-white/85">
            Get started free — no credit card required.
          </p>
          <Link
            href="/login?mode=signup"
            className="btn mt-8 inline-flex bg-white px-6 py-3 text-base text-brand hover:bg-white/90"
          >
            Start for free
          </Link>
        </div>
      </Section>

      <MarketingFooter />
    </div>
  );
}
