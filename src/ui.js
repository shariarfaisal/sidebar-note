import {
  getAllNotes,
  getActiveNoteId,
  setActiveNoteId,
  createNote,
  updateNote,
  deleteNote,
  duplicateNote,
  togglePin,
  sortNotes,
  searchNotes,
  extractPreview,
  formatDate,
} from './notes.js';
import {
  setContent,
  setContentWithImages,
  focusEditor,
  getMarkdown,
  getMarkdownForStorage,
  getEditor,
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleStrike,
  toggleTaskList,
  toggleCode,
  toggleLink,
} from './editor.js';
import { exportCurrentNote } from './export.js';
import { storage } from './storage.js';

const SCROLL_KEY = 'sidebar_scroll_positions';
let currentNoteId = null;
let isListOpen = false;
let scrollSaveTimer = null;

// Debounce auto-save
let saveTimer = null;
function debounceSave(content) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (currentNoteId) {
      await updateNote(currentNoteId, { content });
      saveScrollPosition();
    }
  }, 400);
}

// Scroll position persistence
async function getScrollPositions() {
  return (await storage.get(SCROLL_KEY)) || {};
}

async function saveScrollPosition() {
  if (!currentNoteId) return;
  const container = document.getElementById('editor-container');
  if (!container) return;
  const positions = await getScrollPositions();
  positions[currentNoteId] = container.scrollTop;
  await storage.set(SCROLL_KEY, positions);
}

async function restoreScrollPosition(noteId) {
  const positions = await getScrollPositions();
  const scrollTop = positions[noteId] || 0;
  const container = document.getElementById('editor-container');
  if (container) {
    // Delay to let editor render first
    requestAnimationFrame(() => {
      container.scrollTop = scrollTop;
    });
  }
}

function setupScrollPersistence() {
  const container = document.getElementById('editor-container');
  container.addEventListener('scroll', () => {
    clearTimeout(scrollSaveTimer);
    scrollSaveTimer = setTimeout(() => saveScrollPosition(), 300);
  });
}

// Title change handler
function setupTitleInput() {
  const titleInput = document.getElementById('note-title');
  let titleTimer = null;
  titleInput.addEventListener('input', () => {
    clearTimeout(titleTimer);
    titleTimer = setTimeout(async () => {
      if (currentNoteId) {
        await updateNote(currentNoteId, { title: titleInput.value });
      }
    }, 400);
  });
  titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      focusEditor();
    }
  });
}

// Note list rendering
async function renderNoteList(query = '') {
  const noteList = document.getElementById('note-list');
  const emptyState = document.getElementById('note-list-empty');
  let notes = await getAllNotes();

  if (query) {
    notes = searchNotes(notes, query);
  }
  notes = sortNotes(notes);

  if (notes.length === 0 && !query) {
    noteList.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  noteList.classList.remove('hidden');

  noteList.innerHTML = notes
    .map(
      (note) => `
    <div class="note-item ${note.id === currentNoteId ? 'active' : ''}" data-id="${note.id}">
      <div class="note-item-content">
        ${note.pinned ? '<span class="pin-indicator">📌</span>' : ''}
        <div class="note-item-title">${escapeHtml(note.title || 'Untitled')}</div>
        <div class="note-item-preview">${escapeHtml(extractPreview(note.content))}</div>
      </div>
      <div class="note-item-date">${formatDate(note.updatedAt)}</div>
    </div>
  `
    )
    .join('');

  // Attach click handlers
  noteList.querySelectorAll('.note-item').forEach((el) => {
    el.addEventListener('click', () => loadNote(el.dataset.id));
  });
}

// Load a note into the editor
async function loadNote(id) {
  const notes = await getAllNotes();
  const note = notes.find((n) => n.id === id);
  if (!note) return;

  currentNoteId = note.id;
  await setActiveNoteId(note.id);

  const titleInput = document.getElementById('note-title');
  titleInput.value = note.title || '';
  await setContentWithImages(note.content || '');
  updatePinButton(note.pinned);
  closeNoteList();
  focusEditor();
  await restoreScrollPosition(note.id);
}

// Open / close note list
function openNoteList() {
  const panel = document.getElementById('note-list-panel');
  panel.classList.remove('panel-hidden');
  isListOpen = true;
  renderNoteList();
}

function closeNoteList() {
  const panel = document.getElementById('note-list-panel');
  panel.classList.add('panel-hidden');
  isListOpen = false;
  const searchBar = document.getElementById('search-bar');
  const searchInput = document.getElementById('search-input');
  searchBar.classList.add('hidden');
  searchInput.value = '';
}

function toggleNoteList() {
  if (isListOpen) closeNoteList();
  else openNoteList();
}

// New note
async function handleNewNote() {
  const note = await createNote();
  currentNoteId = note.id;
  const titleInput = document.getElementById('note-title');
  titleInput.value = '';
  setContent('');
  updatePinButton(false);
  closeNoteList();
  titleInput.focus();
}

// Delete current note
async function handleDeleteNote() {
  if (!currentNoteId) return;
  const notes = await deleteNote(currentNoteId);
  closeDropdown();

  if (notes.length > 0) {
    const sorted = sortNotes(notes);
    await loadNote(sorted[0].id);
  } else {
    await handleNewNote();
  }
}

// Duplicate current note
async function handleDuplicate() {
  if (!currentNoteId) return;
  const note = await duplicateNote(currentNoteId);
  if (note) {
    currentNoteId = note.id;
    const titleInput = document.getElementById('note-title');
    titleInput.value = note.title || '';
    await setContentWithImages(note.content || '');
    updatePinButton(note.pinned);
  }
  closeDropdown();
}

// Pin/unpin
async function handleTogglePin() {
  if (!currentNoteId) return;
  const note = await togglePin(currentNoteId);
  if (note) updatePinButton(note.pinned);
  closeDropdown();
}

function updatePinButton(pinned) {
  const btn = document.getElementById('btn-pin');
  const span = btn.querySelector('span');
  span.textContent = pinned ? 'Unpin note' : 'Pin note';
}

// Export
function handleExport() {
  const title = document.getElementById('note-title').value;
  exportCurrentNote(title);
}

async function handleCopyMarkdown() {
  const content = getMarkdown();
  const btn = document.getElementById('btn-copy');
  const originalTitle = btn.title;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = content;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    btn.title = 'Copied';
  } catch (error) {
    console.error('Failed to copy markdown:', error);
    btn.title = 'Copy failed';
  } finally {
    closeDropdown();
    setTimeout(() => {
      btn.title = originalTitle;
    }, 1200);
  }
}

