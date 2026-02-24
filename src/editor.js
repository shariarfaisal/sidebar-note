import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import { Markdown } from 'tiptap-markdown';

let editor = null;
let onUpdateCallback = null;

export function createEditor(element, onChange) {
  onUpdateCallback = onChange;

  editor = new Editor({
    element,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: {
          HTMLAttributes: { class: 'code-block' },
        },
      }),
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
      Link.configure({
        openOnClick: true,
        autolink: true,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Underline,
      Placeholder.configure({
        placeholder: 'Start writing...',
      }),
      Typography,
      Markdown.configure({
        html: true,
        tightLists: true,
        bulletListMarker: '-',
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    editorProps: {
      attributes: {
        class: 'sidebar-note-editor',
        spellcheck: 'true',
      },
      handleDrop(view, event) {
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
          event.preventDefault();
          Array.from(files).forEach((file) => {
            if (file.type.startsWith('image/')) {
              insertImageFromFile(file, view);
            }
          });
          return true;
        }
        return false;
      },
      handlePaste(view, event) {
        const items = event.clipboardData?.items;
        if (items) {
          for (const item of items) {
            if (item.type.startsWith('image/')) {
              event.preventDefault();
              const file = item.getAsFile();
              if (file) insertImageFromFile(file, view);
              return true;
            }
          }
        }
        return false;
      },
    },
    onUpdate({ editor: ed }) {
      if (onUpdateCallback) onUpdateCallback(getMarkdown());
    },
  });

  return editor;
}

function insertImageFromFile(file, view) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const src = e.target.result;
    if (editor) {
      editor.chain().focus().setImage({ src }).run();
    }
  };
  reader.readAsDataURL(file);
}

export function getMarkdown() {
  if (!editor) return '';
  return editor.storage.markdown.getMarkdown();
}

export function setContent(markdown) {
  if (!editor) return;
  editor.commands.setContent(markdown || '');
}

export function getEditor() {
  return editor;
}

export function focusEditor() {
  if (editor) editor.commands.focus();
}

export function isActive(name, attrs) {
  if (!editor) return false;
  return editor.isActive(name, attrs);
}

export function toggleBold() { editor?.chain().focus().toggleBold().run(); }
export function toggleItalic() { editor?.chain().focus().toggleItalic().run(); }
export function toggleUnderline() { editor?.chain().focus().toggleUnderline().run(); }
export function toggleStrike() { editor?.chain().focus().toggleStrike().run(); }
export function toggleCode() { editor?.chain().focus().toggleCode().run(); }
export function toggleLink() {
  if (!editor) return;
  if (editor.isActive('link')) {
    editor.chain().focus().unsetLink().run();
    return;
  }
  const url = prompt('Enter URL:');
  if (url) {
    editor.chain().focus().setLink({ href: url }).run();
  }
}
