import { createContext, useContext } from 'react'
import zh, { type TranslationKey } from './zh'
import en from './en'

export type Locale = 'zh' | 'en'

const dictionaries: Record<Locale, Record<TranslationKey, string>> = { zh, en }

const categoryNameMap: Record<string, string> = {
  '餐饮': 'Food',
  '交通': 'Transit',
  '购物': 'Shopping',
  '娱乐': 'Fun',
  '居住': 'Rent',
  '通讯': 'Phone',
  '医疗': 'Medical',
  '教育': 'Education',
  '人情': 'Gifts',
  '其他': 'Other',
  '工资': 'Salary',
  '奖金': 'Bonus',
  '投资收益': 'Returns',
  '兼职': 'Freelance',
  '红包': 'Red Packet'
}

export interface LocaleContextValue {
  locale: Locale
  t: (key: TranslationKey, ...args: (string | number)[]) => string
  tc: (name: string) => string
  changeLocale: (locale: Locale) => void
}

export const LocaleContext = createContext<LocaleContextValue>({
  locale: 'zh',
  t: (key) => zh[key],
  tc: (name) => name,
  changeLocale: () => {}
})

export function createT(locale: Locale) {
  const dict = dictionaries[locale]
  return (key: TranslationKey, ...args: (string | number)[]): string => {
    let text = dict[key] || zh[key] || key
    args.forEach((arg, i) => {
      text = text.replace(`{${i}}`, String(arg))
    })
    return text
  }
}

export function createTc(locale: Locale) {
  return (name: string): string => {
    if (locale === 'en' && categoryNameMap[name]) {
      return categoryNameMap[name]
    }
    return name
  }
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext)
}