// Search
function setupSearch() {
  const btnSearch = document.getElementById('btn-search');
  const searchBar = document.getElementById('search-bar');
  const searchInput = document.getElementById('search-input');

  btnSearch.addEventListener('click', () => {
    searchBar.classList.toggle('hidden');
    if (!searchBar.classList.contains('hidden')) {
      searchInput.focus();
    }
  });

  let searchTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      renderNoteList(searchInput.value);
    }, 200);
  });
}

// Dropdown menu
function toggleDropdown() {
  const dropdown = document.getElementById('dropdown-more');
  dropdown.classList.toggle('hidden');
}

function closeDropdown() {
  document.getElementById('dropdown-more').classList.add('hidden');
}

// Floating format toolbar
function setupFormatToolbar() {
  const toolbar = document.getElementById('format-toolbar');

  toolbar.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const actions = {
        bold: toggleBold,
        italic: toggleItalic,
        underline: toggleUnderline,
        strike: toggleStrike,
        task: toggleTaskList,
        code: toggleCode,
        link: toggleLink,
      };
      const action = actions[btn.dataset.action];
      if (action) action();
    });
  });
}

function updateFormatToolbar() {
  const toolbar = document.getElementById('format-toolbar');
  const editor = getEditor();
  if (!editor) return;

  const { state } = editor;
  const { from, to } = state.selection;

  if (from === to) {
    toolbar.classList.add('hidden');
    return;
  }

  // Get viewport-relative coordinates for the selection
  const coords = editor.view.coordsAtPos(from);
  const editorContainer = document.getElementById('editor-container');
  const containerRect = editorContainer.getBoundingClientRect();

  // Only show if selection is within the visible editor area
  if (coords.top < containerRect.top || coords.top > containerRect.bottom) {
    toolbar.classList.add('hidden');
    return;
  }

  toolbar.classList.remove('hidden');
  const toolbarHeight = toolbar.offsetHeight || 36;
  const toolbarWidth = toolbar.offsetWidth || 280;
  const topbarHeight = document.getElementById('topbar').offsetHeight;

  // Position relative to #app (which is at viewport origin)
  let top = coords.top - toolbarHeight - 8;
  // Clamp: don't overlap the topbar
  if (top < topbarHeight + 4) {
    // Show below selection instead
    const coordsEnd = editor.view.coordsAtPos(to);
    top = coordsEnd.bottom + 8;
  }

  let left = coords.left;
  // Clamp horizontally
  left = Math.max(8, Math.min(left, window.innerWidth - toolbarWidth - 8));

  toolbar.style.top = `${top}px`;
  toolbar.style.left = `${left}px`;
}

// Escape HTML
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Initialize UI bindings
export function initUI(onContentChange) {
  // Menu
  document.getElementById('btn-menu').addEventListener('click', toggleNoteList);
  document.getElementById('btn-back').addEventListener('click', closeNoteList);

  // New note
  document.getElementById('btn-new-note').addEventListener('click', handleNewNote);
  document.getElementById('btn-new-note-empty')?.addEventListener('click', handleNewNote);

  // Actions
  document.getElementById('btn-export').addEventListener('click', handleExport);
  document.getElementById('btn-more').addEventListener('click', toggleDropdown);
  document.getElementById('btn-pin').addEventListener('click', handleTogglePin);
  document.getElementById('btn-duplicate').addEventListener('click', handleDuplicate);
  document.getElementById('btn-copy').addEventListener('click', handleCopyMarkdown);
  document.getElementById('btn-delete').addEventListener('click', handleDeleteNote);

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('dropdown-more');
    const btnMore = document.getElementById('btn-more');
    if (!dropdown.contains(e.target) && !btnMore.contains(e.target)) {
      closeDropdown();
    }
  });

  setupTitleInput();
  setupSearch();
  setupFormatToolbar();
  setupScrollPersistence();

  return { debounceSave, loadNote, handleNewNote, updateFormatToolbar };
}

// Load initial note or create first one
export async function loadInitialNote() {
  const notes = await getAllNotes();
  const activeId = await getActiveNoteId();

  if (notes.length === 0) {
    await handleNewNote();
    return;
  }

  const target = activeId && notes.find((n) => n.id === activeId) ? activeId : sortNotes(notes)[0].id;
  await loadNote(target);
}
