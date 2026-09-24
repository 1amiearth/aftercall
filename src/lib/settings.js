import { DEFAULT_PROVIDER } from './summary.js';

/** Settings in chrome.storage.local and their defaults. aiModel and aiEffort '' mean the CLI's own default. */
export const SETTINGS = { provider: DEFAULT_PROVIDER, aiModel: '', aiEffort: '', selfName: '', mic: true, chat: true };
