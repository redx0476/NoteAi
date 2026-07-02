'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import Section from '@/components/marketing/Section';
import MarketingNav from '@/components/marketing/MarketingNav';
import MarketingFooter from '@/components/marketing/MarketingFooter';
import { IconCheck } from '@/components/Icons';

const PLANS = [
  {
    name: 'Free',
    price: { monthly: 0, yearly: 0 },
    tagline: 'For individuals getting started with AI notes.',
    cta: 'Start for free',
    highlight: false,
    features: [
      'Live transcription',
      'AI summaries & action items',
      'Speaker recognition',
      'Up to 5 meetings / month',
      '30-minute meeting limit',
    ],
  },
  {
    name: 'Pro',
    price: { monthly: 12, yearly: 10 },
    tagline: 'For professionals who meet all day.',
    cta: 'Start free trial',
    highlight: true,
    features: [
      'Everything in Free',
      'Unlimited meetings',
      'Ask your meetings (chat)',
      'Highlights & full-text search',
      'Import unlimited audio',
      'Google Meet & Teams capture',
    ],
  },
  {
    name: 'Team',
    price: { monthly: 20, yearly: 17 },
    tagline: 'For teams that share meeting knowledge.',
    cta: 'Start free trial',
    highlight: false,
    features: [
      'Everything in Pro',
      'Shared team workspace',
      'Collaborative notes & highlights',
      'Admin controls',
      'Priority support',
    ],
  },
];

const FAQ = [
  {
    q: 'Is there really a free plan?',
    a: 'Yes. The Free plan lets you transcribe and summarize meetings with no credit card required.',
  },
  {
    q: 'Can I capture Google Meet and Teams calls?',
    a: 'Yes — the browser extension captures Google Meet and Microsoft Teams calls on Pro and Team plans.',
  },
  {
    q: 'Can I import existing recordings?',
    a: 'Absolutely. Upload audio files and NOTEAI will transcribe, summarize, and make them searchable.',
  },
  {
    q: 'Can I change plans later?',
    a: 'You can upgrade, downgrade, or cancel at any time. Changes take effect on your next billing cycle.',
  },
];

export default function PricingPage() {
  const [yearly, setYearly] = useState(false);

  return (
    <div className="min-h-full bg-[#f6f8fb] dark:bg-[#0b1020]">
      <MarketingNav />

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-5 py-16 text-center md:py-20">
        <motion.h1
          className="text-4xl font-extrabold leading-tight tracking-tight text-ink md:text-5xl dark:text-white"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
        >
          Simple pricing for every team
        </motion.h1>
        <motion.p
          className="mx-auto mt-4 max-w-xl text-lg text-slate-600 dark:text-slate-300"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.05 }}
        >
          Start free and upgrade when you’re ready. No credit card required to begin.
        </motion.p>

        {/* Billing toggle */}
        <div className="mt-8 inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {[
            { key: false, label: 'Monthly' },
            { key: true, label: 'Yearly' },
          ].map((opt) => (
            <button
              key={opt.label}
              onClick={() => setYearly(opt.key)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                yearly === opt.key
                  ? 'bg-white text-ink shadow-sm dark:bg-slate-900 dark:text-white'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {opt.label}
              {opt.key && <span className="ml-1.5 text-xs text-brand">Save 15%</span>}
            </button>
          ))}
        </div>
      </section>

      {/* Plans */}
      <Section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="grid items-start gap-6 md:grid-cols-3">
          {PLANS.map((plan, i) => {
            const price = yearly ? plan.price.yearly : plan.price.monthly;
            return (
              <motion.div
                key={plan.name}
                className={`card relative flex flex-col p-7 ${
                  plan.highlight ? 'ring-2 ring-brand shadow-pop md:-mt-3 md:mb-3' : ''
                }`}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.45, delay: i * 0.06 }}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">
                    Most popular
                  </span>
                )}
                <h3 className="text-lg font-bold text-ink dark:text-white">{plan.name}</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{plan.tagline}</p>
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-ink dark:text-white">${price}</span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {price === 0 ? 'forever' : '/ user / mo'}
                  </span>
                </div>

                <Link
                  href="/login?mode=signup"
                  className={`mt-6 w-full ${plan.highlight ? 'btn-primary' : 'btn-outline'} py-2.5`}
                >
                  {plan.cta}
                </Link>

                <ul className="mt-6 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-200">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-soft text-brand dark:bg-brand/10">
                        <IconCheck className="h-3.5 w-3.5" />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>
      </Section>

      {/* FAQ */}
      <Section className="mx-auto max-w-3xl px-5 pb-24">
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-ink dark:text-white">
          Frequently asked questions
        </h2>
        <div className="mt-10 space-y-3">
          {FAQ.map((item) => (
            <div key={item.q} className="card p-6">
              <h3 className="text-base font-semibold text-ink dark:text-white">{item.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{item.a}</p>
            </div>
          ))}
        </div>
      </Section>

      <MarketingFooter />
    </div>
  );
}
