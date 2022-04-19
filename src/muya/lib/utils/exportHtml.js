import marked from '../parser/marked'
import Prism from 'prismjs'
import katex from 'katex'
import 'katex/dist/contrib/mhchem.min.js'
import loadRenderer from '../renderers'
import githubMarkdownCss from 'github-markdown-css/github-markdown.css'
import exportStyle from '../assets/styles/exportStyle.css'
import highlightCss from 'prismjs/themes/prism.css'
import katexCss from 'katex/dist/katex.css'
import footerHeaderCss from '../assets/styles/headerFooterStyle.css'
import { EXPORT_DOMPURIFY_CONFIG } from '../config'
import { sanitize, unescapeHTML } from '../utils'
import { validEmoji } from '../ui/emojis'

export const getSanitizeHtml = (markdown, options) => {
  const html = marked(markdown, options)
  return sanitize(html, EXPORT_DOMPURIFY_CONFIG, false)
}

const DIAGRAM_TYPE = [
  'mermaid',
  'flowchart',
  'sequence',
  'plantuml',
  'vega-lite'
]

class ExportHtml {
  constructor (markdown, muya) {
    this.markdown = markdown
    this.muya = muya
    this.exportContainer = null
    this.mathRendererCalled = false
  }

  async renderMermaid () {
    const codes = this.exportContainer.querySelectorAll('code.language-mermaid')
    for (const code of codes) {
      const preEle = code.parentNode
      const mermaidContainer = document.createElement('div')
      mermaidContainer.innerHTML = sanitize(unescapeHTML(code.innerHTML), EXPORT_DOMPURIFY_CONFIG, true)
      mermaidContainer.classList.add('mermaid')
      preEle.replaceWith(mermaidContainer)
    }
    const mermaid = await loadRenderer('mermaid')
    // We only export light theme, so set mermaid theme to `default`, in the future, we can choose whick theme to export.
    mermaid.initialize({
      securityLevel: 'strict',
      theme: 'default'
    })
    mermaid.init(undefined, this.exportContainer.querySelectorAll('div.mermaid'))
    if (this.muya) {
      mermaid.initialize({
        securityLevel: 'strict',
        theme: this.muya.options.mermaidTheme
      })
    }
  }

  async renderDiagram () {
    const selector = 'code.language-vega-lite, code.language-flowchart, code.language-sequence, code.language-plantuml'
    const RENDER_MAP = {
      flowchart: await loadRenderer('flowchart'),
      sequence: await loadRenderer('sequence'),
      plantuml: await loadRenderer('plantuml'),
      'vega-lite': await loadRenderer('vega-lite')
    }
    const codes = this.exportContainer.querySelectorAll(selector)
    for (const code of codes) {
      const rawCode = unescapeHTML(code.innerHTML)
      const functionType = (() => {
        if (/sequence/.test(code.className)) {
          return 'sequence'
        } else if (/plantuml/.test(code.className)) {
          return 'plantuml'
        } else if (/flowchart/.test(code.className)) {
          return 'flowchart'
        } else {
          return 'vega-lite'
        }
      })()
      const render = RENDER_MAP[functionType]
      const preParent = code.parentNode
      const diagramContainer = document.createElement('div')
      diagramContainer.classList.add(functionType)
      preParent.replaceWith(diagramContainer)
      const options = {}
      if (functionType === 'sequence') {
        Object.assign(options, { theme: this.muya.options.sequenceTheme })
      } else if (functionType === 'vega-lite') {
        Object.assign(options, {
          actions: false,
          tooltip: false,
          renderer: 'svg',
          theme: 'latimes' // only render light theme
        })
      }
      try {
        if (functionType === 'flowchart' || functionType === 'sequence') {
          const diagram = render.parse(rawCode)
          diagramContainer.innerHTML = ''
          diagram.drawSVG(diagramContainer, options)
        }
        if (functionType === 'plantuml') {
          const diagram = render.parse(rawCode)
          diagramContainer.innerHTML = ''
          diagram.insertImgElement(diagramContainer)
        }
        if (functionType === 'vega-lite') {
          await render(diagramContainer, JSON.parse(rawCode), options)
        }
      } catch (err) {
        diagramContainer.innerHTML = '< Invalid Diagram >'
      }
    }
  }

