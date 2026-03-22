export function markdownWithTitle(title?: null | string, body?: null | string, level = 1) {
  return `${title ? `${new Array(level).fill('#').join('')} ${title}
  
` : ''}${body ?? ''}`
}