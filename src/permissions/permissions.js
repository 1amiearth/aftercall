// The offscreen recorder cannot show a permission prompt, so the microphone is granted once here.
// Both pages share the extension origin, so the grant carries over (confirmed in ticket 01).

const t = (key) => chrome.i18n.getMessage(key) || key;
document.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
document.title = t('micPageTitle');

document.getElementById('allow').onclick = async () => {
  const out = document.getElementById('result');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    out.className = 'banner ok';
    out.textContent = t('micPageOk');
  } catch {
    out.className = 'banner err';
    out.textContent = t('micPageFailed');
  }
};
