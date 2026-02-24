import { createEditor } from './editor.js';
import { initTheme, toggleTheme } from './theme.js';
import { initUI, loadInitialNote } from './ui.js';

async function init() {
  // Initialize theme
  await initTheme();

  // Initialize UI and get callbacks
  const { debounceSave, updateFormatToolbar } = initUI();

  // Create editor
  const editorEl = document.getElementById('editor');
  const editor = createEditor(editorEl, (content) => {
    debounceSave(content);
  });

  // Format toolbar on selection change
  editor.on('selectionUpdate', () => updateFormatToolbar());
  editor.on('blur', () => {
    setTimeout(() => {
      document.getElementById('format-toolbar').classList.add('hidden');
    }, 200);
  });

  // Theme toggle
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);

  // Load initial note
  await loadInitialNote();
}

document.addEventListener('DOMContentLoaded', init);
