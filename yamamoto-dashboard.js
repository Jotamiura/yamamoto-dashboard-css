/* 山本清掃様 車両管理ダッシュボード
   残日数の再計算（kintone側のCALCフィールドが壊れているため、ブラウザ側で日付から計算し直す） */
(function () {
  'use strict';

  var PATCHED_ATTR = 'data-yk-patched';
  var ORIG_DATE_ATTR = 'data-yk-original-date';
  var FORMATTED_ATTR = 'data-yk-formatted';

  // 元の日付テキストを取得（data属性優先、なければtextContentから）
  function readOriginalDate(el) {
    if (!el) return '';
    var orig = el.getAttribute && el.getAttribute(ORIG_DATE_ATTR);
    if (orig) return orig;
    return (el.textContent || '').trim();
  }

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

  var STORAGE_KEY = 'yk-exclude-empty-yamamoto';
  function isExcludeEmpty() {
    var v = localStorage.getItem(STORAGE_KEY);
    return v === null ? true : v === '1';
  }
  function setExcludeEmpty(on) {
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  }

  // 一覧ビュー: 日付列から残日数を再計算（Pass1）し、フィルタ＋集計も行う（Pass2）
  function patchListView() {
    var table = document.querySelector('table');
    if (!table) return null;
    var ths = Array.from(table.querySelectorAll('thead th'));
    if (!ths.length) return null;
    var headers = ths.map(function (th) { return th.textContent.trim(); });

    // 列インデックス
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
    var regIdx = headers.findIndex(function (h) { return /登録番号/.test(h); });

    // Pass 1: 全行に対して残日数の再計算（フィルタ前）
    var rows = Array.from(table.querySelectorAll('tbody tr'));
    rows.forEach(function (row) {
      var cells = row.querySelectorAll('td');
      pairs.forEach(function (p) {
        var target = cells[p.daysIdx];
        var dateCell = cells[p.dateIdx];
        if (!target || !dateCell) return;
        var dateText = readOriginalDate(dateCell);
        var d = diffDays(dateText);
        target.setAttribute(PATCHED_ATTR, '1');
        target.textContent = labelFor(d);
        styleFor(target, d);
      });
    });

    // Pass 2: フィルタ適用 + 集計（表示行のみ対象）
    var stats = { total: 0, shaken: 0, hoken: 0 };
    var SHAKEN_THRESHOLD = 60;
    var HOKEN_THRESHOLD = 45;
    var exclude = isExcludeEmpty();

    rows.forEach(function (row) {
      var cells = row.querySelectorAll('td');
      // 重機判定：登録番号が空
      var regText = (regIdx >= 0 && cells[regIdx]) ? cells[regIdx].textContent.trim() : '';
      var isHeavyEquipment = regText === '';

      if (exclude && isHeavyEquipment) {
        row.style.display = 'none';
        return;
      }
      row.style.display = '';
      stats.total++;
      pairs.forEach(function (p) {
        var dateCell = cells[p.dateIdx];
        if (!dateCell) return;
        var d = diffDays(readOriginalDate(dateCell));
        if (d == null) return;
        if (/車検/.test(p.label) && d <= SHAKEN_THRESHOLD) stats.shaken++;
        if (/保険|満期/.test(p.label) && d <= HOKEN_THRESHOLD) stats.hoken++;
      });
    });

    return stats;
  }

  // 集計カードをテーブル直前に注入
  function renderSummaryCards(stats) {
    if (!stats) return;
    var existing = document.getElementById('yk-summary-wrap');
    if (existing) existing.remove();

    var checked = isExcludeEmpty() ? 'checked' : '';
    var wrap = document.createElement('div');
    wrap.id = 'yk-summary-wrap';
    wrap.setAttribute(PATCHED_ATTR, '1');
    wrap.innerHTML =
      '<div id="yk-summary-cards">' +
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
        '</div>' +
      '</div>' +
      '<div id="yk-filter-bar">' +
        '<label class="yk-filter-toggle">' +
          '<input type="checkbox" id="yk-exclude-empty" ' + checked + '> ' +
          '<span>重機（登録番号なし）を除外する</span>' +
        '</label>' +
      '</div>';

    var table = document.querySelector('table');
    if (table && table.parentElement) {
      table.parentElement.insertBefore(wrap, table);
    }

    // チェックボックスのイベント
    var cb = document.getElementById('yk-exclude-empty');
    if (cb) {
      cb.addEventListener('change', function () {
        setExcludeEmpty(cb.checked);
        // 再実行
        var newStats = patchListView();
        renderSummaryCards(newStats);
      });
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
          var t = readOriginalDate(pv);
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

  // 日付を YYYY年M月D日 形式に整形（list/detail両方）
  function formatDate(text) {
    var m = String(text).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return null;
    return m[1] + '年' + parseInt(m[2], 10) + '月' + parseInt(m[3], 10) + '日';
  }

  // 整数部にカンマを入れる
  function addCommas(numStr) {
    return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // 数値を「3桁区切り＋単位（任意）」形式に整形。元が4桁未満ならスキップ
  function formatNumberValue(text) {
    // パターン: 数字(の整数) 任意でスペースと単位（km, ¥, 円, %, 日, ヶ月 等）
    var m = text.match(/^(\d{4,})((?:\s*(?:km|¥|円|%|日|ヶ月|m|kg))?)\s*$/);
    if (!m) return null;
    return addCommas(m[1]) + m[2];
  }

  // 一覧テーブル＋詳細ビューの値セルを走査してフォーマット適用
  function patchFormatting() {
    // 詳細ビュー
    var detailValues = document.querySelectorAll('.kv-detail-field-value');
    detailValues.forEach(function (el) {
      if (el.getAttribute(FORMATTED_ATTR)) return;
      // 残日数等は他のpatcherが書き換えるので、PATCHED_ATTRが付いていたら触らない
      if (el.getAttribute(PATCHED_ATTR)) return;
      var raw = (el.textContent || '').trim();
      if (!raw) return;

      var asDate = formatDate(raw);
      if (asDate) {
        el.setAttribute(ORIG_DATE_ATTR, raw);
        el.setAttribute(FORMATTED_ATTR, '1');
        el.textContent = asDate;
        return;
      }

      var asNum = formatNumberValue(raw);
      if (asNum) {
        el.setAttribute(FORMATTED_ATTR, '1');
        el.textContent = asNum;
        return;
      }
    });

    // 一覧テーブルのセル
    var tableCells = document.querySelectorAll('table tbody td');
    tableCells.forEach(function (el) {
      if (el.getAttribute(FORMATTED_ATTR)) return;
      if (el.getAttribute(PATCHED_ATTR)) return;
      var raw = (el.textContent || '').trim();
      if (!raw) return;

      var asDate = formatDate(raw);
      if (asDate) {
        el.setAttribute(ORIG_DATE_ATTR, raw);
        el.setAttribute(FORMATTED_ATTR, '1');
        el.textContent = asDate;
        return;
      }

      var asNum = formatNumberValue(raw);
      if (asNum) {
        el.setAttribute(FORMATTED_ATTR, '1');
        el.textContent = asNum;
        return;
      }
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
      patchFormatting();
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
