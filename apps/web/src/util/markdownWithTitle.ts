const MIN_TITLE_LEVEL = 2;
const MAX_TITLE_LEVEL = 6;

export function markdownWithTitle(title?: null | string, body?: null | string, level = MIN_TITLE_LEVEL) {
  const normalizedLevel = Number.isFinite(level) ? level : MIN_TITLE_LEVEL;
  const headingLevel = Math.min(MAX_TITLE_LEVEL, Math.max(MIN_TITLE_LEVEL, Math.trunc(normalizedLevel)));
  return `${title ? `${new Array(headingLevel).fill('#').join('')} ${title}
  
` : ''}${body ?? ''}`
}
