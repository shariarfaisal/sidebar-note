import { getMarkdown } from './editor.js';

export function exportAsMarkdown(title, content) {
  const filename = sanitizeFilename(title || 'untitled') + '.md';
  const blob = new Blob([content || ''], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 100);
}

export function exportCurrentNote(title) {
  const content = getMarkdown();
  exportAsMarkdown(title, content);
}

function sanitizeFilename(name) {
  return name
    .replace(/[^a-zA-Z0-9\s\-_]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 100) || 'untitled';
}
