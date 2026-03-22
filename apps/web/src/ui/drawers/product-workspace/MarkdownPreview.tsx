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
  let content = markdown?.trim();

  if (!content) {
    return <p className={`muted markdown-preview-empty ${className}`.trim()}>{emptyLabel}</p>;
  }

  let mustSlice = content.length > previewSize;
  if (!expanded && mustSlice) {
    content = markdownWithTitle(props.title, `${content.slice(0, expanded ? undefined : previewSize)}...`, props?.titleLevel)
    const sliceIndex = [...content.matchAll(/\n/g)][5];
    if (sliceIndex) {
      content = `${content.slice(0, sliceIndex.index)}\n...`
    }
  }

  return (
    <div className={`markdown-preview ${compact ? "is-compact" : ""} ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      {mustSlice && !expanded && <button className="btn btn-secondary sm" onClick={() => setExpanded(true)}> Expandir</button>}
      {mustSlice && expanded && <button className="btn btn-secondary sm" onClick={() => setExpanded(false)}> Colapsar</button>}
    </div >
  );
}
