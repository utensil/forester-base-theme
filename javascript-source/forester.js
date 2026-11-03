import 'ninja-keys';
import katex from 'katex';

import autoRenderMath from 'katex/contrib/auto-render';

function partition(array, isValid) {
 return array.reduce(([pass, fail], elem) => {
  return isValid(elem) ? [[...pass, elem], fail] : [pass, [...fail, elem]];
 }, [[], []]);
}

// Display math keeps KaTeX's own HTML output, because that is where the
// constructs MathML Core cannot express live: \hline table rules, \cancel
// strikes, \boxed frames, \overbrace, and the \begin{align}/\begin{CD}
// environments. Inline math — the large majority of the formulas on a
// math-heavy page — is rendered as MathML instead: browsers draw it natively, so
// one formula becomes ~15 elements instead of ~35, building it costs about a
// fifth as much, and it still carries full semantics for screen readers and
// copy-as-TeX.
const displayDelimiters = [
 { left: '$$', right: '$$', display: true },
 { left: '\\[', right: '\\]', display: true },
 { left: '\\begin{equation}', right: '\\end{equation}', display: true },
 { left: '\\begin{align}', right: '\\end{align}', display: true },
 { left: '\\begin{alignat}', right: '\\end{alignat}', display: true },
 { left: '\\begin{gather}', right: '\\end{gather}', display: true },
 { left: '\\begin{CD}', right: '\\end{CD}', display: true },
]

const inlineDelimiters = [{ left: '\\(', right: '\\)', display: false }]

// Every engine has MathML Core since January 2023, which is also when
// `MathMLElement` appeared; older browsers keep HTML output for inline math too.
const supportsMathML = typeof MathMLElement !== 'undefined'

// Inline formulas that would lose their rules, strikes or frames as MathML.
// KaTeX keeps the TeX source in an <annotation>, so these can be re-rendered as
// HTML after the fact instead of giving up the whole page's savings.
const needsHtml = /\\(cancel|bcancel|xcancel|boxed|fbox|overbrace|underbrace|hline)\b|\\begin\{CD\}/

window.addEventListener("load", (event) => {
 // macros are shared across both passes, so a \gdef in one formula reaches the
 // formulas rendered by the other pass as well
 const macros = {}
 const shared = { macros, ignoredClasses: ['katex'] }

 autoRenderMath(document.body, {
  ...shared,
  output: 'htmlAndMathml',
  delimiters: displayDelimiters,
 })

 autoRenderMath(document.body, {
  ...shared,
  output: supportsMathML ? 'mathml' : 'html',
  delimiters: inlineDelimiters,
 })

 for (const annotation of document.querySelectorAll('.katex annotation[encoding="application/x-tex"]')) {
  const tex = annotation.textContent || ''
  if (!needsHtml.test(tex)) continue
  const holder = annotation.closest('.katex').parentElement
  if (!holder || holder.closest('.katex-display')) continue
  try {
   katex.render(tex, holder, { displayMode: false, strict: 'ignore', output: 'html', macros })
  } catch (e) {
   console.error('KaTeX fallback rendering failed', e)
  }
 }

 const openAllDetailsAbove = elt => {
  while (elt != null) {
   if (elt.nodeName == 'DETAILS') {
    elt.open = true
   }

   elt = elt.parentNode;
  }
 }

 const jumpToSubtree = evt => {
  if (evt.target.tagName === "A") {
   return;
  }

  const link = evt.target.closest('span[data-target]')
  const selector = link.getAttribute('data-target')
  const tree = document.querySelector(selector)
  openAllDetailsAbove(tree)
  window.location = selector
 }


 [...document.querySelectorAll("[data-target^='#']")].forEach(
  el => el.addEventListener("click", jumpToSubtree)
 );

 const ninja = document.querySelector('ninja-keys');
 const baseUrl = document.querySelector('html').getAttribute('data-base-url')
 const jsonUrl = `${baseUrl}forest.json`

 fetch(jsonUrl)
  .then((res) => res.json())
  .then((trees) => {
   const items = []
 
   const editIcon = '<svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20"><path d="M480-120v-71l216-216 71 71-216 216h-71ZM120-330v-60h300v60H120Zm690-49-71-71 29-29q8-8 21-8t21 8l29 29q8 8 8 21t-8 21l-29 29ZM120-495v-60h470v60H120Zm0-165v-60h470v60H120Z"/></svg>'
   const bookmarkIcon = '<svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20"><path d="M120-40v-700q0-24 18-42t42-18h480q24 0 42.5 18t18.5 42v700L420-167 120-40Zm60-91 240-103 240 103v-609H180v609Zm600 1v-730H233v-60h547q24 0 42 18t18 42v730h-60ZM180-740h480-480Z"/></svg>'
 
   if (window.sourcePath) {
    items.push({
     id: 'edit',
     title: 'Edit current tree in Visual Studio Code',
     section: 'Commands',
     hotkey: 'cmd+e',
     icon: editIcon,
     handler: () => {
      window.location.href = `vscode://file/${window.sourcePath}`
     }
    })
   }
 
   const isTopTree = (item) => {
    return item.tags ? item.tags.includes('top') : false
   }
 
   const addItemToSection = (item, section, icon) => {
    const title =
     item.taxon
      ? (item.title ? `${item.taxon}. ${item.title}` : item.taxon)
      : (item.title ? item.title : "Untitled")
    const fullTitle = `${title} [${item.uri}]`
    items.push({
     id: item.uri,
     title: fullTitle,
     section: section,
     icon: icon,
     handler: () => {
      window.location.href = item.route
     }
    })
   }
 
   const [top, rest] = partition(trees, isTopTree)
   top.forEach((item) => addItemToSection(item, "Top Trees", bookmarkIcon))
   rest.forEach((item) => addItemToSection(item, "All Trees", null))
 
   ninja.data = items
  }); 
});


