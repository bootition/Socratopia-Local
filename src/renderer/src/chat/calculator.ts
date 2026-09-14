/**
 * Local arithmetic/formula evaluator (F23).
 *
 * Deliberately dependency-free and `eval`-free: a small recursive
 * descent parser over numbers, + - * / % ^, parentheses, constants and
 * a handful of math functions. Everything runs on the user's machine
 * and never calls DeepSeek.
 */

export type CalcResult =
  | { ok: true; value: number }
  | { ok: false; error: string }

interface Token {
  type: 'number' | 'identifier' | 'operator' | 'lparen' | 'rparen' | 'comma'
  value: string
}

const FUNCTIONS: Record<string, (args: number[]) => number> = {
  sqrt: (args) => Math.sqrt(args[0]),
  abs: (args) => Math.abs(args[0]),
  round: (args) => Math.round(args[0]),
  floor: (args) => Math.floor(args[0]),
  ceil: (args) => Math.ceil(args[0]),
  sin: (args) => Math.sin(args[0]),
  cos: (args) => Math.cos(args[0]),
  tan: (args) => Math.tan(args[0]),
  ln: (args) => Math.log(args[0]),
  log: (args) => Math.log10(args[0]),
  pow: (args) => Math.pow(args[0], args[1]),
  min: (args) => Math.min(...args),
  max: (args) => Math.max(...args)
}

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E
}

/** Normalise user input: full-width symbols and Unicode operators. */
function normalize(input: string): string {
  return input
    .trim()
    .replace(/[×✕]/g, '*')
    .replace(/＋/g, '+')
    .replace(/－/g, '-')
    .replace(/[÷]/g, '/')
    .replace(/[−–—]/g, '-')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/，/g, ',')
    .replace(/\s+/g, '')
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let index = 0

  while (index < source.length) {
    const char = source[index]

    if (/[0-9.]/.test(char)) {
      let number = ''
      while (index < source.length && /[0-9.]/.test(source[index])) {
        number += source[index]
        index += 1
      }
      if ((number.match(/\./g) ?? []).length > 1) {
        throw new Error(`无效数字：${number}`)
      }
      tokens.push({ type: 'number', value: number })
      continue
    }

    if (/[a-zA-Z_]/.test(char)) {
      let name = ''
      while (index < source.length && /[a-zA-Z0-9_]/.test(source[index])) {
        name += source[index]
        index += 1
      }
      tokens.push({ type: 'identifier', value: name.toLowerCase() })
      continue
    }

    if ('+-*/%^'.includes(char)) {
      tokens.push({ type: 'operator', value: char })
      index += 1
      continue
    }
    if (char === '(') {
      tokens.push({ type: 'lparen', value: char })
      index += 1
      continue
    }
    if (char === ')') {
      tokens.push({ type: 'rparen', value: char })
      index += 1
      continue
    }
    if (char === ',') {
      tokens.push({ type: 'comma', value: char })
      index += 1
      continue
    }

    throw new Error(`无法识别的字符：${char}`)
  }

  return tokens
}

class Parser {
  private position = 0

  constructor(private readonly tokens: Token[]) {}

  parse(): number {
    if (this.tokens.length === 0) throw new Error('表达式为空')
    const value = this.parseExpression()
    if (this.position < this.tokens.length) {
      throw new Error('表达式末尾有多余内容')
    }
    return value
  }

  private peek(): Token | undefined {
    return this.tokens[this.position]
  }

  private parseExpression(): number {
    let value = this.parseTerm()
    while (true) {
      const token = this.peek()
      if (token?.type === 'operator' && (token.value === '+' || token.value === '-')) {
        this.position += 1
        const right = this.parseTerm()
        value = token.value === '+' ? value + right : value - right
        continue
      }
      return value
    }
  }

  private parseTerm(): number {
    let value = this.parseUnary()
    while (true) {
      const token = this.peek()
      if (
        token?.type === 'operator' &&
        (token.value === '*' || token.value === '/' || token.value === '%')
      ) {
        this.position += 1
        const right = this.parseUnary()
        if ((token.value === '/' || token.value === '%') && right === 0) {
          throw new Error('除数不能为 0')
        }
        if (token.value === '*') value *= right
        else if (token.value === '/') value /= right
        else value %= right
        continue
      }
      return value
    }
  }

  private parseUnary(): number {
    const token = this.peek()
    if (token?.type === 'operator' && (token.value === '+' || token.value === '-')) {
      this.position += 1
      const value = this.parseUnary()
      return token.value === '-' ? -value : value
    }
    return this.parsePower()
  }

  private parsePower(): number {
    const base = this.parsePrimary()
    const token = this.peek()
    if (token?.type === 'operator' && token.value === '^') {
      this.position += 1
      // Right-associative: 2^3^2 === 2^(3^2)
      const exponent = this.parseUnary()
      return Math.pow(base, exponent)
    }
    return base
  }

  private parsePrimary(): number {
    const token = this.peek()
    if (token === undefined) throw new Error('表达式不完整')

    if (token.type === 'number') {
      this.position += 1
      return Number.parseFloat(token.value)
    }

    if (token.type === 'identifier') {
      this.position += 1
      const name = token.value

      if (this.peek()?.type === 'lparen') {
        this.position += 1
        const args: number[] = []
        if (this.peek()?.type !== 'rparen') {
          args.push(this.parseExpression())
          while (this.peek()?.type === 'comma') {
            this.position += 1
            args.push(this.parseExpression())
          }
        }
        const closing = this.peek()
        if (closing?.type !== 'rparen') throw new Error('缺少右括号')
        this.position += 1

        const fn = FUNCTIONS[name]
        if (fn === undefined) throw new Error(`未知函数：${name}`)
        const result = fn(args)
        if (Number.isNaN(result)) throw new Error(`${name} 的结果不是数字`)
        return result
      }

      const constant = CONSTANTS[name]
      if (constant === undefined) throw new Error(`未知常量：${name}`)
      return constant
    }

    if (token.type === 'lparen') {
      this.position += 1
      const value = this.parseExpression()
      const closing = this.peek()
      if (closing?.type !== 'rparen') throw new Error('缺少右括号')
      this.position += 1
      return value
    }

    throw new Error(`意外的符号：${token.value}`)
  }
}

/** Evaluate an arithmetic expression; never throws. */
export function evaluateExpression(input: string): CalcResult {
  try {
    const normalized = normalize(input)
    const value = new Parser(tokenize(normalized)).parse()
    if (!Number.isFinite(value)) {
      return { ok: false, error: '结果不是有限数字' }
    }
    return { ok: true, value }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : '表达式无效' }
  }
}

/** Format a result for display/insertion (trims float noise). */
export function formatCalcValue(value: number): string {
  const rounded = Number.parseFloat(value.toPrecision(12))
  return String(rounded)
}
