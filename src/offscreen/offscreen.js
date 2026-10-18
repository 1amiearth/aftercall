// Holds the MediaRecorder. The service worker can be stopped by Chrome at any time; this document cannot.
// Numbers below were measured in the ticket 01 prototype: 1080p15 at 1.5 Mbps ≈ 1.1 GB per hour.

let rec, ctx, streams = [], chunks = [];
let debugTab = null, debugLog = []; // caption debug log from the recorded tab's content script (src/lib/debug.js)

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (m.target !== 'offscreen') return;
  if (m.type === 'debug-log') { if (sender.tab?.id === debugTab) debugLog.push(...m.entries); return; }
  if (m.type === 'debug-dump') { reply(dumpDebug()); return; }
  if (m.type === 'start') { start(m).then(reply, (e) => reply({ ok: false, error: `${e.name}: ${e.message}` })); return true; }
  if (m.type === 'pause') rec?.state === 'recording' && rec.pause();
  if (m.type === 'resume') rec?.state === 'paused' && rec.resume();
  if (m.type === 'stop') { stop().then(reply); return true; }
});

async function start({ streamId, mic, tabId }) {
  debugTab = tabId;
  debugLog = [];
  const src = { chromeMediaSource: 'tab', chromeMediaSourceId: streamId };
  const tab = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: src },
    video: { mandatory: { ...src, maxWidth: 1920, maxHeight: 1080, maxFrameRate: 15 } },
  });
  streams = [tab];

  ctx = new AudioContext();
  const room = ctx.createMediaStreamSource(tab);
  const mix = ctx.createMediaStreamDestination();
  room.connect(ctx.destination); // capturing mutes the tab; play the room back to the user
  room.connect(mix);

  let micOk = false;
  if (mic) {
    try {
      const m = await navigator.mediaDevices.getUserMedia({ audio: true });
      streams.push(m);
      ctx.createMediaStreamSource(m).connect(mix); // never to ctx.destination, or the user hears themselves
      micOk = true;
    } catch {
      // permission not granted yet: record without the mic, the side panel shows why
    }
  }

  const out = new MediaStream([...tab.getVideoTracks(), ...mix.stream.getAudioTracks()]);
  chunks = [];
  rec = new MediaRecorder(out, { mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond: 1_500_000 });
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  tab.getVideoTracks()[0].onended = () => chrome.runtime.sendMessage({ target: 'sw', type: 'track-ended' });
  rec.start(1000);
  return { ok: true, micOk };
}

/** Blob URLs for debug/captions.jsonl (everything) and debug/emitted.jsonl (closed utterances), or null when nothing was logged. */
function dumpDebug() {
  if (!debugLog.length) return null;
  // Chrome renames the download to its MIME type's extension, so x-ndjson would save as .ndjson
  const jsonl = (entries) => URL.createObjectURL(new Blob(entries.map((e) => `${JSON.stringify(e)}\n`), { type: 'application/jsonl' }));
  const out = { captions: jsonl(debugLog), emitted: jsonl(debugLog.filter((e) => e.k === 'emit')) };
  debugLog = [];
  return out;
}

function stop() {
  return new Promise((resolve) => {
    if (!rec || rec.state === 'inactive') return resolve({ ok: false });
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      chunks = [];
      streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      ctx?.close();
      // The blob URL dies with this document: the service worker closes us only after the download completes.
      resolve({ ok: true, url: URL.createObjectURL(blob), bytes: blob.size });
    };
    rec.stop();
  });
}
