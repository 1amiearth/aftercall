import { DEFAULT_PROVIDER } from './summary.js';

/** Settings in chrome.storage.local and their defaults. aiModel and aiEffort '' mean the CLI's own default; aiNotes is appended to the summary prompt; debug turns on the caption debug log (src/lib/debug.js). */
export const SETTINGS = { provider: DEFAULT_PROVIDER, aiModel: '', aiEffort: '', aiNotes: '', selfName: '', mic: true, chat: true, debug: false };
