import { describe, it, expect } from 'vitest'
import {
  getSocraticRules,
  getNarrationRules,
  getNoNarrationRule,
  getPaceRule,
  getEndClassRule,
  getInteractionRule,
  getPageNavigationRule,
  getTeachingLanguageRule
} from '../../../src/main/prompt/rules'

describe('getSocraticRules', () => {
  it('returns a non-empty string', () => {
    const rules = getSocraticRules()
    expect(rules.length).toBeGreaterThan(0)
  })

  it('mentions Socratic teaching method in Chinese', () => {
    const rules = getSocraticRules()
    expect(rules).toMatch(/苏格拉底/)
  })

  it('includes guidance against giving direct answers', () => {
    const rules = getSocraticRules()
    expect(rules).toMatch(/引导|追问|不直接/)
  })

  it('includes the anti-hallucination first rule', () => {
    const rules = getSocraticRules()
    expect(rules).toContain('第一铁律')
    expect(rules).toMatch(/绝不编造/)
  })

  it('mentions step-by-step progression', () => {
    const rules = getSocraticRules()
    expect(rules).toMatch(/从已知到未知|循序渐进/)
  })

  it('mentions encouraging effort over correctness', () => {
    const rules = getSocraticRules()
    expect(rules).toMatch(/鼓励|肯定|努力/)
  })

  it('matches snapshot', () => {
    expect(getSocraticRules()).toMatchSnapshot()
  })
})

describe('getNarrationRules', () => {
  it('returns a non-empty string', () => {
    const rules = getNarrationRules()
    expect(rules.length).toBeGreaterThan(0)
  })

  it('mentions single asterisk *…* for narration', () => {
    const rules = getNarrationRules()
    expect(rules).toMatch(/\*/)
  })

  it('mentions double asterisk **…** for emphasis', () => {
    const rules = getNarrationRules()
    expect(rules).toMatch(/\*\*/)
  })

  it('requires third-person narration', () => {
    const rules = getNarrationRules()
    expect(rules).toMatch(/第三人称|她挑|他/)
  })

  it('mentions ending with a question', () => {
    const rules = getNarrationRules()
    expect(rules).toMatch(/提问|问题/)
  })

  it('includes the 120-word body text limit', () => {
    const rules = getNarrationRules()
    expect(rules).toMatch(/120/)
  })

  it('includes prohibitive example against first-person narration', () => {
    const rules = getNarrationRules()
    expect(rules).toMatch(/✗.*我挑|绝不用.*我/)
  })

  it('matches snapshot', () => {
    expect(getNarrationRules()).toMatchSnapshot()
  })
})

describe('getEndClassRule', () => {
  it('returns a non-empty string', () => {
    const rule = getEndClassRule()
    expect(rule.length).toBeGreaterThan(0)
  })

  it('states that only the learner can end class', () => {
    const rule = getEndClassRule()
    expect(rule).toMatch(/下课|结束|End/)
  })

  it('explicitly forbids AI from ending class', () => {
    const rule = getEndClassRule()
    expect(rule).toMatch(/绝不要|不可|只能/)
  })

  it('allows an in-character wrap-up when the learner says they are done', () => {
    const rule = getEndClassRule()
    expect(rule).toMatch(/自然收尾/)
    expect(rule).toMatch(/提醒他点「下课」/)
  })

  it('matches snapshot', () => {
    expect(getEndClassRule()).toMatchSnapshot()
  })
})

describe('getPageNavigationRule', () => {
  it('returns a non-empty string', () => {
    const rule = getPageNavigationRule()
    expect(rule.length).toBeGreaterThan(0)
  })

  it('mentions page navigation or textbook pages', () => {
    const rule = getPageNavigationRule()
    expect(rule).toMatch(/页码|页面|翻页|导航/)
  })

  it('tells AI not to handle page navigation itself', () => {
    const rule = getPageNavigationRule()
    expect(rule).toMatch(/不要|请/)
  })

  it('matches snapshot', () => {
    expect(getPageNavigationRule()).toMatchSnapshot()
  })
})

describe('getTeachingLanguageRule', () => {
  it('returns Chinese language rule for zh', () => {
    const rule = getTeachingLanguageRule('zh')
    expect(rule.length).toBeGreaterThan(0)
    expect(rule).toMatch('中文')
    expect(rule).toMatch(/最高优先级/)
  })

  it('returns English language rule for en', () => {
    const rule = getTeachingLanguageRule('en')
    expect(rule.length).toBeGreaterThan(0)
    expect(rule).toMatch(/English/)
  })

  it('returns a non-empty string for unknown language (fallback to zh)', () => {
    const rule = getTeachingLanguageRule('fr')
    expect(rule.length).toBeGreaterThan(0)
  })

  it('each rule is pure (same input → same output)', () => {
    const r1 = getTeachingLanguageRule('zh')
    const r2 = getTeachingLanguageRule('zh')
    expect(r1).toBe(r2) // same string reference implies pure
  })

  it('zh rule matches snapshot', () => {
    expect(getTeachingLanguageRule('zh')).toMatchSnapshot()
  })

  it('en rule matches snapshot', () => {
    expect(getTeachingLanguageRule('en')).toMatchSnapshot()
  })

  it('zh-TW rule matches snapshot', () => {
    expect(getTeachingLanguageRule('zh-TW')).toMatchSnapshot()
  })
})

describe('getPaceRule', () => {
  it('returns a distinct rule for each pace', () => {
    const slow = getPaceRule('slow')
    const normal = getPaceRule('normal')
    const fast = getPaceRule('fast')

    expect(slow).toContain('慢慢来')
    expect(normal).toContain('正常')
    expect(fast).toContain('快速')
    expect(new Set([slow, normal, fast]).size).toBe(3)
  })

  it('caches identical pace strings', () => {
    expect(getPaceRule('slow')).toBe(getPaceRule('slow'))
  })
})

describe('getNoNarrationRule', () => {
  it('instructs the model to drop narration blocks', () => {
    const rule = getNoNarrationRule()
    expect(rule).toContain('旁白已关闭')
    expect(rule).toMatch(/不要输出单星号/)
  })

  it('does not mandate narration blocks', () => {
    expect(getNoNarrationRule()).not.toContain('每条消息必须包含至少一段旁白')
  })
})

describe('getInteractionRule', () => {
  it('covers opening etiquette and pause handling', () => {
    const rule = getInteractionRule()
    expect(rule).toContain('开场')
    expect(rule).toContain('暂停')
    expect(rule).toMatch(/不催促/)
  })

  it('caches identical strings', () => {
    expect(getInteractionRule()).toBe(getInteractionRule())
  })
})
