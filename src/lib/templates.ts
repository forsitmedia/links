import type { Look, Template } from './types';

export const TEMPLATES: { id: Template; name: string; description: string; look: Look }[] = [
  { id: 'photo', name: 'Photo', description: 'Immersive & personal', look: { template: 'photo', mode: 'dark', background: 'photo', color: '#1c1c1e', accent: '', font: 'system' } },
  { id: 'classic', name: 'Classic', description: 'A logo. Your links.', look: { template: 'classic', mode: 'light', background: 'color', color: '#f2f2f7', accent: '', font: 'system' } },
  { id: 'studio', name: 'Studio', description: 'A little more editorial', look: { template: 'studio', mode: 'light', background: 'color', color: '#f3efe7', accent: '#433d36', font: 'serif' } },
  { id: 'cover', name: 'Cover', description: 'A banner & a familiar face', look: { template: 'cover', mode: 'light', background: 'color', color: '#eeeae4', accent: '#34332f', font: 'serif' } },
  { id: 'gallery', name: 'Gallery', description: 'Let your images do the talking', look: { template: 'gallery', mode: 'light', background: 'color', color: '#f6f0ec', accent: '#302c29', font: 'system' } },
  { id: 'bold', name: 'Bold', description: 'Big type. Fresh energy.', look: { template: 'bold', mode: 'dark', background: 'color', color: '#073d32', accent: '#bcec68', font: 'display' } },
  { id: 'minimal', name: 'Minimal', description: 'Space for what matters', look: { template: 'minimal', mode: 'light', background: 'color', color: '#ffffff', accent: '#202020', font: 'system' } },
];
