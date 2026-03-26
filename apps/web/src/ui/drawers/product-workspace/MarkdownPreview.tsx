import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useRootStore } from "../../../stores/root-store";
import { parseInternalReferenceHref } from "../../../lib/internal-references";
import { InternalReferenceDrawer } from "../reference/InternalReferenceDrawer";
import { markdownWithTitle } from "../../../util/markdownWithTitle";
import { markdownTruncate } from "../../../util/markdownTruncate";

type MarkdownPreviewProps = {
  markdown: string | null | undefined;
  compact?: boolean;
  emptyLabel?: string;
  className?: string;
  title?: string;
  titleLevel?: number;
  previewSize?: number
};

const defaultPreviewSize = 600;

export function MarkdownPreview(props: MarkdownPreviewProps) {
  const store = useRootStore();
  const [expanded, setExpanded] = useState(false)
  const previewSize = props.previewSize ?? defaultPreviewSize

  const { markdown, compact = false, emptyLabel = "Sin contenido.", className = "" } = props;
  let content = markdownWithTitle(props.title, `${markdown?.trim().slice(0, expanded ? undefined : previewSize)}...`, props?.titleLevel)

  if (!content) {
    return <p className={`muted markdown-preview-empty ${className}`.trim()}>{emptyLabel}</p>;
  }

  let mustSlice = content.length > previewSize;
  if (!expanded) {
    const sliceIndex = markdownTruncate(content, previewSize)
  }

  return (
    <div className={`markdown-preview ${compact ? "is-compact" : ""} ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a(anchorProps) {
            const internalReference = parseInternalReferenceHref(anchorProps.href);
            if (!internalReference) {
              return <a {...anchorProps} target="_blank" rel="noreferrer" />;
            }

            return (
              <a
                {...anchorProps}
                href={anchorProps.href}
                className={`internal-reference-link ${anchorProps.className ?? ""}`.trim()}
                onClick={(event) => {
                  event.preventDefault();
                  store.drawers.add(new InternalReferenceDrawer(internalReference));
                }}
              />
            );
          }
        }}
      >
        {content}
      </ReactMarkdown>
      {mustSlice && !expanded && <button className="btn btn-secondary sm" onClick={() => setExpanded(true)}> Expandir</button>}
      {mustSlice && expanded && <button className="btn btn-secondary sm" onClick={() => setExpanded(false)}> Colapsar</button>}
    </div >
  );
}
