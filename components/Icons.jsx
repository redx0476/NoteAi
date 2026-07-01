// Small inline stroke icons (no icon dependency). Each accepts standard svg props.
const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

export const IconHome = (p) => (<svg {...base} {...p}><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>);
export const IconChat = (p) => (<svg {...base} {...p}><path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2Z"/></svg>);
export const IconExplore = (p) => (<svg {...base} {...p}><circle cx="12" cy="12" r="9"/><path d="m15 9-4 1-1 4 4-1 1-4Z"/></svg>);
export const IconPuzzle = (p) => (<svg {...base} {...p}><path d="M14 4a2 2 0 1 1 4 0v2h2a1 1 0 0 1 1 1v3h-2a2 2 0 1 0 0 4h2v3a1 1 0 0 1-1 1h-3v-2a2 2 0 1 0-4 0v2H7a1 1 0 0 1-1-1v-3H4a2 2 0 1 1 0-4h2V7a1 1 0 0 1 1-1h3"/></svg>);
export const IconSettings = (p) => (<svg {...base} {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4.6 15H4.5a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 6 8.3l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 11 4.6V4.5a2 2 0 1 1 4 0v.1A1.6 1.6 0 0 0 17 6l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 .4 2.6h.1a2 2 0 1 1 0 4h-.9Z"/></svg>);
export const IconSearch = (p) => (<svg {...base} {...p}><circle cx="11" cy="11" r="7"/><path d="m21 21-4-4"/></svg>);
export const IconMic = (p) => (<svg {...base} {...p}><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>);
export const IconImport = (p) => (<svg {...base} {...p}><path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 21h14"/></svg>);
export const IconVideo = (p) => (<svg {...base} {...p}><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/></svg>);
export const IconStar = (p) => (<svg {...base} {...p}><path d="m12 3 2.6 5.5 6 .8-4.4 4.2 1.1 6L12 16.9 6.7 19.5l1.1-6L3.4 9.3l6-.8L12 3Z"/></svg>);
export const IconShare = (p) => (<svg {...base} {...p}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>);
export const IconCopy = (p) => (<svg {...base} {...p}><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>);
export const IconDownload = (p) => (<svg {...base} {...p}><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>);
export const IconTrash = (p) => (<svg {...base} {...p}><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/></svg>);
export const IconChevron = (p) => (<svg {...base} {...p}><path d="m6 9 6 6 6-6"/></svg>);
export const IconSend = (p) => (<svg {...base} {...p}><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7Z"/></svg>);
export const IconLogout = (p) => (<svg {...base} {...p}><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/></svg>);
export const IconCheck = (p) => (<svg {...base} {...p}><path d="M20 6 9 17l-5-5"/></svg>);
