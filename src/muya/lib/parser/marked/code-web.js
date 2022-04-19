/* eslint-disable no-useless-escape */
const HTML_START_KEY = '------html'
const CSS_START_KEY = '------css'
const JS_START_KEY = '------js'

export default class {
  constructor (src) {
    this.src = src
    this.htmlText = ''
    this.cssText = ''
    this.jsText = ''

    this.preParse()
  }

  preParse () {
    let nHtmlIndex = this.src.indexOf(HTML_START_KEY)
    let nCssIndex = this.src.indexOf(CSS_START_KEY)
    let nJSIndex = this.src.indexOf(JS_START_KEY)

    // const hasHtml = nHtmlIndex !== -1
    const hasCss = nCssIndex !== -1
    const hasJS = nJSIndex !== -1

    // 取HTML 部分
    {
      const {
        src
      } = this
      const nStartIndex = nHtmlIndex
      let nEndIndex
      if (hasCss) {
        nEndIndex = nCssIndex
      } else if (hasJS) {
        nEndIndex = nJSIndex
      }

      this.htmlText = src.slice(nStartIndex, nEndIndex)
    }

    // 取CSS部分
    if (hasCss) {
      const {
        src
      } = this
      const nStartIndex = nCssIndex
      let nEndIndex
      if (hasJS) {
        nEndIndex = nJSIndex
      }
      this.cssText = src.slice(nStartIndex, nEndIndex)
    }

    // 取JS部分
    if (hasJS) {
      const {
        src
      } = this
      const nStartIndex = nJSIndex
      let nEndIndex

      this.jsText = src.slice(nStartIndex, nEndIndex)
    }
  }

  Html () {
    // 包含一个回车
    return this.htmlEncodeByRegExp(
      this.htmlText.slice(HTML_START_KEY.length + 1)
    )
  }

  Css () {
    // 包含一个回车
    return this.cssText.slice(CSS_START_KEY.length + 1)
  }

  Js () {
    // 包含一个回车
    return this.jsText.slice(JS_START_KEY.length + 1)
  }

  htmlEncodeByRegExp (str) {
    let temp = ''
    if (str.length === 0) return ''
    temp = str.replace(/&/g, '&amp;')
    temp = temp.replace(/</g, '&lt;')
    temp = temp.replace(/>/g, '&gt;')
    // temp = temp.replace(/\s/g, '&nbsp;')
    temp = temp.replace(/\'/g, '&#39;')
    temp = temp.replace(/\"/g, '&quot;')
    return temp
  }
}
