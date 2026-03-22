import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownWithTitle } from "../../../util/markdownWithTitle";

type MarkdownPreviewProps = {
  markdown: string | null | undefined;
  compact?: boolean;
  emptyLabel?: string;
  className?: string;
  title?: string;
  titleLevel?: number;
};

const previewSize = 600;

export function MarkdownPreview(props: MarkdownPreviewProps) {
  const [expanded, setExpanded] = useState(false)

  const { markdown, compact = false, emptyLabel = "Sin contenido.", className = "" } = props;
  const content = markdown?.trim();

  if (!content) {
    return <p className={`muted markdown-preview-empty ${className}`.trim()}>{emptyLabel}</p>;
  }

  const sliced = markdownWithTitle(props.title, `${content.slice(0, expanded ? undefined : previewSize)}${content.length > previewSize && !expanded ? '...' : ''}`, props?.titleLevel)

  return (
    <div className={`markdown-preview ${compact ? "is-compact" : ""} ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{sliced}</ReactMarkdown>
      {content.length > previewSize && !expanded && <button className="btn btn-secondary sm" onClick={() => setExpanded(true)}> Expandir</button>}
    </div >
  );
}
