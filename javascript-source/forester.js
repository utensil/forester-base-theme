import 'ninja-keys';
import 'katex';

import autoRenderMath from 'katex/contrib/auto-render';

function partition(array, isValid) {
 return array.reduce(([pass, fail], elem) => {
  return isValid(elem) ? [[...pass, elem], fail] : [pass, [...fail, elem]];
 }, [[], []]);
}

// KaTeX's default output carries a second, invisible MathML copy of every
// formula for accessibility. Dropping it removes about a third of the DOM on
// math-heavy pages, and the formulas stay selectable and readable.
const mathOptions = { output: 'html' }

// Elements that directly contain a formula. auto-render already parses each
// text node on its own, so handing it these elements renders exactly the same
// formulas as rendering the whole document at once.
function mathHolders(root) {
 const holders = new Set()
 const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
 while (walker.nextNode()) {
  const node = walker.currentNode
  if (node.nodeValue && /\\[\[(]|\$\$/.test(node.nodeValue)) {
   holders.add(node.parentElement)
  }
 }
 return [...holders]
}

// Typesetting every formula inside the `load` handler blocks the main thread
// for seconds on a large forest (the fdip-0001 page: 11,979 formulas, ~8s), and
// the browser cannot paint or respond until it finishes. Render the same
// formulas in idle slices instead, so the page becomes usable immediately.
function renderMathInIdleSlices(root, options) {
 const schedule = window.requestIdleCallback
  ? fn => window.requestIdleCallback(fn, { timeout: 1000 })
  : fn => setTimeout(() => fn({ didTimeout: false, timeRemaining: () => 8 }), 16)

 const holders = mathHolders(root)
 let next = 0

 const step = deadline => {
  while (next < holders.length && (deadline.didTimeout || deadline.timeRemaining() > 4)) {
   try {
    autoRenderMath(holders[next], options)
   } catch (e) {
    console.error('KaTeX rendering failed', e)
   }
   next++
  }

  if (next < holders.length) {
   schedule(step)
  }
 }

 if (holders.length > 0) {
  schedule(step)
 }
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


