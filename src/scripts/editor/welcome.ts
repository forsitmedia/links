/** First-run sheet: photo, name and username. Everything else has good defaults. */
import { state, changed } from './state';
import { pickImage } from './upload';
import { adjustImage } from './image-editor';
import { imageFrameStyle } from '../../lib/image-frame';
import { h, group, inputRow, sheet, svg, toast } from './ui';

export function welcome() {
  const p = state.cfg.profile;
  const photo = h('div', { class: 'welcome-photo' });
  const drawPhoto = () => photo.replaceChildren(p.photo ? h('img', { src: p.photo, alt: '', style: imageFrameStyle(p.photoFrame) }) : svg('photo', 30));
  drawPhoto();

  sheet('Welcome', () => [
    h('div', { class: 'welcome' },
      h('h1', {}, 'Make it yours'),
      h('p', {}, 'Add a photo and your name. You can change everything later.'),
      h('button', { class: 'welcome-pick', type: 'button', onclick: async () => {
        try { const url = await pickImage(1400); if (url) {
          p.photo = url; p.photoFrame = undefined; drawPhoto(); changed();
          adjustImage({ src: url, frame: p.photoFrame, title: 'Adjust Photo or Logo', aspect: 1, round: true,
            onChange: (frame) => { p.photoFrame = frame; drawPhoto(); changed(); }, onFinish: () => changed(true) });
        } } catch (e: any) { toast(e.message); }
      } }, photo, h('span', { class: 'btn-text' }, 'Choose Photo'))),
    group({},
      inputRow('Name', p.name, (v) => { p.name = v; changed(); }, { max: 40 }),
      inputRow('Username', p.handle, (v) => { p.handle = v.replace(/^@/, ''); changed(); }, { max: 30, prefix: '@' })),
  ], {
    done: 'Start',
    onClose: () => {
      state.cfg.onboarded = true;
      changed(true);
    },
  });
}
