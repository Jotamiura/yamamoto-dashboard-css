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

  // 重機表示モード: 'exclude' (除外、デフォルト) / 'include' (含む) / 'only' (重機のみ)
  var HEAVY_MODE_KEY = 'yk-heavy-mode-yamamoto';
  function getHeavyMode() {
    var v = localStorage.getItem(HEAVY_MODE_KEY);
    if (v === 'exclude' || v === 'include' || v === 'only') return v;
    // 新キー未設定の時のみ旧キーをフォールバック確認
    var legacy = localStorage.getItem('yk-exclude-empty-yamamoto');
    if (legacy === '0') return 'include';
    return 'exclude';
  }
  function setHeavyMode(mode) {
    localStorage.setItem(HEAVY_MODE_KEY, mode);
  }

  // アラートフィルタ: '' / 'shaken' / 'hoken'
  var ALERT_FILTER_KEY = 'yk-alert-filter-yamamoto';
  function getAlertFilter() {
    return localStorage.getItem(ALERT_FILTER_KEY) || '';
  }
  function setAlertFilter(v) {
    if (v) localStorage.setItem(ALERT_FILTER_KEY, v);
    else localStorage.removeItem(ALERT_FILTER_KEY);
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
    var stats = { total: 0, shaken: 0, hoken: 0, lease: 0 };
    var SHAKEN_THRESHOLD = 60;
    var HOKEN_THRESHOLD = 45;
    var LEASE_THRESHOLD = 90;
    var heavyMode = getHeavyMode();
    var alertFilter = getAlertFilter();

    rows.forEach(function (row) {
      var cells = row.querySelectorAll('td');
      // 重機判定：登録番号が空
      var regText = (regIdx >= 0 && cells[regIdx]) ? cells[regIdx].textContent.trim() : '';
      var isHeavyEquipment = regText === '';

      // 重機表示モード適用
      if (heavyMode === 'exclude' && isHeavyEquipment) {
        row.style.display = 'none';
        return;
      }
      if (heavyMode === 'only' && !isHeavyEquipment) {
        row.style.display = 'none';
        return;
      }

      // 行ごとのアラート判定（カード集計用：alertFilterに依存しない）
      var rowShakenAlert = false;
      var rowHokenAlert = false;
      var rowLeaseAlert = false;
      pairs.forEach(function (p) {
        var dateCell = cells[p.dateIdx];
        if (!dateCell) return;
        var d = diffDays(readOriginalDate(dateCell));
        if (d == null) return;
        if (/車検/.test(p.label) && d <= SHAKEN_THRESHOLD) rowShakenAlert = true;
        if (/リース/.test(p.label) && d <= LEASE_THRESHOLD) rowLeaseAlert = true;
        else if (/保険|満期/.test(p.label) && d <= HOKEN_THRESHOLD) rowHokenAlert = true;
      });

      // 集計はアラートフィルタに関係なく加算（カードは絶対値を表示）
      stats.total++;
      if (rowShakenAlert) stats.shaken++;
      if (rowHokenAlert) stats.hoken++;
      if (rowLeaseAlert) stats.lease++;

      // アラートフィルタ適用（表示制御のみ）
      if (alertFilter === 'shaken' && !rowShakenAlert) {
        row.style.display = 'none';
        return;
      }
      if (alertFilter === 'hoken' && !rowHokenAlert) {
        row.style.display = 'none';
        return;
      }
      if (alertFilter === 'lease' && !rowLeaseAlert) {
        row.style.display = 'none';
        return;
      }

      row.style.display = '';
    });

    return stats;
  }

  // 集計カードをテーブル直前に注入
  function renderSummaryCards(stats) {
    if (!stats) return;
    var existing = document.getElementById('yk-summary-wrap');
    if (existing) existing.remove();

    var heavyMode = getHeavyMode();
    var activeFilter = getAlertFilter();
    var shakenActive = activeFilter === 'shaken' ? ' yk-card-active' : '';
    var hokenActive = activeFilter === 'hoken' ? ' yk-card-active' : '';
    var leaseActive = activeFilter === 'lease' ? ' yk-card-active' : '';
    var totalActive = activeFilter === '' ? ' yk-card-active' : '';
    var alertLabelMap = {
      shaken: '車検アラートのみ表示中',
      hoken: '保険アラートのみ表示中',
      lease: 'リースアラートのみ表示中'
    };
    var wrap = document.createElement('div');
    wrap.id = 'yk-summary-wrap';
    wrap.setAttribute(PATCHED_ATTR, '1');
    wrap.innerHTML =
      '<div id="yk-summary-cards">' +
        '<div class="yk-card yk-card-total yk-card-clickable' + totalActive + '" data-yk-filter="">' +
          '<div class="yk-card-icon">🚗</div>' +
          '<div class="yk-card-body">' +
            '<div class="yk-card-label">管理車両数</div>' +
            '<div class="yk-card-value">' + stats.total + ' <span class="yk-card-unit">台</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="yk-card yk-card-shaken yk-card-clickable' + shakenActive + '" data-yk-filter="shaken">' +
          '<div class="yk-card-icon">⚠️</div>' +
          '<div class="yk-card-body">' +
            '<div class="yk-card-label">車検アラート（60日以内）</div>' +
            '<div class="yk-card-value">' + stats.shaken + ' <span class="yk-card-unit">件</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="yk-card yk-card-hoken yk-card-clickable' + hokenActive + '" data-yk-filter="hoken">' +
          '<div class="yk-card-icon">📅</div>' +
          '<div class="yk-card-body">' +
            '<div class="yk-card-label">保険アラート（45日以内）</div>' +
            '<div class="yk-card-value">' + stats.hoken + ' <span class="yk-card-unit">件</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="yk-card yk-card-lease yk-card-clickable' + leaseActive + '" data-yk-filter="lease">' +
          '<div class="yk-card-icon">📋</div>' +
          '<div class="yk-card-body">' +
            '<div class="yk-card-label">リースアラート（90日以内）</div>' +
            '<div class="yk-card-value">' + stats.lease + ' <span class="yk-card-unit">件</span></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div id="yk-filter-bar">' +
        '<div class="yk-heavy-toggle">' +
          '<a href="javascript:void(0)" class="yk-heavy-btn' + (heavyMode === 'exclude' ? ' yk-heavy-active' : '') + '" data-yk-heavy="exclude" onclick="window.ykSetHeavy(this,\'exclude\');return false;">重機を除外</a>' +
          '<a href="javascript:void(0)" class="yk-heavy-btn' + (heavyMode === 'include' ? ' yk-heavy-active' : '') + '" data-yk-heavy="include" onclick="window.ykSetHeavy(this,\'include\');return false;">重機を含む</a>' +
          '<a href="javascript:void(0)" class="yk-heavy-btn' + (heavyMode === 'only' ? ' yk-heavy-active' : '') + '" data-yk-heavy="only" onclick="window.ykSetHeavy(this,\'only\');return false;">重機のみ</a>' +
        '</div>' +
        (activeFilter ? '<span class="yk-filter-status">🔍 ' + (alertLabelMap[activeFilter] || '') + '（カードをもう一度クリックで解除）</span>' : '') +
        '<button type="button" class="yk-action-btn yk-action-csv" id="yk-btn-csv">📥 CSVダウンロード</button>' +
        '<button type="button" class="yk-action-btn yk-action-print" id="yk-btn-print">🖨️ 印刷</button>' +
      '</div>';

    var table = document.querySelector('table');
    if (table && table.parentElement) {
      table.parentElement.insertBefore(wrap, table);
    }

    // 重機モードボタンは下記の document delegation で処理する

    // 印刷ボタン
    var btnPrint = document.getElementById('yk-btn-print');
    if (btnPrint) {
      btnPrint.addEventListener('click', function () {
        // 印刷用ヘッダを差し込み（既存があれば置き換え）
        var existingHeader = document.getElementById('yk-print-header');
        if (existingHeader) existingHeader.remove();
        var header = document.createElement('div');
        header.id = 'yk-print-header';
        var now = new Date();
        var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
        header.textContent = '山本清掃様 車両管理ダッシュボード（' +
          now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日 印刷）';
        var table = document.querySelector('table');
        if (table && table.parentElement) {
          table.parentElement.insertBefore(header, table);
        }
        window.print();
      });
    }

    // CSVダウンロードボタン
    var btnCsv = document.getElementById('yk-btn-csv');
    if (btnCsv) {
      btnCsv.addEventListener('click', function () {
        downloadVisibleRowsAsCsv();
      });
    }

    // カードクリック → アラートフィルタ切替
    var clickableCards = wrap.querySelectorAll('.yk-card-clickable');
    clickableCards.forEach(function (card) {
      card.addEventListener('click', function () {
        var filter = card.getAttribute('data-yk-filter') || '';
        var current = getAlertFilter();
        // 同じカードを再クリックで解除（管理車両数カードは常に解除）
        if (filter === '' || filter === current) {
          setAlertFilter('');
        } else {
          setAlertFilter(filter);
        }
        var newStats = patchListView();
        renderSummaryCards(newStats);
      });
    });
  }

  // 詳細ビュー: セクションヘッダー (h3) を起点にタブUIへ再構成
  function patchDetailTabs() {
    var fields = Array.from(document.querySelectorAll('.kv-detail-field'));
    if (!fields.length) return;

    // 既にタブ化済み: 削除して再注入（kViewer再描画でDOM位置がずれる対策）
    var existing = document.getElementById('yk-detail-tabs');
    if (existing) existing.remove();

    // セクション分割: h3 があるフィールドを境界とする
    var sections = []; // [{title, color, fields:[]}]
    var current = null;
    fields.forEach(function (f) {
      var h3 = f.querySelector('h3');
      if (h3) {
        var title = (h3.textContent || '').trim();
        // border-left の色を推定
        var color = '#1976d2';
        var style = h3.getAttribute('style') || '';
        var m = style.match(/border-left:\s*\d+px\s+solid\s+([^;]+)/);
        if (m) color = m[1].trim();
        current = { title: title, color: color, fields: [f] };
        sections.push(current);
      } else if (current) {
        current.fields.push(f);
      }
    });

    if (sections.length < 2) return;

    // タブバー生成。kViewerが再描画でDOM位置を動かす可能性があるため、
    // 安定したコンテナ (kv-detail-page or main) のすぐ下に固定挿入する
    var stableContainer = document.querySelector('.kv-detail-page')
                       || document.querySelector('main')
                       || document.body;
    var tabs = document.createElement('div');
    tabs.id = 'yk-detail-tabs';
    tabs.setAttribute(PATCHED_ATTR, '1');
    var tabHtml = '<div class="yk-tab-bar">';
    sections.forEach(function (s, i) {
      tabHtml += '<button type="button" class="yk-tab-btn' + (i === 0 ? ' yk-tab-active' : '') + '" data-yk-tab="' + i + '" style="border-bottom-color:' + s.color + '" onclick="window.ykSetTab && window.ykSetTab(this,' + i + ')">' + s.title + '</button>';
    });
    tabHtml += '</div>';
    tabs.innerHTML = tabHtml;
    // stableContainer の最初の子として挿入 (= 最上部)
    stableContainer.insertBefore(tabs, stableContainer.firstChild);

    // 各セクションに data 属性を付与し、初期は1つ目のみ表示
    sections.forEach(function (s, i) {
      s.fields.forEach(function (f) {
        f.setAttribute('data-yk-section', String(i));
        if (i !== 0) f.style.display = 'none';
      });
    });

    // タブクリックは グローバル delegation で処理
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

  // 表示中の一覧テーブルをCSV化してダウンロード
  function downloadVisibleRowsAsCsv() {
    var table = document.querySelector('table');
    if (!table) return;

    var headerCells = Array.from(table.querySelectorAll('thead th'));
    // 「詳細」列など空ヘッダはスキップ
    var keepIdx = [];
    var headers = [];
    headerCells.forEach(function (th, i) {
      var t = (th.textContent || '').trim();
      if (!t) return;
      keepIdx.push(i);
      headers.push(t);
    });

    var lines = [headers.map(csvEscape).join(',')];
    var rows = Array.from(table.querySelectorAll('tbody tr'));
    rows.forEach(function (row) {
      // display:none の行はスキップ（フィルタ適用後の行のみ出力）
      if (row.style.display === 'none') return;
      var cells = row.querySelectorAll('td');
      var cols = keepIdx.map(function (i) {
        var cell = cells[i];
        if (!cell) return '';
        return (cell.textContent || '').trim().replace(/\s+/g, ' ');
      });
      lines.push(cols.map(csvEscape).join(','));
    });

    // BOM 付き UTF-8（Excelで文字化け防止）
    var csv = '\ufeff' + lines.join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var stamp = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    var fname = '車両管理_' +
      stamp.getFullYear() + pad(stamp.getMonth() + 1) + pad(stamp.getDate()) +
      '_' + pad(stamp.getHours()) + pad(stamp.getMinutes()) + '.csv';
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function csvEscape(s) {
    var t = String(s == null ? '' : s);
    if (/[",\r\n]/.test(t)) {
      return '"' + t.replace(/"/g, '""') + '"';
    }
    return t;
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

  // ラベルからお金フィールドかどうか判定
  function isMoneyLabel(labelText) {
    if (!labelText) return false;
    return /料|金額|総額|単価|円|¥|費用|残価|取得|簿価|相場|リース料/.test(labelText);
  }

  // 数値を XX,XXX 円 形式に整形（お金フィールド用）
  function formatMoneyValue(text) {
    var raw = String(text || '').trim();
    if (!raw) return null;
    // 既に通貨表記が付いているならスキップ
    if (/^[¥￥]/.test(raw) || /円$/.test(raw)) return null;
    var m = raw.match(/^(\d+)$/);
    if (!m) return null;
    return addCommas(m[1]) + ' 円';
  }

  // 詳細ビュー: 同じフィールドのラベル要素を取得
  function getFieldLabel(valueEl) {
    var field = valueEl.closest ? valueEl.closest('.kv-detail-field') : null;
    if (!field) return '';
    var labelEl = field.querySelector('.kv-detail-field-label');
    return labelEl ? (labelEl.textContent || '').trim() : '';
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
      if (!raw) {
        // 空欄は「—」プレースホルダで見やすく
        el.setAttribute(FORMATTED_ATTR, '1');
        el.textContent = '—';
        el.classList.add('yk-empty');
        return;
      }

      var asDate = formatDate(raw);
      if (asDate) {
        el.setAttribute(ORIG_DATE_ATTR, raw);
        el.setAttribute(FORMATTED_ATTR, '1');
        el.textContent = asDate;
        return;
      }

      // ラベルでお金フィールド判定
      var label = getFieldLabel(el);
      if (isMoneyLabel(label)) {
        var asMoney = formatMoneyValue(raw);
        if (asMoney) {
          el.setAttribute(FORMATTED_ATTR, '1');
          el.textContent = asMoney;
          el.classList.add('yk-money');
          return;
        }
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

  // ============ グローバル委譲ハンドラ（一度だけ登録、wrap再生成で失われない） ============
  // window.ykSetHeavy: inline onclick から呼ばれるグローバル関数（最も確実な発火経路）
  window.ykSetHeavy = function (btn, mode) {
    setHeavyMode(mode);
    var newStats = patchListView();
    renderSummaryCards(newStats);
  };
  // window.ykSetTab: inline onclick タブ用
  window.ykSetTab = function (btn, idx) {
    var tabsBar = btn && btn.closest('#yk-detail-tabs');
    if (tabsBar) {
      tabsBar.querySelectorAll('.yk-tab-btn').forEach(function (b) {
        b.classList.toggle('yk-tab-active', b === btn);
      });
    }
    var firstField = null;
    document.querySelectorAll('.kv-detail-field[data-yk-section]').forEach(function (f) {
      var visible = f.getAttribute('data-yk-section') === String(idx);
      f.style.display = visible ? '' : 'none';
      if (visible && !firstField) firstField = f;
    });
    // 最初のフィールドにスクロール（タブバー高さ分オフセット）
    if (firstField) {
      setTimeout(function () {
        var rect = firstField.getBoundingClientRect();
        var scrollTop = window.pageYOffset + rect.top - 160;
        window.scrollTo({ top: scrollTop, behavior: 'smooth' });
      }, 50);
    }
  };

  var globalDelegationInstalled = false;
  function installGlobalDelegation() {
    if (globalDelegationInstalled) return;
    globalDelegationInstalled = true;
    document.addEventListener('click', function (e) {
      // 重機ボタン
      var heavy = e.target.closest && e.target.closest('.yk-heavy-btn');
      if (heavy) {
        e.preventDefault();
        var mode = heavy.getAttribute('data-yk-heavy');
        setHeavyMode(mode);
        var newStats = patchListView();
        renderSummaryCards(newStats);
        return;
      }
      // タブボタン
      var tab = e.target.closest && e.target.closest('.yk-tab-btn');
      if (tab) {
        e.preventDefault();
        var idx = tab.getAttribute('data-yk-tab');
        var tabsBar = tab.closest('#yk-detail-tabs');
        if (tabsBar) {
          tabsBar.querySelectorAll('.yk-tab-btn').forEach(function (b) {
            b.classList.toggle('yk-tab-active', b === tab);
          });
        }
        document.querySelectorAll('.kv-detail-field[data-yk-section]').forEach(function (f) {
          f.style.display = f.getAttribute('data-yk-section') === idx ? '' : 'none';
        });
        return;
      }
    }, true); // capture phase で先に拾う
  }

  var running = false;
  function run() {
    if (running) return;
    running = true;
    try {
      installGlobalDelegation();
      var stats = patchListView();
      renderSummaryCards(stats);
      patchDetailTabs();
      patchDetailView();
      patchFormatting();
    } catch (e) {
      console.error('[yamamoto-dashboard.js]', e);
    } finally {
      setTimeout(function () { running = false; }, 50);
    }
  }

  // React (kViewer) の hydration 完了を待ってから run する。
  // 早すぎる DOM 変更は React error #418 を引き起こす。
  function waitForKviewerReady(callback) {
    var attempts = 0;
    var maxAttempts = 50; // 最大10秒待つ
    var check = function () {
      attempts++;
      // 一覧 or 詳細のいずれかのコンテンツが現れたら準備完了
      var hasList = !!document.querySelector('table tbody tr td');
      var hasDetail = !!document.querySelector('.kv-detail-field-value');
      if (hasList || hasDetail) {
        // hydration 完了から少し余裕を持って実行
        setTimeout(callback, 600);
        return;
      }
      if (attempts >= maxAttempts) {
        callback();
        return;
      }
      setTimeout(check, 200);
    };
    check();
  }

  var observerStarted = false;
  function startObserver() {
    if (observerStarted) return;
    observerStarted = true;
    var debounce;
    var observer = new MutationObserver(function (mutations) {
      var meaningful = mutations.some(function (m) {
        return Array.from(m.addedNodes).some(function (n) {
          return n.nodeType === 1 && !n.hasAttribute(PATCHED_ATTR);
        });
      });
      if (!meaningful) return;
      clearTimeout(debounce);
      debounce = setTimeout(run, 400);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function bootstrap() {
    waitForKviewerReady(function () {
      run();
      startObserver();
    });
  }

  if (document.readyState === 'complete') {
    bootstrap();
  } else {
    window.addEventListener('load', bootstrap);
  }
})();
