import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownPreviewProps = {
  markdown: string | null | undefined;
  compact?: boolean;
  emptyLabel?: string;
  className?: string;
};

const previewSize = 600;

export function MarkdownPreview(props: MarkdownPreviewProps) {
  const [expanded, setExpanded] = useState(false)

  const { markdown, compact = false, emptyLabel = "Sin contenido.", className = "" } = props;
  const content = markdown?.trim();

  if (!content) {
    return <p className={`muted markdown-preview-empty ${className}`.trim()}>{emptyLabel}</p>;
  }

  return (
    <div className={`markdown-preview ${compact ? "is-compact" : ""} ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{`${content.slice(0, expanded ? undefined : previewSize)}${content.length > previewSize && !expanded ? '...' : ''}`}</ReactMarkdown>
      {content.length > previewSize && !expanded && <button className="btn btn-secondary sm" onClick={() => setExpanded(true)}> Expandir</button>}
    </div >
  );
}
