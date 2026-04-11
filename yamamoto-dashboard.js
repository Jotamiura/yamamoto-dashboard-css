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
  // 同時に集計値（管理車両数 / 車検アラート / 保険アラート）も計算する
  function patchListView() {
    var table = document.querySelector('table');
    if (!table) return null;
    var ths = Array.from(table.querySelectorAll('thead th'));
    if (!ths.length) return null;
    var headers = ths.map(function (th) { return th.textContent.trim(); });
    var pairs = []; // [{dateIdx, daysIdx, label}]
    headers.forEach(function (h, i) {
      if (!/まで$/.test(h)) return;
      var base = h.replace(/まで$/, '');
      var dateIdx = headers.findIndex(function (h2) {
        return h2 === base || h2 === base + '日' || h2 === base + '満期' || h2 === base.replace(/満了$/, '満了日');
      });
      if (dateIdx < 0) dateIdx = i - 1;
      pairs.push({ dateIdx: dateIdx, daysIdx: i, label: base });
    });

    var stats = { total: 0, shaken: 0, hoken: 0 };
    var SHAKEN_THRESHOLD = 60;
    var HOKEN_THRESHOLD = 45;

    var rows = table.querySelectorAll('tbody tr');
    rows.forEach(function (row) {
      stats.total++;
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
        // アラート集計
        if (d != null) {
          if (/車検/.test(p.label) && d <= SHAKEN_THRESHOLD) stats.shaken++;
          if (/保険|満期/.test(p.label) && d <= HOKEN_THRESHOLD) stats.hoken++;
        }
      });
    });

    return stats;
  }

  // 集計カードをタイトル直下に注入
  function renderSummaryCards(stats) {
    if (!stats) return;
    var existing = document.getElementById('yk-summary-cards');
    if (existing) existing.remove();

    var card = document.createElement('div');
    card.id = 'yk-summary-cards';
    card.setAttribute(PATCHED_ATTR, '1');
    card.innerHTML =
      '<div class="yk-card yk-card-total">' +
        '<div class="yk-card-icon">🚗</div>' +
        '<div class="yk-card-body">' +
          '<div class="yk-card-label">管理車両数</div>' +
          '<div class="yk-card-value">' + stats.total + ' <span class="yk-card-unit">台</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="yk-card yk-card-shaken">' +
        '<div class="yk-card-icon">⚠️</div>' +
        '<div class="yk-card-body">' +
          '<div class="yk-card-label">車検アラート（60日以内）</div>' +
          '<div class="yk-card-value">' + stats.shaken + ' <span class="yk-card-unit">件</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="yk-card yk-card-hoken">' +
        '<div class="yk-card-icon">📅</div>' +
        '<div class="yk-card-body">' +
          '<div class="yk-card-label">保険アラート（45日以内）</div>' +
          '<div class="yk-card-value">' + stats.hoken + ' <span class="yk-card-unit">件</span></div>' +
        '</div>' +
      '</div>';

    // タイトル直下 or テーブル直前に挿入
    var table = document.querySelector('table');
    if (table && table.parentElement) {
      table.parentElement.insertBefore(card, table);
    }
  }

  // 詳細ビュー: kv-detail-field-label が「残日数」のフィールドを探し、
  // 同じ grid-cols-12 セクションにある日付フィールドから再計算
  function patchDetailView() {
    var fields = document.querySelectorAll('.kv-detail-field');
    if (!fields.length) return;
    fields.forEach(function (field) {
      var label = field.querySelector('.kv-detail-field-label');
      var value = field.querySelector('.kv-detail-field-value');
      if (!label || !value) return;
      var labelText = (label.textContent || '').trim();
      if (labelText !== '残日数' && !/まで$/.test(labelText)) return;

      // 残日数フィールドの直前のフィールドから日付を取る
      // ただしセクション境界（HR, h1〜h3 を含むラベル）を超えたら中断する
      var dateText = null;
      var prev = field.previousElementSibling;
      var hops = 0;
      while (prev && hops < 6) {
        hops++;
        // セクション境界判定: HR or 見出し
        if (prev.querySelector && (prev.querySelector('hr') || prev.querySelector('h1, h2, h3, h4'))) {
          break;
        }
        var pv = prev.querySelector ? prev.querySelector('.kv-detail-field-value') : null;
        if (pv) {
          var t = (pv.textContent || '').trim();
          if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(t)) { dateText = t; break; }
        }
        prev = prev.previousElementSibling;
      }

      var d = diffDays(dateText);
      value.setAttribute(PATCHED_ATTR, '1');
      value.textContent = labelFor(d);
      styleFor(value, d);
    });
  }

  var running = false;
  function run() {
    if (running) return;
    running = true;
    try {
      var stats = patchListView();
      renderSummaryCards(stats);
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
