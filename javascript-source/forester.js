import 'ninja-keys';
import 'katex';

import autoRenderMath from 'katex/contrib/auto-render';

function partition(array, isValid) {
 return array.reduce(([pass, fail], elem) => {
  return isValid(elem) ? [[...pass, elem], fail] : [pass, [...fail, elem]];
 }, [[], []]);
}

// KaTeX's default output carries a second, invisible MathML copy of every
// formula. Dropping it removes about a third of the DOM on math-heavy pages.
// Trade-off: that copy is what assistive technology reads, so formulas are no
// longer announced by screen readers (they stay selectable and printable).
// `macros` is shared so `\gdef` definitions still reach later formulas, which
// they would not if auto-render created a fresh macro table per call.
const mathOptions = { output: 'html', macros: {} }

// auto-render's own default ignored regions. Rendering a subtree directly
// bypasses the check it does on the way down, so it has to be repeated here.
const ignoredTags = ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option']

// taken out of document order, a formula that defines macros would run after its
// users, so those are typeset first, in document order
const definesMacros = /\\[gex]?def\b|\\newcommand\b|\\renewcommand\b|\\providecommand\b/

const containsMath = text => /\\[\[(]|\$\$|\\begin\{/.test(text)

function isIgnored(element, root) {
 for (let elt = element; elt && elt !== root; elt = elt.parentElement) {
  if (ignoredTags.includes(elt.nodeName.toLowerCase())) {
   return true
  }
 }
 return false
}

// Elements that directly hold a formula. auto-render parses text node by text
// node (joining runs of adjacent text nodes first), so handing it these
// elements renders exactly the same formulas as one call on the whole document.
function mathHolders(root) {
 const holders = new Set()
 const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
 while (walker.nextNode()) {
  const node = walker.currentNode
  if (node.previousSibling && node.previousSibling.nodeType === Node.TEXT_NODE) {
   continue // the head of this run of text nodes already looked at all of it
  }

  let text = node.nodeValue || ''
  let sibling = node.nextSibling
  while (sibling && sibling.nodeType === Node.TEXT_NODE) {
   text += sibling.nodeValue || ''
   sibling = sibling.nextSibling
  }

  if (!containsMath(text) || !node.parentElement || isIgnored(node.parentElement, root)) {
   continue
  }

  holders.add(node.parentElement)
 }
 return [...holders]
}

// Typesetting used to happen inside the `load` handler, so the browser could
// neither paint nor handle input until it finished, and the DOM it produced was
// only laid out afterwards. Render the same formulas in idle slices instead, so
// the page becomes usable immediately and formulas fill in as it is read.
function renderMathInIdleSlices(root, options) {
 const schedule = window.requestIdleCallback
  ? fn => window.requestIdleCallback(fn, { timeout: 1000 })
  : fn => setTimeout(() => fn({ didTimeout: false, timeRemaining: () => 8 }), 16)

 const holders = mathHolders(root)
 const pending = new Set(holders)
 const visible = []
 const queued = new Set()
 let next = 0
 let failures = 0
 let scheduled = false
 let observer = null

 const render = holder => {
  try {
   autoRenderMath(holder, options)
  } catch (e) {
   if (failures++ < 3) {
    console.error('KaTeX rendering failed', e)
   }
  }
 }

 // Typeset what the reader can see first, so a page never shows raw TeX where
 // someone is actually looking — after a jump into the middle of a long page in
 // particular. Everything else still fills in from document order.
 const nextHolder = () => {
  while (visible.length > 0) {
   const holder = visible.shift()
   if (pending.delete(holder)) {
    queued.delete(holder)
    return holder
   }
  }
  while (next < holders.length) {
   const holder = holders[next++]
   if (pending.delete(holder)) {
    queued.delete(holder)
    return holder
   }
  }
  return null
 }

 const finish = () => {
  if (observer) {
   observer.disconnect()
   observer = null
  }
 }

 // one idle callback in flight at a time, so an observer delivery and the tail
 // of a slice cannot queue two of them
 const scheduleStep = () => {
  if (scheduled) {
   return
  }
  scheduled = true
  schedule(deadline => {
   scheduled = false
   step(deadline)
  })
 }

 const step = deadline => {
  // bound the slice by wall-clock time, not by `didTimeout`: once the timeout
  // fires Chrome reports no remaining idle time, and trusting that flag would
  // let this loop run the whole queue as one long task — the freeze this is
  // here to avoid.
  const startedAt = performance.now()
  const budget = deadline.didTimeout ? 8 : Math.max(4, deadline.timeRemaining())
  while (performance.now() - startedAt < budget) {
   const holder = nextHolder()
   if (!holder) {
    break
   }
   if (observer) {
    observer.unobserve(holder)
   }
   render(holder)
  }

  if (pending.size === 0 && visible.length === 0) {
   finish()
   return
  }
  scheduleStep()
 }

 if (pending.size === 0) {
  return
 }

 // A formula that defines macros has to be typeset before any formula that might
 // use one, which taking holders out of document order would otherwise break.
 for (const holder of holders) {
  if (!definesMacros.test(holder.textContent || '')) {
   continue
  }
  pending.delete(holder)
  render(holder)
 }

 if (pending.size === 0) {
  return
 }

 if ('IntersectionObserver' in window) {
  observer = new IntersectionObserver(
   entries => {
    for (const entry of entries) {
     if (!entry.isIntersecting || !pending.has(entry.target) || queued.has(entry.target)) {
      continue
     }
     queued.add(entry.target)
     visible.push(entry.target)
    }
    scheduleStep()
   },
   { rootMargin: '100% 0px 100% 0px' },
  )
  for (const holder of pending) {
   observer.observe(holder)
  }
 }

 scheduleStep()
}

window.addEventListener("load", (event) => {
 renderMathInIdleSlices(document.body, mathOptions)

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


