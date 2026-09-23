const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const span = (kind: string, value: string) => `<span class="syntax-${kind}">${escape(value)}</span>`

/** 軽量な表示用トークナイザ。編集・Markdown変換には使わない。 */
export function editorHighlightHtml(source: string): string {
  let fenced = false
  return source.split('\n').map((line) => {
    if (/^```/.test(line)) { fenced = !fenced; return span('code', line) }
    if (fenced) return span('code', line)
    let html = escape(line)
    html = html.replace(/(&lt;!--.*?--&gt;)/g, '<span class="syntax-comment">$1</span>')
    html = html.replace(/(\\[A-Za-z]+|\$\$?|\$)/g, '<span class="syntax-math">$1</span>')
    html = html.replace(/(`[^`]*`)/g, '<span class="syntax-code">$1</span>')
    html = html.replace(/^(#{1,6} .*)$/g, '<span class="syntax-heading">$1</span>')
    html = html.replace(/^(\s*(?:&gt;|[-*+] |\d+\. ).*)$/g, '<span class="syntax-marker">$1</span>')
    html = html.replace(/(\*\*[^*]+\*\*|\*[^*]+\*)/g, '<span class="syntax-strong">$1</span>')
    html = html.replace(/(\[[^\]]+\]\([^)]*\))/g, '<span class="syntax-link">$1</span>')
    return html
  }).join('\n') + '\n'
}
