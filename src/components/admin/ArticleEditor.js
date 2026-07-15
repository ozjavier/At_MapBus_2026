import EditorJS from "@editorjs/editorjs";
import Header from "@editorjs/header";
import ListTool from "@editorjs/list";
import Quote from "@editorjs/quote";
import Delimiter from "@editorjs/delimiter";
import ImageTool from "@editorjs/image";

// Convierte un bloque de Editor.js a HTML. Nuestro propio conversor, sin
// depender de una libreria externa que se puede romper con cada cambio de
// version de los tools (ya paso con @editorjs/list).
function blockToHtml(block) {
  const { type, data } = block;

  switch (type) {
    case "header": {
      const level = data.level || 2;
      return `<h${level}>${data.text ?? ""}</h${level}>`;
    }

    case "paragraph":
      return `<p>${data.text ?? ""}</p>`;

    case "list": {
      const tag = data.style === "ordered" ? "ol" : "ul";
      const items = (data.items || [])
        .map(
          (item) =>
            `<li>${typeof item === "string" ? item : (item.content ?? "")}</li>`,
        )
        .join("");
      return `<${tag}>${items}</${tag}>`;
    }

    case "quote": {
      const caption = data.caption ? `${data.caption}` : "";
      return `<blockquote><p>${data.text ?? ""}</p>${caption}</blockquote>`;
    }

    case "delimiter":
      return "<hr />";

    case "image": {
      const url = data.file?.url ?? "";
      const caption = data.caption
        ? `<figcaption>${data.caption}</figcaption>`
        : "";
      return `<figure><img src="${url}" alt="${data.caption ?? ""}" />${caption}</figure>`;
    }

    default:
      return "";
  }
}

export default class ArticleEditor {
  constructor(
    container,
    {
      initialData = null,
      placeholder = "Escribe el contenido...",
      onImageUpload,
    } = {},
  ) {
    this.editor = new EditorJS({
      holder: container,
      placeholder,
      data:
        initialData && initialData.blocks?.length
          ? initialData
          : { blocks: [] },
      tools: {
        header: {
          class: Header,
          inlineToolbar: true,
          config: {
            levels: [2, 3, 4],
            defaultLevel: 2,
            placeholder: "Subtitulo",
          },
        },
        list: { class: ListTool, inlineToolbar: true },
        quote: {
          class: Quote,
          inlineToolbar: true,
          config: {
            quotePlaceholder: "Cita",
            captionPlaceholder: "Autor (opcional)",
          },
        },
        delimiter: Delimiter,
        image: {
          class: ImageTool,
          config: {
            uploader: {
              async uploadByFile(file) {
                if (!onImageUpload) return { success: 0 };
                const url = await onImageUpload(file);
                return url ? { success: 1, file: { url } } : { success: 0 };
              },
              async uploadByUrl(url) {
                return { success: 1, file: { url } };
              },
            },
          },
        },
      },
    });
  }

  async ready() {
    await this.editor.isReady;
  }

  // Bloques crudos — esto se guarda en content_json para poder re-editar despues
  async save() {
    return this.editor.save(); // { time, blocks, version }
  }

  // Convierte bloques ya guardados a HTML — esto se guarda en content_html
  // para que las paginas publicas (que no cambiaron) sigan funcionando igual.
  toHTML(blocksOutput) {
    if (!blocksOutput?.blocks?.length) return "";
    return blocksOutput.blocks.map(blockToHtml).join("");
  }

  isEmpty(blocksOutput) {
    return !blocksOutput?.blocks?.length;
  }

  destroy() {
    return this.editor.destroy?.();
  }
}
