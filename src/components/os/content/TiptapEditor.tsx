import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Quote, Heading2, Heading3, Link as LinkIcon, Image as ImageIcon, Undo2, Redo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

interface Props {
  initialHtml?: string;
  onChange?: (payload: { html: string; json: unknown }) => void;
  placeholder?: string;
}

export function TiptapEditor({ initialHtml, onChange, placeholder }: Props) {
  const editor = useEditor({
    extensions: [
      // StarterKit v3 already bundles Link + Underline; disable its versions so
      // our configured Link (openOnClick:false) is the sole registration and no
      // duplicate-extension warnings strip content on save.
      StarterKit.configure({ link: false, underline: false }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image,
      Placeholder.configure({ placeholder: placeholder ?? "Start writing…" }),
    ],
    content: initialHtml ?? "",
    editorProps: {
      attributes: {
        class:
          "prose prose-neutral max-w-none min-h-[400px] focus:outline-none px-4 py-6",
      },
    },
    onUpdate: ({ editor: e }) => {
      onChange?.({ html: e.getHTML(), json: e.getJSON() });
    },
  });

  // Rehydrate when initialHtml changes externally (e.g. version restore or
  // slow-loading data). Skip when it already matches to avoid clobbering
  // in-flight edits.
  useEffect(() => {
    if (!editor) return;
    const next = initialHtml ?? "";
    if (editor.getHTML() === next) return;
    editor.commands.setContent(next, { emitUpdate: false });
  }, [editor, initialHtml]);

  if (!editor) return null;

  const btn = (active: boolean) =>
    `h-8 w-8 p-0 ${active ? "bg-primary/10 text-primary" : ""}`;

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1">
        <Button variant="ghost" size="sm" className={btn(editor.isActive("bold"))} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className={btn(editor.isActive("italic"))} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className={btn(editor.isActive("underline"))} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button variant="ghost" size="sm" className={btn(editor.isActive("heading", { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className={btn(editor.isActive("heading", { level: 3 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className={btn(editor.isActive("bulletList"))} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className={btn(editor.isActive("orderedList"))} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className={btn(editor.isActive("blockquote"))} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className={btn(editor.isActive("link"))} onClick={() => {
          const url = window.prompt("Link URL");
          if (url) editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
          else editor.chain().focus().unsetLink().run();
        }}>
          <LinkIcon className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => {
          const url = window.prompt("Image URL");
          if (url) editor.chain().focus().setImage({ src: url }).run();
        }}>
          <ImageIcon className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 className="h-4 w-4" />
        </Button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}