// Shared script for the visual guide: theme toggle + Mermaid setup using the page's colour tokens.
/* global mermaid */
(function () {
  var KEY = 'sta-visual-theme';

  function savedTheme() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }

  var t = savedTheme();
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);

  function isDark() {
    var attr = document.documentElement.getAttribute('data-theme');
    if (attr) return attr === 'dark';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function token(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function renderDiagrams() {
    if (typeof mermaid === 'undefined') return;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      themeVariables: {
        darkMode: isDark(),
        background: token('--surface'),
        primaryColor: token('--node'),
        primaryTextColor: token('--text'),
        primaryBorderColor: token('--accent'),
        secondaryColor: token('--node-2'),
        tertiaryColor: token('--surface-2'),
        lineColor: token('--muted'),
        textColor: token('--text'),
        mainBkg: token('--node'),
        nodeBorder: token('--accent'),
        clusterBkg: token('--surface-2'),
        clusterBorder: token('--border'),
        titleColor: token('--text'),
        edgeLabelBackground: token('--surface'),
        actorBkg: token('--node'),
        actorBorder: token('--accent'),
        actorTextColor: token('--text'),
        signalColor: token('--text'),
        signalTextColor: token('--text'),
        labelBoxBkgColor: token('--surface-2'),
        labelTextColor: token('--text'),
        loopTextColor: token('--text'),
        noteBkgColor: token('--warn-soft'),
        noteTextColor: token('--text'),
        noteBorderColor: token('--warn'),
        activationBkgColor: token('--surface-2'),
        sequenceNumberColor: token('--surface'),
      },
      flowchart: { curve: 'basis', htmlLabels: true, padding: 12 },
      sequence: { mirrorActors: false, showSequenceNumbers: true },
    });

    var nodes = document.querySelectorAll('.mermaid');
    nodes.forEach(function (el) {
      // innerHTML (not textContent) keeps <br/> line breaks inside labels.
      if (!el.dataset.source) el.dataset.source = el.innerHTML;
      el.removeAttribute('data-processed');
      el.innerHTML = el.dataset.source;
    });
    mermaid.run({ nodes: nodes }).catch(function (err) {
      console.error(err);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.querySelector('.theme-btn');
    if (btn) {
      btn.addEventListener('click', function () {
        var next = isDark() ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        try {
          localStorage.setItem(KEY, next);
        } catch (e) {
          /* storage may be blocked; theme still changes for this page */
        }
        renderDiagrams();
      });
    }
    renderDiagrams();
  });
})();