  mathRenderer = (math, displayMode) => {
    this.mathRendererCalled = true

    try {
      return katex.renderToString(math, {
        displayMode
      })
    } catch (err) {
      return displayMode
        ? `<pre class="multiple-math invalid">\n${math}</pre>\n`
        : `<span class="inline-math invalid" title="invalid math">${math}</span>`
    }
  }

  // render pure html by marked
  async renderHtml (toc) {
    this.mathRendererCalled = false
    let html = marked(this.markdown, {
      superSubScript: this.muya ? this.muya.options.superSubScript : false,
      footnote: this.muya ? this.muya.options.footnote : false,
      isGitlabCompatibilityEnabled: this.muya ? this.muya.options.isGitlabCompatibilityEnabled : false,
      highlight (code, lang) {
        // Language may be undefined (GH#591)
        if (!lang) {
          return code
        }

        if (DIAGRAM_TYPE.includes(lang)) {
          return code
        }

        const grammar = Prism.languages[lang]
        if (!grammar) {
          console.warn(`Unable to find grammar for "${lang}".`)
          return code
        }
        return Prism.highlight(code, grammar, lang)
      },
      emojiRenderer (emoji) {
        const validate = validEmoji(emoji)
        if (validate) {
          return validate.emoji
        } else {
          return `:${emoji}:`
        }
      },
      mathRenderer: this.mathRenderer,
      tocRenderer () {
        if (!toc) {
          return ''
        }
        return toc
      }
    })

    html = sanitize(html, EXPORT_DOMPURIFY_CONFIG, false)

    const exportContainer = this.exportContainer = document.createElement('div')
    exportContainer.classList.add('ag-render-container')
    exportContainer.innerHTML = html
    document.body.appendChild(exportContainer)

    // render only render the light theme of mermaid and diragram...
    await this.renderMermaid()
    await this.renderDiagram()
    let result = exportContainer.innerHTML
    exportContainer.remove()

    // hack to add arrow marker to output html
    const pathes = document.querySelectorAll('path[id^=raphael-marker-]')
    const def = '<defs style="-webkit-tap-highlight-color: rgba(0, 0, 0, 0);">'
    result = result.replace(def, () => {
      let str = ''
      for (const path of pathes) {
        str += path.outerHTML
      }
      return `${def}${str}`
    })

    this.exportContainer = null
    return result
  }

