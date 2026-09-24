import { DEFAULT_PROVIDER } from './summary.js';

/** Settings in chrome.storage.local and their defaults. aiModel and aiEffort '' mean the CLI's own default; aiNotes is appended to the summary prompt. */
export const SETTINGS = { provider: DEFAULT_PROVIDER, aiModel: '', aiEffort: '', aiNotes: '', selfName: '', mic: true, chat: true };
