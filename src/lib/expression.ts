/**
 * グラフの式（`x^2 - 2x` など）を1変数の関数に変換する。
 *
 * `eval` も `new Function` も使わない。外から読み込んだ `.md`（[0012](../../docs/specs/0012-file-load.md)）が
 * そのままコードとして走る経路を作らないため。トークナイザ → 逆ポーランド →
 * 評価の3段で、すべて純粋関数として書く。
 */

type UnaryFunc = (value: number) => number

const FUNCTIONS: Record<string, UnaryFunc> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  log: Math.log,
}

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
}

type BinaryOp = '+' | '-' | '*' | '/' | '^'

/** 優先順位。単項マイナスは `^` より弱く `*` より強い（`-x^2` は `-(x^2)`）。 */
const PRECEDENCE: Record<BinaryOp | 'neg', number> = {
  '+': 1,
  '-': 1,
  '*': 2,
  '/': 2,
  neg: 3,
  '^': 4,
}

const BINARY: Record<BinaryOp, (a: number, b: number) => number> = {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => a / b,
  '^': (a, b) => a ** b,
}

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'var' }
  | { kind: 'const'; value: number }
  | { kind: 'func'; apply: UnaryFunc }
  | { kind: 'op'; op: BinaryOp }
  | { kind: 'neg' }
  | { kind: 'open' }
  | { kind: 'close' }

/** 数は `3` `0.5` `.5` を受ける。名前は小文字だけ（`X` や `SIN` はエラー）。 */
const NUMBER = /^(?:\d+\.?\d*|\.\d+)/
const NAME = /^[a-z]+/

export type CompiledExpression = {
  /** 元の文字列。エラーメッセージと凡例に出す。 */
  source: string
  /** `x` を含むか。範囲の指定（`x: -3..5`）では含んではいけない。 */
  usesX: boolean
  evaluate: (x: number) => number
}

export type CompileResult =
  | { ok: true; expression: CompiledExpression }
  | { ok: false }

/** 文字列を関数にする。読めなければ `{ ok: false }` を返す（例外は投げない）。 */
export function compileExpression(source: string): CompileResult {
  const tokens = tokenize(source)
  if (tokens === null) return { ok: false }

  const rpn = toReversePolish(withImplicitMultiplication(tokens))
  if (rpn === null) return { ok: false }

  // スタックの辻褄が合うかは、ここで1度だけ確かめる（評価のたびには見ない）。
  if (!isEvaluable(rpn)) return { ok: false }

  return {
    ok: true,
    expression: {
      source: source.trim(),
      usesX: rpn.some((token) => token.kind === 'var'),
      evaluate: (x: number) => evaluate(rpn, x),
    },
  }
}

function tokenize(source: string): Token[] | null {
  const tokens: Token[] = []
  let rest = source

  while (rest.length > 0) {
    const char = rest[0] as string

    if (char === ' ' || char === '\t') {
      rest = rest.slice(1)
      continue
    }

    const number = NUMBER.exec(rest)
    if (number !== null) {
      tokens.push({ kind: 'num', value: Number(number[0]) })
      rest = rest.slice(number[0].length)
      continue
    }

    const name = NAME.exec(rest)
    if (name !== null) {
      const word = name[0]
      rest = rest.slice(word.length)

      if (word === 'x') {
        tokens.push({ kind: 'var' })
      } else if (word in CONSTANTS) {
        tokens.push({ kind: 'const', value: CONSTANTS[word] as number })
      } else if (word in FUNCTIONS) {
        tokens.push({ kind: 'func', apply: FUNCTIONS[word] as UnaryFunc })
      } else {
        return null
      }
      continue
    }

    if (char === '(') {
      tokens.push({ kind: 'open' })
      rest = rest.slice(1)
      continue
    }
    if (char === ')') {
      tokens.push({ kind: 'close' })
      rest = rest.slice(1)
      continue
    }
    if (char === '+' || char === '-' || char === '*' || char === '/' || char === '^') {
      // 直前が値でなければ単項マイナス（`-x`、`2 * -x`、`(-3)`）。
      const previous = tokens.at(-1)
      const afterValue =
        previous !== undefined &&
        (previous.kind === 'num' ||
          previous.kind === 'var' ||
          previous.kind === 'const' ||
          previous.kind === 'close')

      if (char === '-' && !afterValue) tokens.push({ kind: 'neg' })
      else tokens.push({ kind: 'op', op: char })
      rest = rest.slice(1)
      continue
    }

    return null
  }

  return tokens
}