  /**
   * Get HTML with style
   *
   * @param {*} options Document options
   */
  async generate (options) {
    const { printOptimization } = options

    // WORKAROUND: Hide Prism.js style when exporting or printing. Otherwise the background color is white in the dark theme.
    const highlightCssStyle = printOptimization ? `@media print { ${highlightCss} }` : highlightCss
    const html = this._prepareHtml(await this.renderHtml(options.toc), options)
    const katexCssStyle = this.mathRendererCalled ? katexCss : ''
    this.mathRendererCalled = false

    // `extraCss` may changed in the mean time.
    const { title, extraCss } = options
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${sanitize(title, EXPORT_DOMPURIFY_CONFIG, true)}</title>
  <style>
  ${githubMarkdownCss}
  </style>
  <style>
  ${highlightCssStyle}
  </style>
  <style>
  ${katexCssStyle}
  </style>
  <style>
  :root{
    --accent-primary: #1870f0;
    --border-primary: #cfcfd8;
    --border-secondary: #e0e0e6;
  }

  .code-web{
      display: flex;
      height: 300px;
      overflow: hidden;
  }

  .tab-container{
      width: 60%;
      display: flex;
      flex-direction: column;
  }
  .tab-section{
      flex-grow: 1;
      flex-shrink: 1;
      height: 0;
      position: relative;
      /* overflow: auto; */
  }
  .code-web-output{
      width: 40%;
      border-left: 1px solid var(--border-primary);
  }

  .code-web-reset{
      position: absolute;
      top: 50%;
      right: 0;
      transform: translate(0, -50%);
      border: 0 none;
      background: transparent;
      padding: 6px 10px;
      cursor: pointer;
      letter-spacing: 1.5px;
      border-radius: 2px;
  }
  .code-web-reset:hover{
      background-color: #e0e0e6;
  }
  .tab-list{
      display: flex;
      gap: .5em;
      border-bottom: 1px solid #cfcfd8;
      position: relative;
      flex-shrink: 0;
      user-select: none;
  }
  .tab-list__item{
      padding: 10px 30px;
      background-color: transparent;
      border: 0 none;
      cursor: pointer;
      border-bottom: 3px solid transparent;
      outline: none;
  }
  .tab-list__item.active{
      color: var(--accent-primary);
      border-bottom-color: var(--accent-primary);
  }

  .code-web-editor{
      /* display: none; */
      width: 100%;
      height: 100%;
      position: absolute;
      top: 0;
      left: 1000%;
  }
  .code-web-editor.active{
      left: 0;
  }
  .code-web-editor.active .CodeMirror{
      height: 100%;
  }
  .hidden{
      display: none;
  }


  .hy-school{
      background-color: #e7ecf3;
      padding: .7em 1em;
      border-radius: 2px;
      color: #486491;
      position: relative;
  }
  .hy-school-toolbar{
      display: flex;
      justify-content: space-between;
      align-items: center;
  }
  .hy-toolbar-playicon{
      position: relative;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background-color: #73abfe;
      margin-right: 10px;
  }

  .hy-toolbar-playicon::before{
      content: '';
      position: absolute;
      display: block;
      width: 0;
      height: 0;
      top: 50%;
      left: 50%;
      border-top: 5px solid transparent;
      border-bottom: 5px solid transparent;
      border-left: 8px solid #fff;
      transform: translate(-50%, -50%);
  }


  .hy-toolbar-left{
      display: flex;
      align-items: center;
      cursor: pointer;
  }
  .hy-toolbar-right{
      margin-right: 25px;
      cursor: pointer;
      display: flex;
      /* display: none; */
  }
  .hy-toolbar-right__close{
      display: none;
  }
  .hy-toolbar-right__close.active{
      display: block;
  }

  .hy-toolbar-right-controls{
      display: flex;
      margin-left: 20px;
  }
  .hy-toolbar-right-controls__switch{
      height: 22px;
      width: 42px;
      background-color: rgb(4, 190, 2);
      border: 1px solid rgb(4, 190, 2);
      border-radius: 52px;
      position: relative;
      overflow: hidden;
      transition: all .3s;
      cursor: pointer;
  }
  .hy-toolbar-right-controls__switch::after{
      content: '';
      width: 22px;
      height: 22px;
      background-color: #fff;
      display: block;
      border-radius: 50%;
      top: 0;
      left: 0px;
      position: absolute;
      transition: all .3s;
  }
  .hy-toolbar-right-controls__switch.close{
      background-color: #FDFDFD;
      border-color: #DFDFDF;
  }
  .hy-toolbar-right-controls__switch.close::after{
      box-shadow: 0 1px 3px rgb(0 0 0 / 40%);
      left: 100%;
      transform: translateX(-100%);
  }


  .hy-school-wrap{
      margin-top: 15px;
      display: none;
  }
  .hy-school-wrap.active{
      display: block;
  }
  .hy-school-wrap video{
      width: 100%;
      height: 350px;
      border-radius: 2px;
  }
  </style>
  <style>
    .markdown-body {
      font-family: -apple-system,Segoe UI,Helvetica,Arial,sans-serif,Apple Color Emoji,Segoe UI Emoji;
      box-sizing: border-box;
      min-width: 200px;
      max-width: 980px;
      margin: 0 auto;
      padding: 45px;
    }

    @media not print {
      .markdown-body {
        padding: 45px;
      }

      @media (max-width: 767px) {
        .markdown-body {
          padding: 15px;
        }
      }
    }

    .hf-container {
      color: #24292e;
      line-height: 1.3;
    }

    .markdown-body .highlight pre,
    .markdown-body pre {
      white-space: pre-wrap;
    }
    .markdown-body table {
      display: table;
    }
    .markdown-body img[data-align="center"] {
      display: block;
      margin: 0 auto;
    }
    .markdown-body img[data-align="right"] {
      display: block;
      margin: 0 0 0 auto;
    }
    .markdown-body li.task-list-item {
      list-style-type: none;
    }
    .markdown-body li > [type=checkbox] {
      margin: 0 0 0 -1.3em;
    }
    .markdown-body input[type="checkbox"] ~ p {
      margin-top: 0;
      display: inline-block;
    }
    .markdown-body ol ol,
    .markdown-body ul ol {
      list-style-type: decimal;
    }
    .markdown-body ol ol ol,
    .markdown-body ol ul ol,
    .markdown-body ul ol ol,
    .markdown-body ul ul ol {
      list-style-type: decimal;
    }
  </style>
  <style>${exportStyle}</style>
  <style>${extraCss}</style>
</head>
<body>
  ${html}
</body>
<script defer="defer" src="//tkcdn.aihyzh.com/markdown-tool/inject.js">
</script>
</html>`
  }

  /**
   * @private
   *
   * @param {string} html The converted HTML text.
   * @param {*} options The export options.
   */
  _prepareHtml (html, options) {
    const { header, footer } = options
    const appendHeaderFooter = !!header || !!footer
    if (!appendHeaderFooter) {
      return createMarkdownArticle(html)
    }

    if (!options.extraCss) {
      options.extraCss = footerHeaderCss
    } else {
      options.extraCss = footerHeaderCss + options.extraCss
    }

    let output = HF_TABLE_START
    if (header) {
      output += createTableHeader(options)
    }

    if (footer) {
      output += HF_TABLE_FOOTER
      output = createRealFooter(options) + output
    }

    output = output + createTableBody(html) + HF_TABLE_END
    return sanitize(output, EXPORT_DOMPURIFY_CONFIG, false)
  }
}

// Variables and function to generate the header and footer.
const HF_TABLE_START = '<table class="page-container">'
const createTableBody = html => {
  return `<tbody><tr><td>
  <div class="main-container">
    ${createMarkdownArticle(html)}
  </div>
</td></tr></tbody>`
}
const HF_TABLE_END = '</table>'

/// The header at is shown at the top.
const createTableHeader = options => {
  const { header, headerFooterStyled } = options
  const { type, left, center, right } = header
  let headerClass = type === 1 ? 'single' : ''
  headerClass += getHeaderFooterStyledClass(headerFooterStyled)
  return `<thead class="page-header ${headerClass}"><tr><th>
  <div class="hf-container">
    <div class="header-content-left">${left}</div>
    <div class="header-content">${center}</div>
    <div class="header-content-right">${right}</div>
  </div>
</th></tr></thead>`
}

/// Fake footer to reserve space.
const HF_TABLE_FOOTER = `<tfoot class="page-footer-fake"><tr><td>
  <div class="hf-container">
    &nbsp;
  </div>
</td></tr></tfoot>`

/// The real footer at is shown at the bottom.
const createRealFooter = options => {
  const { footer, headerFooterStyled } = options
  const { type, left, center, right } = footer
  let footerClass = type === 1 ? 'single' : ''
  footerClass += getHeaderFooterStyledClass(headerFooterStyled)
  return `<div class="page-footer ${footerClass}">
  <div class="hf-container">
    <div class="footer-content-left">${left}</div>
    <div class="footer-content">${center}</div>
    <div class="footer-content-right">${right}</div>
  </div>
</div>`
}

/// Generate the mardown article HTML.
const createMarkdownArticle = html => {
  return `<article class="markdown-body">${html}</article>`
}

/// Return the class whether a header/footer should be styled.
const getHeaderFooterStyledClass = value => {
  if (value === undefined) {
    // Prefer theme settings.
    return ''
  }
  return !value ? ' simple' : ' styled'
}

export default ExportHtml
