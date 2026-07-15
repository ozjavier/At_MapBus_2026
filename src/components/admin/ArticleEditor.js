import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";

const BUTTONS = [
  { cmd: "toggleBold", label: "B", title: "Negrita", active: "bold" },
  { cmd: "toggleItalic", label: "I", title: "Cursiva", active: "italic" },
  {
    cmd: "toggleHeading2",
    label: "H2",
    title: "Subtitulo",
    active: "heading2",
  },
  {
    cmd: "toggleBulletList",
    label: "• Lista",
    title: "Lista",
    active: "bulletList",
  },
  {
    cmd: "toggleOrderedList",
    label: "1. Lista",
    title: "Lista numerada",
    active: "orderedList",
  },
  {
    cmd: "toggleBlockquote",
    label: '" Cita',
    title: "Cita",
    active: "blockquote",
  },
];

export default class ArticleEditor {
  constructor(
    container,
    {
      initialContentHtml = "",
      placeholder = "Escribe el articulo...",
      onImageUpload,
    } = {},
  ) {
    this.container = container;
    this.onImageUpload = onImageUpload;

    this.toolbarEl = document.createElement("div");
    this.toolbarEl.className =
      "flex flex-wrap gap-1 border border-b-0 border-ar-cerulean-disabled rounded-t-md bg-gray-50 p-2";
    this.contentEl = document.createElement("div");
    this.contentEl.className =
      "article-editor-content border border-ar-cerulean-disabled rounded-b-md p-4 min-h-[400px] focus:outline-none";

    container.appendChild(this.toolbarEl);
    container.appendChild(this.contentEl);

    this.editor = new Editor({
      element: this.contentEl,
      extensions: [
        StarterKit,
        Link.configure({ openOnClick: false }),
        Image,
        Placeholder.configure({ placeholder }),
      ],
      content: initialContentHtml,
      onTransaction: () => this.renderToolbarState(),
    });

    this.renderToolbar();
    this.renderToolbarState();
  }

  renderToolbar() {
    this.toolbarEl.innerHTML = "";

    BUTTONS.forEach(({ cmd, label, title }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.title = title;
      btn.dataset.cmd = cmd;
      btn.className = "px-2 py-1 text-sm rounded hover:bg-ar-cerulean-disabled";
      btn.addEventListener("click", () => {
        this.editor.chain().focus()[cmd]().run();
      });
      this.toolbarEl.appendChild(btn);
    });

    const linkBtn = this.makeButton("🔗 Link", () => {
      const url = window.prompt("URL del enlace:");
      if (url) this.editor.chain().focus().setLink({ href: url }).run();
    });
    this.toolbarEl.appendChild(linkBtn);

    const imgBtn = this.makeButton("🖼 Imagen", async () => {
      if (!this.onImageUpload) return;
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        const url = await this.onImageUpload(file);
        if (url) this.editor.chain().focus().setImage({ src: url }).run();
      };
      input.click();
    });
    this.toolbarEl.appendChild(imgBtn);

    const undoBtn = this.makeButton("↺", () =>
      this.editor.chain().focus().undo().run(),
    );
    const redoBtn = this.makeButton("↻", () =>
      this.editor.chain().focus().redo().run(),
    );
    this.toolbarEl.appendChild(undoBtn);
    this.toolbarEl.appendChild(redoBtn);
  }

  makeButton(label, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.className = "px-2 py-1 text-sm rounded hover:bg-ar-cerulean-disabled";
    btn.addEventListener("click", onClick);
    return btn;
  }

  renderToolbarState() {
    // Resalta el boton activo (negrita/italica/etc en el cursor actual)
    [...this.toolbarEl.querySelectorAll("button[data-cmd]")].forEach((btn) => {
      const map = {
        toggleBold: "bold",
        toggleItalic: "italic",
        toggleBulletList: "bulletList",
        toggleOrderedList: "orderedList",
        toggleBlockquote: "blockquote",
      };
      const mark = map[btn.dataset.cmd];
      const isActive = mark ? this.editor.isActive(mark) : false;
      btn.classList.toggle("bg-ar-cerulean-disabled", isActive);
      btn.classList.toggle("text-ar-cerulean", isActive);
    });
  }

  getHTML() {
    return this.editor.getHTML();
  }

  isEmpty() {
    return this.editor.isEmpty;
  }

  destroy() {
    this.editor.destroy();
  }
}
