'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Button } from './button';
import { Bold, Italic, Strikethrough, List, ListOrdered, Heading2, Undo2, Redo2, Quote, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';

type RichEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Altura minima da area de escrita. O editor cresce sozinho a partir dai. */
  minHeight?: number;
  /** Acima disso a area rola em vez de empurrar a pagina. 0 = cresce sem limite. */
  maxHeight?: number;
  className?: string;
};

type ToolButtonProps = {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
};

function ToolButton({ onClick, active, disabled, label, children }: ToolButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      className={cn(
        'h-8 w-8 px-0 shrink-0 transition-colors',
        active && 'bg-primary/15 text-primary hover:bg-primary/20'
      )}
      // onMouseDown evita que o editor perca o foco/selecao ao clicar no botao,
      // que era o motivo de a formatacao as vezes nao "pegar" no texto marcado.
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      onClick={(e) => e.preventDefault()}
    >
      {children}
    </Button>
  );
}

export function RichEditor({
  value,
  onChange,
  placeholder,
  disabled,
  minHeight = 150,
  maxHeight = 0,
  className,
}: RichEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value,
    editable: !disabled,
    // Sem isso o Next renderiza o editor no servidor e a hidratacao quebra.
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'rich-content focus:outline-none px-4 py-3',
      },
    },
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  // Só reescreve o conteudo quando a mudanca vem de fora (ex.: limpar o
  // formulario). Comparar com getHTML() evita resetar o cursor a cada tecla.
  useEffect(() => {
    if (!editor) return;
    if (value === editor.getHTML()) return;
    editor.commands.setContent(value || '', false);
  }, [value, editor]);

  if (!editor) {
    return (
      <div
        className="border rounded-lg bg-muted/20 animate-pulse"
        style={{ minHeight: minHeight + 44 }}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col border rounded-lg bg-background overflow-hidden',
        'focus-within:ring-2 focus-within:ring-ring/40 focus-within:border-ring transition-shadow',
        disabled && 'opacity-50 pointer-events-none',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-1.5 py-1 sticky top-0 z-10">
        <ToolButton label="Negrito" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Itálico" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Tachado" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="h-4 w-4" />
        </ToolButton>

        <div className="w-px h-5 bg-border mx-1" />

        <ToolButton label="Título" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="h-4 w-4" />
        </ToolButton>

        <div className="w-px h-5 bg-border mx-1" />

        <ToolButton label="Lista com marcadores" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Lista numerada" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Citação" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Linha divisória" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus className="h-4 w-4" />
        </ToolButton>

        <div className="w-px h-5 bg-border mx-1" />

        <ToolButton label="Desfazer" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Refazer" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 className="h-4 w-4" />
        </ToolButton>
      </div>

      <div className="relative flex-1 min-h-0">
        <EditorContent
          editor={editor}
          // Clicar no espaco vazio abaixo do texto tambem foca o editor.
          onClick={() => editor.chain().focus().run()}
          className={cn('cursor-text h-full', maxHeight > 0 && 'overflow-y-auto')}
          style={{
            minHeight,
            ...(maxHeight > 0 ? { maxHeight } : {}),
          }}
        />

        {placeholder && editor.isEmpty && (
          <div className="pointer-events-none absolute top-3 left-4 right-4 text-sm text-muted-foreground/70">
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
}
