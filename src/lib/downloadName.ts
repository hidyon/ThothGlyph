/**
 * 書き出すファイルの名前と中身を決める（0034）。
 *
 * ダウンロードそのもの（Blobと `<a download>`）はここに置かない。0012と同じく、
 * 純粋関数だけを `lib/` に出して単体テストで確かめる。
 */

/** 見出しの行。`#` が1〜6個＋空白で始まる最初の行を名前の元にする。 */
const HEADING = /^#{1,6}[ \t]+(.+?)[ \t]*$/m

/** OSがファイル名に使えない文字。制御文字を含めてまとめて `-` にする。 */
// eslint-disable-next-line no-control-regex
const UNUSABLE = /[/\\:*?"<>|\u0000-\u001f]/g

/** 長い見出しがそのまま名前になると、OSによっては保存に失敗する。 */
const MAX_NAME_LENGTH = 50

/** 見出しがない・名前が空になるときの既定。 */
const FALLBACK = 'document'

/**
 * ソースから `<名前>.md` を作る。
 *
 * 見出しの中のMarkdown記法を剥がす処理は入れない（剥がし方の正しさが別の
 * 問題になる）。ただし使えない文字の置き換えはそのあとに効くので、
 * `**強調**` は `--強調--` になる（`*` はWindowsで使えない）。`$` は残る。
 */
export function fileNameFor(source: string): string {
  const heading = source.match(HEADING)?.[1] ?? ''
  const cleaned = heading
    .replace(UNUSABLE, '-')
    .slice(0, MAX_NAME_LENGTH)
    // 前後の空白と `.` を落とす。`...md` のような名前を作らないため。
    .replace(/^[\s.]+|[\s.]+$/g, '')
  // 置き換えの結果が区切り文字だけになることがある（`# ///` → `---`）。
  // 中身のない名前なので既定へ落とす。
  const meaningless = /^[-\s.]*$/.test(cleaned)
  return `${meaningless ? FALLBACK : cleaned}.md`
}

/**
 * 書き出す中身。末尾に改行がなければ1つ足す
 * （行指向の道具で開いたときに最終行が欠けないように）。
 */
export function contentFor(source: string): string {
  if (source === '') return ''
  return source.endsWith('\n') ? source : `${source}\n`
}

/** 空白だけの文書は書き出さない。空のファイルには使い道がない。 */
export function isEmptySource(source: string): boolean {
  return source.trim() === ''
}
