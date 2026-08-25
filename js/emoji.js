/**
 * emoji.js — Emojis Android (Noto Color) figés en PNG.
 * Même rendu PC / Android / navigateur ; plus de glyphe système variable.
 *
 * Usage :
 *   em('💾')           → <img …>
 *   emStr('✓ Sauvé')   → HTML avec images
 *   oseHydrateEmojis(el)  remplace les emojis dans les nœuds texte
 */
(function (global) {
  const BASE = (() => {
    try {
      if (document.currentScript && document.currentScript.src)
        return new URL('../assets/emoji/', document.currentScript.src).href;
    } catch (_) { /* ignore */ }
    return 'assets/emoji/';
  })();

  // Caractère (avec ou sans VS16) → fichier uXXXX.png
  const MAP = {
    '💾': 'u1f4be',
    '⚡': 'u26a1',
    '🔋': 'u1f50b',
    '📂': 'u1f4c2',
    '📁': 'u1f4c1',
    '📥': 'u1f4e5',
    '📤': 'u1f4e4',
    '✏': 'u270f',
    '✏️': 'u270f',
    '🕐': 'u1f550',
    '📋': 'u1f4cb',
    '🏠': 'u1f3e0',
    '☀': 'u2600',
    '☀️': 'u2600',
    '📄': 'u1f4c4',
    '☎': 'u260e',
    '✉': 'u2709',
    '★': 'u2b50',
    '⭐': 'u2b50',
    '💶': 'u1f4b6',
    '⬆': 'u2b06',
    '⬇': 'u2b07',
    '↓': 'u2b07',
    '⏱': 'u23f1',
    '⏳': 'u23f3',
    '🔲': 'u1f532',
    '🏢': 'u1f3e2',
    '👤': 'u1f464',
    '📍': 'u1f4cd',
    '🖨': 'u1f5a8',
    '🖨️': 'u1f5a8',
    '👁': 'u1f441',
    '👁️': 'u1f441',
    '⚠': 'u26a0',
    '⚠️': 'u26a0',
    '↻': 'u1f504',
    '🔄': 'u1f504',
    '✓': 'u2705',
    '✔': 'u2705',
    '✅': 'u2705',
    '✗': 'u274c',
    '✘': 'u274c',
    '✕': 'u274c',
    '❌': 'u274c',
    '＋': 'u2795',
    '➕': 'u2795',
    '↗': 'u2197',
    '🌤': 'u1f324',
    '🌤️': 'u1f324',
    '🐛': 'u1f41b',
    '💬': 'u1f4ac',
    '🔧': 'u1f527',
    '💡': 'u1f4a1',
  };

  const KEYS = Object.keys(MAP).sort((a, b) => b.length - a.length);
  const RE = new RegExp(
    KEYS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
    'g'
  );

  function fileFor(ch) {
    if (MAP[ch]) return MAP[ch];
    const stripped = ch.replace(/\uFE0F/g, '');
    return MAP[stripped] || null;
  }

  function em(ch, cls) {
    const id = fileFor(ch);
    if (!id) return ch;
    const c = cls ? ' ' + cls : '';
    return `<img class="ose-em${c}" src="${BASE}${id}.png" width="16" height="16" alt="" draggable="false">`;
  }

  function emStr(s) {
    if (s == null) return '';
    return String(s).replace(RE, m => em(m));
  }

  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'CODE', 'PRE']);

  function hydrateTextNode(node) {
    const t = node.nodeValue;
    if (!t || !RE.test(t)) { RE.lastIndex = 0; return; }
    RE.lastIndex = 0;
    if (!node.parentNode) return;
    const wrap = document.createElement('span');
    wrap.className = 'ose-em-wrap';
    wrap.innerHTML = emStr(t);
    node.parentNode.replaceChild(wrap, node);
  }

  function oseHydrateEmojis(root) {
    if (!root || !root.querySelectorAll && root.nodeType !== 1 && root.nodeType !== 9) {
      if (root && root.nodeType === 3) hydrateTextNode(root);
      return;
    }
    const el = root.nodeType === 9 ? root.body : root;
    if (!el) return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p || SKIP.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        if (p.closest && p.closest('script,style,textarea,code,pre,select'))
          return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(hydrateTextNode);
  }

  function startObserver() {
    if (!document.body || global.__oseEmojiObs) return;
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === 'characterData' && m.target && m.target.nodeType === 3) {
          hydrateTextNode(m.target);
          continue;
        }
        m.addedNodes.forEach(n => {
          if (n.nodeType === 3) hydrateTextNode(n);
          else if (n.nodeType === 1) oseHydrateEmojis(n);
        });
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    global.__oseEmojiObs = obs;
  }

  global.em = em;
  global.emStr = emStr;
  global.oseHydrateEmojis = oseHydrateEmojis;
  global.OSE_EMOJI_MAP = MAP;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      oseHydrateEmojis(document);
      startObserver();
    });
  } else {
    oseHydrateEmojis(document);
    startObserver();
  }
})(typeof window !== 'undefined' ? window : globalThis);
