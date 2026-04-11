/* 山本清掃様 車両管理ダッシュボード
   残日数の再計算（kintone側のCALCフィールドが壊れているため、ブラウザ側で日付から計算し直す） */
(function () {
  'use strict';

  var PATCHED_ATTR = 'data-yk-patched';

  function diffDays(dateStr) {
    var m = String(dateStr).match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return null;
    var t = new Date(+m[1], +m[2] - 1, +m[3]);
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((t - today) / 86400000);
  }

  function labelFor(days) {
    if (days == null) return '';
    if (days > 0) return days + '日後';
    if (days < 0) return Math.abs(days) + '日経過';
    return '本日';
  }

  function styleFor(el, days) {
    if (days == null) {
      el.style.color = '#999';
      el.style.fontWeight = 'normal';
      el.style.background = '';
      return;
    }
    el.style.fontWeight = 'bold';
    el.style.padding = '2px 8px';
    el.style.borderRadius = '4px';
    el.style.display = 'inline-block';
    if (days < 0) {
      el.style.color = '#fff';
      el.style.background = '#d32f2f';
    } else if (days <= 30) {
      el.style.color = '#fff';
      el.style.background = '#f57c00';
    } else if (days <= 60) {
      el.style.color = '#e65100';
      el.style.background = '#fff3e0';
    } else if (days <= 90) {
      el.style.color = '#f57f17';
      el.style.background = '#fffde7';
    } else {
      el.style.color = '#2e7d32';
      el.style.background = '#e8f5e9';
    }
  }

  function findDateInRow(row, excludeCell) {
    var cells = row.querySelectorAll('td, .field, [class*="field"]');
    for (var i = 0; i < cells.length; i++) {
      if (cells[i] === excludeCell) continue;
      var t = cells[i].textContent.trim();
      var m = t.match(/^\d{4}-\d{1,2}-\d{1,2}$/);
      if (m) return t;
    }
    return null;
  }

  // 一覧ビュー: thead から「○○まで」列を見つけて、対応する日付列から再計算
  function patchListView() {
    var table = document.querySelector('table');
    if (!table) return;
    var ths = Array.from(table.querySelectorAll('thead th'));
    if (!ths.length) return;
    var headers = ths.map(function (th) { return th.textContent.trim(); });
    var pairs = []; // [{dateIdx, daysIdx}]
    headers.forEach(function (h, i) {
      if (!/まで$/.test(h)) return;
      var base = h.replace(/まで$/, '');
      var dateIdx = headers.findIndex(function (h2) {
        return h2 === base || h2 === base + '日' || h2 === base + '満期' || h2 === base.replace(/満了$/, '満了日');
      });
      if (dateIdx < 0) {
        // Fallback: use the column immediately to the left
        dateIdx = i - 1;
      }
      pairs.push({ dateIdx: dateIdx, daysIdx: i });
    });

    table.querySelectorAll('tbody tr').forEach(function (row) {
      var cells = row.querySelectorAll('td');
      pairs.forEach(function (p) {
        var target = cells[p.daysIdx];
        var dateCell = cells[p.dateIdx];
        if (!target || !dateCell) return;
        var dateText = dateCell.textContent.trim();
        var d = diffDays(dateText);
        target.setAttribute(PATCHED_ATTR, '1');
        target.textContent = labelFor(d);
        styleFor(target, d);
      });
    });
  }

  // 詳細ビュー: 「残日数」「○○まで」というラベルを持つフィールドの値を、同じセクションの日付フィールドから再計算
  function patchDetailView() {
    // ラベル要素を探す（kViewer は様々なクラス名で囲っている可能性あり）
    var allLabels = document.querySelectorAll('label, .label, [class*="label"], [class*="Label"]');
    allLabels.forEach(function (lab) {
      var txt = (lab.textContent || '').trim();
      if (txt !== '残日数' && !/まで$/.test(txt)) return;

      // ラベルから値要素を取得（次の兄弟 or 親の中の値要素）
      var valEl = null;
      var sib = lab.nextElementSibling;
      if (sib) valEl = sib;
      if (!valEl) {
        var parent = lab.parentElement;
        if (parent) {
          var cands = parent.querySelectorAll('div, span, p');
          for (var i = 0; i < cands.length; i++) {
            if (cands[i] !== lab && /日前|日後|日超過|日経過/.test(cands[i].textContent)) {
              valEl = cands[i];
              break;
            }
          }
        }
      }
      if (!valEl) return;

      // 同じセクションから日付を探す
      var section = lab.closest('.row, .group, .section, [class*="row"], [class*="Row"], [class*="group"], [class*="Group"]')
                  || lab.parentElement.parentElement
                  || lab.parentElement;
      if (!section) return;
      var dateText = null;
      var nodes = section.querySelectorAll('*');
      for (var j = 0; j < nodes.length; j++) {
        var t = (nodes[j].textContent || '').trim();
        if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(t)) { dateText = t; break; }
      }
      if (!dateText) {
        // section の親まで広げて再検索
        var up = section.parentElement;
        if (up) {
          var nodes2 = up.querySelectorAll('*');
          for (var k = 0; k < nodes2.length; k++) {
            var tt = (nodes2[k].textContent || '').trim();
            if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(tt)) { dateText = tt; break; }
          }
        }
      }

      var d = diffDays(dateText);
      valEl.setAttribute(PATCHED_ATTR, '1');
      valEl.textContent = labelFor(d);
      styleFor(valEl, d);
    });
  }

  var running = false;
  function run() {
    if (running) return;
    running = true;
    try {
      patchListView();
      patchDetailView();
    } catch (e) {
      console.error('[yamamoto-dashboard.js]', e);
    } finally {
      setTimeout(function () { running = false; }, 50);
    }
  }

  // 初回 + 遅延 + DOM変化監視
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
  setTimeout(run, 500);
  setTimeout(run, 1500);
  setTimeout(run, 3000);

  var debounce;
  var observer = new MutationObserver(function (mutations) {
    // 自分の patch によるテキスト書き換えは無視
    var meaningful = mutations.some(function (m) {
      return Array.from(m.addedNodes).some(function (n) {
        return n.nodeType === 1 && !n.hasAttribute(PATCHED_ATTR);
      });
    });
    if (!meaningful) return;
    clearTimeout(debounce);
    debounce = setTimeout(run, 250);
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
