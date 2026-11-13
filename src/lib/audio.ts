/** Shared by voice recordings and synthesized music; called from the visitor's tap. */
export const AUDIO_SCRIPT = `<script>
(() => {
  window.yourlinkiAudioSession = () => {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
  };
  window.yourlinkiAudioNotice = (message) => {
    document.querySelectorAll('.audio-notice').forEach((el) => el.remove());
    const notice = document.createElement('div'); notice.className = 'toast audio-notice'; notice.setAttribute('role', 'status');
    notice.textContent = message || 'Sound could not start. Check your media volume, or open this page in your browser.';
    document.body.append(notice); setTimeout(() => notice.remove(), 6500);
  };
})();
</script>`;