/** `2x` `3(x+1)` `2sin(x)` の `*` を補う。 */
function withImplicitMultiplication(tokens: Token[]): Token[] {
  const out: Token[] = []

  for (const token of tokens) {
    const previous = out.at(-1)
    const closesValue =
      previous !== undefined &&
      (previous.kind === 'num' ||
        previous.kind === 'var' ||
        previous.kind === 'const' ||
        previous.kind === 'close')
    const opensValue =
      token.kind === 'num' ||
      token.kind === 'var' ||
      token.kind === 'const' ||
      token.kind === 'func' ||
      token.kind === 'open'

    if (closesValue && opensValue) out.push({ kind: 'op', op: '*' })
    out.push(token)
  }

  return out
}

/** shunting-yard。括弧が合わなければ null。 */
function toReversePolish(tokens: Token[]): Token[] | null {
  const out: Token[] = []
  const stack: Token[] = []

  const precedenceOf = (token: Token): number =>
    token.kind === 'op' ? PRECEDENCE[token.op] : token.kind === 'neg' ? PRECEDENCE.neg : -1

  for (const token of tokens) {
    switch (token.kind) {
      case 'num':
      case 'var':
      case 'const':
        out.push(token)
        break
      case 'func':
        stack.push(token)
        break
      case 'open':
        stack.push(token)
        break
      case 'close': {
        while (stack.length > 0 && (stack.at(-1) as Token).kind !== 'open') {
          out.push(stack.pop() as Token)
        }
        if (stack.length === 0) return null
        stack.pop()
        // 括弧の直前が関数なら、その関数はここで確定する。
        if ((stack.at(-1) as Token | undefined)?.kind === 'func') out.push(stack.pop() as Token)
        break
      }
      case 'op':
      case 'neg': {
        // `^` と単項マイナスは右結合。等しい優先順位では積み直さない。
        const rightAssociative = token.kind === 'neg' || token.op === '^'
        while (stack.length > 0) {
          const top = stack.at(-1) as Token
          if (top.kind !== 'op' && top.kind !== 'neg') break
          const higher = precedenceOf(top) > precedenceOf(token)
          const equal = precedenceOf(top) === precedenceOf(token)
          if (!higher && !(equal && !rightAssociative)) break
          out.push(stack.pop() as Token)
        }
        stack.push(token)
        break
      }
    }
  }

  while (stack.length > 0) {
    const top = stack.pop() as Token
    if (top.kind === 'open') return null
    out.push(top)
  }

  return out
}

/** 評価してスタックがちょうど1つ残るか。`x^^2` や `(x` をここで弾く。 */
function isEvaluable(rpn: Token[]): boolean {
  let depth = 0

  for (const token of rpn) {
    switch (token.kind) {
      case 'num':
      case 'var':
      case 'const':
        depth += 1
        break
      case 'func':
      case 'neg':
        if (depth < 1) return false
        break
      case 'op':
        if (depth < 2) return false
        depth -= 1
        break
      default:
        return false
    }
  }

  return depth === 1
}

function evaluate(rpn: Token[], x: number): number {
  const stack: number[] = []

  for (const token of rpn) {
    switch (token.kind) {
      case 'num':
        stack.push(token.value)
        break
      case 'const':
        stack.push(token.value)
        break
      case 'var':
        stack.push(x)
        break
      case 'func':
        stack.push(token.apply(stack.pop() as number))
        break
      case 'neg':
        stack.push(-(stack.pop() as number))
        break
      case 'op': {
        const right = stack.pop() as number
        const left = stack.pop() as number
        stack.push(BINARY[token.op](left, right))
        break
      }
      default:
        return NaN
    }
  }

  return stack.pop() as number
}
