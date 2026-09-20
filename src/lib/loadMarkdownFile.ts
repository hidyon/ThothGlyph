/**
 * 読み込むファイルの判定と、読めたテキストの正規化（0012）。
 *
 * ファイルの読み取り（`File.text()`）自体はここに置かない。判定と正規化だけを
 * 純粋関数にして単体テストで確かめ、ブラウザのAPIに触る部分は呼ぶ側に残す。
 */

/** 受け入れる拡張子。`.txt` を含めるのは、Markdownを `.txt` で持っている人がいるため。 */
const EXTENSIONS = ['.md', '.markdown', '.txt']

/**
 * 上限1MB。0007の検証で扱えている400節・400数式の文書が26.9 kBで、その約38倍。
 * これを超えると、プレビューの性能以前に自動保存（localStorage）が通らない。
 */
export const MAX_FILE_BYTES = 1024 * 1024

export type FileRejection = 'extension' | 'size'

export type FileCheck = { ok: true } | { ok: false; reason: FileRejection }

/**
 * 名前と大きさだけで受け入れを決める。中身は見ない（読む前に断るため）。
 *
 * MIMEタイプで見ないのは、OSによって `.md` のtypeが空になるため。
 */
export function checkFile(name: string, size: number): FileCheck {
  const lower = name.toLowerCase()
  if (!EXTENSIONS.some((ext) => lower.endsWith(ext))) return { ok: false, reason: 'extension' }
  if (size > MAX_FILE_BYTES) return { ok: false, reason: 'size' }
  return { ok: true }
}

/**
 * エディタへ入れる前の正規化。
 *
 * BOMを落とすのは、先頭に見えない文字が残ると最初の見出しが `#` と認識されず、
 * プレビューが本文として描くため。改行を揃えるのは、CRLFのまま入れると
 * textareaでの文字数とカーソル位置が保存・復元でずれるため。
 */
export function normalizeText(text: string): string {
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
}
