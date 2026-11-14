/* W03 운영 시스템 — 화면/상태 연결 */
(function () {
  'use strict';
  var E = window.W03Engine;
  var LS = 'w03.state.v1';
  var MODEL = null;

  var UI = {
    intake: 'BATCH',        /* BATCH | NEWS */
    batchId: 'B-02-2602-01',
    lotScope: false,
    scenario: 'S1',
    prefill: null,
    reply: '',
    correctedQty: ''
  };
  var STATE = load();

  /* ---------- 저장 ---------- */
  function load() {
    try {
      var raw = localStorage.getItem(LS);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && s.v === 1) {
          s.batches = s.batches || {}; s.log = s.log || []; s.customClaims = s.customClaims || [];
          return s;
        }
      }
    } catch (err) { /* 저장소 접근 불가 → 메모리 상태로 동작 */ }
    return E.emptyState();
  }
  function save() {
    try { localStorage.setItem(LS, JSON.stringify(STATE)); } catch (err) {}
  }

  /* ---------- 유틸 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pct(r, d) { return r == null ? '—' : (r * 100).toFixed(d == null ? 2 : d) + '%'; }
  function n(v) { return E.fmtInt(v); }
  function now() {
    var d = new Date(), p = function (x) { return String(x).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ---------- 분석 ---------- */
  function analysis() { return E.analyzeBatch(MODEL, UI.batchId, STATE.customClaims); }
  function scoped() {
    var a = analysis();
    return UI.lotScope ? E.aggregateLotScope(MODEL, a) : a;
  }
  function bsOf(id) { return E.getBatchState(STATE, id); }

  /* ---------- 후보 ---------- */
  function candidates() {
    return MODEL.prod.map(function (p) {
      var cq = (MODEL.claimsByBatch[p.batch_id] || []).filter(function (c) { return E.isTrue(c.defect_confirmed); });
      var qty = cq.reduce(function (s, c) { return s + E.num(c.qty_affected); }, 0);
      return {
        id: p.batch_id, product_id: p.product_id, qc: p.qc_result,
        count: cq.length, qty: qty, produced: E.num(p.produced_qty),
        rate: E.num(p.produced_qty) ? qty / E.num(p.produced_qty) : 0,
        lot: p.input_lot_ids
      };
    }).filter(function (c) { return c.count > 0; })
      .sort(function (a, b) { return b.qty - a.qty; });
  }

  /* ---------- 화면 ---------- */
  function render() {
    var a = analysis();
    var html = '';
    html += scenBar();
    html += intakeSection(a);
    if (UI.intake === 'BATCH') {
      html += judgmentSection(a);
      html += approvalSection(a);
      html += followupSection();
    } else {
      html += newsSection();
      html += followupSection();
    }
    html += statusSection();
    document.getElementById('app').innerHTML = html;
    bindInputs();
  }

  function scenBar() {
    var hints = {
      S1: '<b>정상</b> — 확정 클레임이 기준을 넘은 배치가 접수된 경우입니다. 판단 → 품질위원회 회수 의결 → 영업·생산·물류 작업 생성 → 출하처 확인 회신으로 보류 작업 재개까지 이어서 확인하세요.',
      S2: '<b>조건 변경</b> — 같은 원료 로트(LOT-B-2602-P)를 쓴 다른 배치에 확정 클레임이 추가 접수되는 상황입니다. 아래 <b>클레임 접수</b>를 누르면 0% → 10%대로 판정이 뒤집히고, 의결·후속 작업이 새로 생성됩니다.',
      S3: '<b>정보 부족·거절</b> — 단일 매체 보도만으로는 판정할 수 없습니다. 확인 대상 배치를 열고, 매핑 미확인 상태에서 <b>의결 거절(원인 조사 전환)</b>을 눌러 재상신 조건이 남는지 확인하세요.'
    };
    var b = [['S1', '시나리오 1', '정상'], ['S2', '시나리오 2', '조건 변경'], ['S3', '시나리오 3', '정보 부족·거절']];
    return '<div class="scen">' + b.map(function (x) {
      return '<button data-act="scenario" data-id="' + x[0] + '" aria-pressed="' + (UI.scenario === x[0]) + '"><b>' + x[1] + '</b>' + x[2] + '</button>';
    }).join('') + '</div><div class="hint">' + hints[UI.scenario] + '</div>';
  }

  function intakeSection(a) {
    var cands = candidates().slice(0, 4);
    var rows = cands.map(function (c) {
      var on = UI.intake === 'BATCH' && UI.batchId === c.id;
      var tag = c.rate >= E.CFG.threshold
        ? '<span class="tag bad">기준 초과</span>' : '<span class="tag gray">기준 미달</span>';
      return '<button class="cand" data-act="pick-batch" data-id="' + c.id + '" aria-pressed="' + on + '">' +
        '<span style="flex:1"><span class="id">' + c.id + ' · ' + esc(productName(c.product_id)) + '</span>' +
        '<span class="meta">확정 ' + c.count + '건 · QC ' + esc(c.qc) + ' · 로트 ' + esc(c.lot) + '</span></span>' +
        '<span class="rate"><b>' + pct(c.rate) + '</b><span>' + tag + '</span></span></button>';
    }).join('');

    var newsOn = UI.intake === 'NEWS';
    var newsBtn = '<button class="cand news" data-act="pick-news" aria-pressed="' + newsOn + '">' +
      '<span style="flex:1"><span class="id">언론 보도 접수</span>' +
      '<span class="meta">ext_news_quality_incident.md · 단일 매체·미확정</span></span>' +
      '<span class="rate"><b style="font-size:13px">배치 미지목</b><span class="tag warn">근거 부족</span></span></button>';

    var allBatches = MODEL.prod.slice().sort(function (x, y) {
      return x.batch_id < y.batch_id ? 1 : -1;
    }).map(function (p) {
      return '<option value="' + p.batch_id + '"' + (p.batch_id === UI.batchId ? ' selected' : '') + '>' +
        p.batch_id + ' · ' + esc(productName(p.product_id)) + ' · ' + esc(p.qc_result) + '</option>';
    }).join('');

    var pf = UI.prefill || {};
    return section(1, '사건 접수', '처리할 일을 고르거나 새 클레임을 입력', '' +
      '<div class="cands">' + rows + newsBtn + '</div>' +
      '<details' + (UI.prefill ? ' open' : '') + '><summary>직접 입력 — 새 클레임 접수 (가정 입력)</summary>' +
      '<div class="row"><label class="field"><span>배치</span><select id="cc-batch">' + allBatches + '</select></label>' +
      '<label class="field"><span>확정 여부</span><select id="cc-conf"><option value="True">확정(규격이탈)</option><option value="False">보류(조사중)</option></select></label></div>' +
      '<div class="row"><label class="field"><span>영향 수량(EA)</span><input id="cc-qty" type="number" inputmode="numeric" value="' + (pf.qty || 15600) + '"></label>' +
      '<label class="field"><span>고객</span><input id="cc-cust" value="C-101"></label></div>' +
      '<button class="act primary" data-act="add-claim" style="margin-top:10px">클레임 접수 → 재판단</button>' +
      '<div class="note">입력한 행은 <span class="tag assume">가정</span>으로 표시되며 원본 CSV는 바뀌지 않습니다. 같은 배치를 다시 평가하면 접수한 클레임이 반영된 상태가 보입니다.</div>' +
      '</details>' +
      '<div class="note">원본 <code>qc_claims_cv.csv</code> ' + n(MODEL.claims.length) + '건 · <code>prod_batch_log_cv.csv</code> ' + n(MODEL.prod.length) + '배치를 직접 파싱했습니다. ' +
      (STATE.customClaims.length ? '추가 접수 ' + STATE.customClaims.length + '건 반영 중.' : '') + '</div>');
  }

  function productName(pid) {
    var p = MODEL.productById[pid];
    return p ? p.product_name : pid;
  }

  function newsSection() {
    var t = MODEL.texts.news || '';
    return section(2, 'AI 판단 — 근거 부족', '언론 보도는 회수 판단 근거가 아닙니다',
      '<div class="banner warn"><b>판정 불가 · 확인 필요.</b> 보도는 단일 매체의 미확정 표현이고 특정 제품·배치를 지목하지 않았습니다. <code>quality_policy_cv.md</code>는 “외부 언론 보도는 회수 판단의 근거가 아니며 규격 검사 결과를 우선한다”고 정합니다.</div>' +
      '<div class="h3">원본 보도에서 확인한 사실 <span class="tag orig">원본</span></div>' +
      '<div class="note">' + esc(t.replace(/^#.*$/m, '').replace(/\n+/g, ' ').slice(0, 420)).replace(/^- /g, '· ') + '</div>' +
      '<div class="h3">판단에 필요한 정보 (없는 것)</div>' +
      '<div class="tbl-wrap"><table><thead><tr><th>필요 정보</th><th>현재 상태</th><th>다음 처리</th></tr></thead><tbody>' +
      '<tr><td>지목된 배치·로트</td><td>없음</td><td>품질팀 확인 요청</td></tr>' +
      '<tr><td>규격 검사 확정 결과</td><td>미확인</td><td>확정 클레임 재집계</td></tr>' +
      '<tr><td>출하처·출하 건</td><td>SBL↔SH 미연결</td><td>물류팀 확인</td></tr>' +
      '</tbody></table></div>' +
      '<div class="btns"><button class="act primary" data-act="open-check-batch">확인 대상 배치 열기 — B-02-2603-01<small>로트 LOT-B-2602-P · QC 보류 · 확정 23건</small></button></div>' +
      '<div class="note">언론 보도로 전면 회수를 결정하지 않습니다. 확정 불량률이 기준을 넘는 <b>배치</b>만 회수 판단 대상입니다.</div>');
  }

  function judgmentSection(a) {
    var s = scoped();
    var over = s.eligible;
    var metricCls = over ? 'is-bad' : 'is-ok';
    var verdict = over
      ? '<span class="tag bad">회수 대상 (기준 충족)</span>'
      : (a.countConfirmed ? '<span class="tag gray">회수 대상 아님 (기준 미달)</span>' : '<span class="tag gray">확정 클레임 없음</span>');

    var barW = Math.min((a.rateProduced / (E.CFG.threshold * 2)) * 100, 100);
    var cap = s.capacity;

    var html = section(2, 'AI 판단 — 데이터 연결', '클레임·배치·출하·생산여력 대조', '' +
      '<div class="metric ' + metricCls + '">' +
        '<div><div class="big">' + pct(a.rateProduced) + '</div><div class="lbl">배치 확정 불량률 · 기준 ' + pct(E.CFG.threshold, 0) + '</div></div>' +
        '<div style="margin-left:auto">' + verdict + '</div>' +
        '<div style="flex-basis:100%"><div class="bar"><i style="width:' + barW + '%"></i><em></em></div>' +
        '<div class="bar-scale"><span>0%</span><span>기준 10%</span><span>20%</span></div></div>' +
      '</div>' +
      '<div class="kv">' +
        kv('배치 수량', n(a.producedQty) + ' EA') +
        kv('확정 수량', n(a.qtyConfirmed) + ' EA') +
        kv('확정 클레임', a.countConfirmed + '건') +
        kv('보류·조사중', a.countPending + '건 · ' + n(a.qtyPending) + ' EA') +
      '</div>' +
      '<div class="formula"><span class="tag calc">계산</span> ' +
        '<code>규격이탈확정 수량 / 배치 수량 = ' + n(a.qtyConfirmed) + ' / ' + n(a.producedQty) + ' = ' + pct(a.rateProduced) + '</code><br>' +
        '회수 대상 = 확정(True) AND 불량률 ≥ 10% → <b>' + (over ? '충족' : '미충족') + '</b><br>' +
        '참고 · 분모를 SBL 출하수량(' + n(a.shippedQty) + ' EA)으로 바꾸면 ' + pct(a.rateShipped) + ' (판단 정의는 배치 수량 기준)' +
      '</div>' +
      '<div class="note"><b>예비검사 보류 건은 회수 대상이 아니라 조사·소명 대상</b>으로 분리했습니다(정책 원문). 회수 판단 단위는 생산 배치입니다.</div>' +
      claimsDetails(a) +
      lotBlock(a, s) +
      mappingBlock(a) +
      customersBlock(s) +
      capacityBlock(s, a));

    return html;
  }

  function kv(k, v) {
    return '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>';
  }

  function claimsDetails(a) {
    if (!a.countConfirmed && !a.countPending) return '';
    var rows = a.claimsConfirmed.slice(0, 6).map(function (c) {
      return '<tr><td>' + c.claim_id + '</td><td>' + c.claim_date + '</td><td>' + c.customer_id + '</td><td>' + esc(c.claim_type) + '</td><td class="num">' + n(E.num(c.qty_affected)) + '</td></tr>';
    }).join('');
    var more = a.countConfirmed > 6 ? '<div class="note">외 ' + (a.countConfirmed - 6) + '건</div>' : '';
    return '<details><summary>확정 클레임 원본 행 ' + a.countConfirmed + '건 보기 <span class="tag orig">qc_claims_cv</span></summary>' +
      '<div class="tbl-wrap"><table><thead><tr><th>claim</th><th>일자</th><th>고객</th><th>유형</th><th class="num">Qty</th></tr></thead><tbody>' + rows + '</tbody></table></div>' + more + '</details>';
  }

  function lotBlock(a, s) {
    if (!a.lotBatches || a.lotBatches.length < 2) return '';
    var rows = a.lotBatches.map(function (b) {
      var cls = b.isCurrent ? 'is-cur' : (UI.lotScope ? 'is-pick' : '');
      return '<tr class="' + cls + '"><td>' + b.batch_id + '</td><td>' + b.production_date + '</td><td>' + esc(b.qc_result) + '</td>' +
        '<td class="num">' + n(b.qty_confirmed) + '</td><td class="num"><b>' + pct(b.rate) + '</b></td>' +
        '<td>' + (b.eligible ? '<span class="tag bad">회수</span>' : '<span class="tag gray">미달</span>') + '</td></tr>';
    }).join('');
    return '<div class="h3">로트 추적 — 같은 원료 로트 <span class="tag orig">input_lot_ids</span></div>' +
      '<div class="tbl-wrap"><table><thead><tr><th>배치</th><th>생산일</th><th>QC</th><th class="num">확정</th><th class="num">불량률</th><th>판정</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="note">로트 <b>' + esc(a.lotId) + '</b> 투입 배치 ' + a.lotBatches.length + '건 중 기준 초과는 ' + a.lotBatches.filter(function (b) { return b.eligible; }).length + '건입니다. 정책상 회수 판단 단위는 배치이므로, 나머지 배치는 회수 대상이 아니라 <b>조사·추적 대상</b>으로 남깁니다.</div>' +
      '<div class="btns two" style="grid-template-columns:1fr">' +
      '<button class="act ' + (UI.lotScope ? 'primary' : 'ghost') + '" data-act="toggle-lot">' +
      (UI.lotScope ? '회수 범위: 로트 추적 확대 (가정) — 적용 중' : '회수 범위: 배치 단위 (정책 기본) — 로트 확대로 비교') +
      '<small>' + (UI.lotScope ? '4개 배치 · ' + n(s.shippedQty) + ' EA 를 회수 범위로 계산' : '누르면 같은 로트 4개 배치를 회수 범위로 확대한 결과를 비교합니다') + '</small></button></div>' +
      (UI.lotScope ? '<div class="banner warn" style="margin-top:10px">가정 시나리오: 원본 정책(배치 단위)을 벗어난 범위 확대입니다. 확대하면 회수 물량이 ' + n(s.shippedQty) + ' EA로 늘고 재공급 부족분이 ' + n(s.capacity ? s.capacity.shortfall : 0) + ' EA가 됩니다. 실행에는 품질위원회의 별도 의결과 영업 협의가 필요합니다.</div>' : '') +
      (s.scopeLabel ? '<div class="note">현재 계산 범위: <b>' + s.scopeLabel + '</b></div>' : '');
  }

  function mappingBlock(a) {
    var m = a.mapping;
    var bs = bsOf(UI.batchId);
    var st = bs.logistics;
    var chip = st === 'CONFIRMED' ? '<span class="tag ok">확인 완료(모의 회신)</span>'
      : st === 'REQUESTED' ? '<span class="tag warn">확인 요청됨</span>'
        : '<span class="tag bad">미확인</span>';
    return '<div class="h3">출하처 연결 — SBL ↔ SH <span class="tag orig">원본 공백</span> ' + chip + '</div>' +
      '<div class="tbl-wrap"><table><tbody>' +
      '<tr><td>배치 → 고객 납품 이력(SBL)</td><td class="num"><b>' + a.customers.length + '곳 · ' + n(a.shippedQty) + ' EA</b></td><td><span class="tag ok">확인</span></td></tr>' +
      '<tr><td>배치 → 재무 출하(SH) 1:1 매핑</td><td class="num">' + m.matched + ' / ' + n(m.sblRows) + '건</td><td><span class="tag bad">미연결</span></td></tr>' +
      '<tr><td>SBL↔SH 후보 일치(고객·제품·출하일·수량)</td><td class="num">' + m.matched + '건 (불일치 ' + n(m.unmatched) + ')</td><td><span class="tag calc">검증 결과</span></td></tr>' +
      '</tbody></table></div>' +
      '<div class="note">SH 출하 ' + n(m.shRows) + '건에는 <code>batch_id</code>가 없어 매출 귀속을 확정할 수 없습니다. 그래서 <b>납품처·수량은 SBL 원본으로 확정</b>하고, <b>매출 영향·잔여 출하 범위는 물류팀 확인 후 확정</b>으로 나눴습니다. 매출 영향 추정 ' + E.wonWon(a.revenueEstimate) + ' <span class="tag assume">추정·평균단가</span></div>';
  }

  function customersBlock(s) {
    if (!s.customers.length) return '';
    var rows = s.customers.map(function (c) {
      var r = s.capacity && s.capacity.alloc.rows.filter(function (x) { return x.customer_id === c.customer_id; })[0];
      return '<tr><td><b>' + esc(c.customer_name) + '</b><br><span style="color:#7b879a;font-size:10.5px">' + c.customer_id + '</span></td>' +
        '<td class="num">' + c.revenue_share_pct.toFixed(1) + '%</td>' +
        '<td class="num">' + n(c.qty) + '</td>' +
        '<td class="num">' + (r ? n(r.allocated_qty) : '—') + '</td>' +
        '<td>' + (r && r.shortage_qty > 0 ? '<span class="tag bad">부족 ' + n(r.shortage_qty) + '</span>' : '<span class="tag ok">충족</span>') + '</td></tr>';
    }).join('');
    return '<div class="h3">영향 고객 · 재공급 배분 ' + (s.scopeLabel ? '<span class="tag assume">' + s.scopeLabel + '</span>' : '') + '</div>' +
      '<div class="tbl-wrap"><table><thead><tr><th>고객</th><th class="num">매출비중</th><th class="num">회수 EA</th><th class="num">재공급 배정</th><th>결과</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function capacityBlock(s, a) {
    var c = s.capacity;
    if (!c) return '<div class="note">생산 여력 자료(strat_capacity_cv)에 이 제품 라인이 없습니다.</div>';
    return '<div class="h3">생산 여력 · 타 부서 제약 <span class="tag orig">strat_capacity_cv</span> <span class="tag assume">1개월 가정</span></div>' +
      '<div class="kv">' +
      kv(c.plant_id + ' · ' + c.line_id + ' 가동률', c.utilization_pct.toFixed(0) + '%') +
      kv('잔여 생산 여력', n(c.slack_qty) + ' EA') +
      kv('재공급 필요', n(c.need_qty) + ' EA') +
      kv('부족분', n(c.shortfall) + ' EA') +
      '</div>' +
      '<div class="note"><b>' + esc(productName(a.batch ? a.batch.product_id : '')) + '</b>는 F1 전용 라인(' + a.productName + ')에서 생산되고 가동률이 ' + c.utilization_pct.toFixed(0) + '%입니다. ' +
      '회수 물량을 그대로 재공급하려면 잔여 여력의 ' + (c.need_qty ? (c.need_qty / (c.slack_qty || 1)).toFixed(1) : '—') + '배가 필요해, 생산팀은 다른 납품 일정을 미루거나 배분을 조정해야 합니다. ' +
      '배분 규칙: <span class="tag assume">매출비중 내림차순</span> (참가자 정의) — 대형 고객(C-101 ' + '30%, C-102 25%) 우선.</div>';
  }

  function approvalSection(a) {
    var s = scoped();
    var bs = bsOf(UI.batchId);
    var decided = bs.decisions.length ? bs.decisions[bs.decisions.length - 1] : null;
    var review = E.needsReview(STATE, UI.batchId, analysis());

    var banner = '';
    if (decided) {
      banner = '<div class="banner">현재 상태 <b>' + E.STATUS_LABEL[bs.recall] + '</b>' +
        (bs.recall === 'APPROVED' && bs.logistics !== 'CONFIRMED' ? ' · <b>확인 필요</b>(출하처 확인 전)' : '') +
        ' — ' + esc(decided.at) + ' 품질위원회 ' + (decided.decision === 'APPROVE' ? '회수 의결' : '의결 거절') + '.</div>';
    }
    if (review) banner += '<div class="banner warn">재검토 신호: ' + esc(review) + '</div>';
    if (bs.correction) {
      banner += '<div class="banner sim">판정 정정(모의 재검사) 반영 — 확정 ' + n(bs.correction.correctedQty) + ' EA · ' + pct(bs.correction.rate) + (bs.correction.stillEligible ? ' (기준 유지)' : ' (기준 미달 → 회수 중단 검토)') + '. 기존 영업·생산 작업이 재검토 상태로 바뀌었습니다.</div>';
    }

    var logi = bs.logistics;
    var logiChip = logi === 'CONFIRMED' ? '<span class="tag ok">확인 완료</span>' : logi === 'REQUESTED' ? '<span class="tag warn">요청됨</span>' : '<span class="tag bad">미확인</span>';

    return section(3, '사람 승인 — 품질위원회 의결', '권한: 품질위원회 (approval_authority_policy.md)', '' +
      banner +
      '<div class="kv">' +
      kv('판정', s.eligible ? '회수 대상' : '대상 아님') +
      kv('회수 범위', s.scopeLabel || '배치 단위') +
      '</div>' +
      '<div class="btns">' +
      '<button class="act primary" data-act="approve">회수 의결 (승인)<small>' + n(s.shippedQty) + ' EA · 고객 ' + s.customers.length + '곳 · 후속 작업 생성</small></button>' +
      '<div class="btns two" style="margin:0">' +
      '<button class="act danger" data-act="reject">의결 거절<small>원인 조사 전환</small></button>' +
      '<button class="act ghost" data-act="req-logi">물류팀 출하처 확인 요청<small>' + (logi === 'CONFIRMED' ? '완료됨' : 'SBL↔SH 미연결') + '</small></button>' +
      '</div></div>' +
      '<div class="h3">출하처 확인 상태 ' + logiChip + '</div>' +
      '<label class="field"><span>물류팀 모의 회신 <span class="tag sim">모의</span></span>' +
      '<textarea id="reply" placeholder="예: 해당 배치 출하 5건, 납품처 4곳 확인. 잔여 2건은 타 로트 혼적분으로 확인됨.">' + esc(UI.reply) + '</textarea></label>' +
      '<button class="act ghost sm" data-act="do-reply">모의 회신 반영 → 보류 작업 재개</button>' +
      '<hr class="sep">' +
      '<div class="h3">판정 정정 <span class="tag sim">모의 재검사</span></div>' +
      '<div class="row"><label class="field"><span>정정 후 확정 수량(EA)</span><input id="corr" type="number" inputmode="numeric" value="' + esc(UI.correctedQty || Math.round(a.qtyConfirmed * 0.7)) + '"></label>' +
      '<label class="field"><span>&nbsp;</span><button class="act ghost" data-act="do-correct">정정 반영 · 후속작업 재검토</button></label></div>' +
      '<div class="note">정정으로 기준(10%) 아래로 내려가면 회수 의결이 뒤집히고, 이미 만든 영업 통보·생산 재공급 작업이 자동으로 <b>재검토</b> 상태로 바뀝니다(가상 입력).</div>');
  }

  function followupSection() {
    var bs = bsOf(UI.batchId);
    if (!bs.tasks.length) {
      return section(4, '후속 작업', '의결 결과로 생성되는 부서별 작업', '<div class="empty">아직 작업이 없습니다. 위에서 <b>회수 의결</b> 또는 <b>의결 거절</b>을 실행하면 영업·생산·물류·품질 작업이 생성됩니다.</div>');
    }
    var order = { '영업팀': 1, '생산팀': 2, '물류팀': 3, '품질팀': 4 };
    var tasks = bs.tasks.slice().sort(function (x, y) {
      return (order[x.owner] || 9) - (order[y.owner] || 9) || (x.id < y.id ? -1 : 1);
    }).map(function (t) {
      var chip = t.status === 'DONE' ? 'tag ok' : t.status === 'HOLD' ? 'tag warn' : t.status === 'REVIEW' ? 'tag bad' : t.status === 'DROPPED' ? 'tag gray' : 'tag orig';
      return '<div class="task ' + (t.status === 'DONE' ? 'done' : '') + '">' +
        '<span class="who">' + esc(t.owner) + '</span>' +
        '<span class="txt">' + esc(t.title) +
        '<span class="why">' + (t.note ? esc(t.note) + ' · ' : '') + esc(t.createdAt) + (t.blockedBy ? ' · <b>선행: ' + esc(t.blockedBy) + '</b>' : '') + '</span>' +
        '<span class="task-actions">' +
        (t.status !== 'DONE'
          ? '<button class="act sm" data-act="task-done" data-id="' + t.id + '">완료 처리</button>'
          : '<button class="act sm" data-act="task-reopen" data-id="' + t.id + '">되돌리기</button>') +
        '</span></span>' +
        '<span class="st"><span class="tag ' + chip + '">' + E.TASK_LABEL[t.status] + '</span></span></div>';
    }).join('');
    var open = bs.tasks.filter(function (t) { return t.status === 'TODO'; }).length;
    var hold = bs.tasks.filter(function (t) { return t.status === 'HOLD'; }).length;
    return section(4, '후속 작업', '의결 결과로 생성되는 부서별 작업',
      '<div class="kv" style="margin-top:0">' + kv('진행', open + '건') + kv('보류', hold + '건') + '</div>' + tasks +
      '<div class="note">작업 상태는 브라우저 저장소(localStorage)에 남습니다. 같은 배치를 다시 열면 판정과 함께 <b>바뀐 상태</b>가 그대로 보입니다.</div>');
  }

  function statusSection() {
    var ids = Object.keys(STATE.batches).filter(function (k) { return STATE.batches[k].recall !== 'NONE'; });
    var rows = ids.map(function (id) {
      var b = STATE.batches[id];
      var chip = b.recall === 'APPROVED' ? 'tag bad' : b.recall === 'INVESTIGATE' ? 'tag warn' : b.recall === 'CORRECTED' ? 'tag sim' : 'tag gray';
      var sub = b.recall === 'APPROVED' && b.logistics !== 'CONFIRMED' ? '<span class="tag warn">확인 필요</span>' : '';
      var done = b.tasks.filter(function (t) { return t.status === 'DONE'; }).length;
      return '<div class="state-row"><span class="id">' + id + '</span><span class="tag ' + chip + '">' + E.STATUS_LABEL[b.recall] + '</span>' + sub +
        '<span class="sp tag calc">작업 ' + done + '/' + b.tasks.length + ' 완료</span></div>';
    }).join('');
    var logs = STATE.log.slice(0, 12).map(function (l) {
      return '<li><time>' + esc(l.at) + '</time><span>' + esc(l.text) + '</span></li>';
    }).join('');
    var claims = STATE.customClaims.length
      ? '<div class="h3">추가 접수(가정) ' + STATE.customClaims.length + '건</div>' + STATE.customClaims.map(function (c) {
        return '<div class="note">' + c.claim_id + ' · ' + c.batch_id + ' · ' + (E.isTrue(c.defect_confirmed) ? '확정' : '보류') + ' · ' + n(c.qty_affected) + ' EA <span class="tag assume">가정 입력</span></div>';
      }).join('')
      : '';
    return section(5, '업무 상태 · 처리 기록', '다시 평가해도 유지되는 상태', '' +
      '<div class="btns" style="margin-top:0"><button class="act ghost" data-act="reevaluate">다시 평가 — 같은 배치 재판단<small>저장된 상태와 클레임을 다시 대조</small></button></div>' +
      (rows ? rows : '<div class="empty">아직 의결된 배치가 없습니다.</div>') +
      claims +
      '<div class="h3" style="margin-top:16px">처리 기록</div>' +
      (logs ? '<div class="log"><ul>' + logs + '</ul></div>' : '<div class="empty">기록이 없습니다.</div>') +
      '<div class="note">초기화는 상단 <b>⟲ 초기화</b>. 초기화해도 원본 CSV는 그대로입니다.</div>');
  }

  function section(no, title, sub, body) {
    return '<section class="card"><header><span class="step">' + no + '</span><h2>' + title + '<small>' + sub + '</small></h2></header>' +
      '<div class="body">' + body + '</div></section>';
  }

  /* ---------- 입력값 유지 ---------- */
  function bindInputs() {
    var r = document.getElementById('reply');
    if (r) r.addEventListener('input', function () { UI.reply = r.value; });
    var c = document.getElementById('corr');
    if (c) c.addEventListener('input', function () { UI.correctedQty = c.value; });
  }

  /* ---------- 액션 ---------- */
  function toast(msg, kind) {
    var el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.style.cssText = 'position:fixed;left:12px;right:12px;bottom:16px;z-index:99;max-width:536px;margin:0 auto;' +
        'background:#141a24;color:#fff;padding:12px 14px;border-radius:12px;font-size:13px;line-height:1.45;' +
        'box-shadow:0 10px 30px rgba(0,0,0,.3);transition:opacity .25s;opacity:0';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    if (kind === 'warn') el.style.background = '#7a4700';
    else if (kind === 'sim') el.style.background = '#4a2a86';
    else el.style.background = '#141a24';
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.style.opacity = '0'; }, 3600);
  }

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    var a = analysis();
    var at = now();
    var res;

    if (act === 'pick-batch') {
      UI.intake = 'BATCH'; UI.batchId = el.getAttribute('data-id'); UI.lotScope = false; UI.prefill = null;
      render(); window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (act === 'pick-news') { UI.intake = 'NEWS'; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (act === 'open-check-batch') {
      UI.intake = 'BATCH'; UI.batchId = 'B-02-2603-01'; UI.lotScope = false;
      render(); document.querySelectorAll('section.card')[1].scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (act === 'toggle-lot') { UI.lotScope = !UI.lotScope; render(); return; }
    if (act === 'reset') {
      STATE = E.emptyState(); save(); UI.lotScope = false; UI.reply = ''; UI.correctedQty = ''; UI.prefill = null;
      render(); toast('상태를 초기화했습니다. 원본 데이터는 변경되지 않았습니다.');
      return;
    }
    if (act === 'scenario') {
      var id = el.getAttribute('data-id');
      STATE = E.emptyState(); save();
      UI.lotScope = false; UI.reply = ''; UI.correctedQty = ''; UI.prefill = null;
      UI.scenario = id;
      if (id === 'S1') { UI.intake = 'BATCH'; UI.batchId = 'B-02-2602-01'; }
      if (id === 'S2') { UI.intake = 'BATCH'; UI.batchId = 'B-02-2602-02'; UI.prefill = { batch: 'B-02-2602-02', qty: 15600 }; }
      if (id === 'S3') { UI.intake = 'NEWS'; }
      render(); window.scrollTo({ top: 0, behavior: 'smooth' });
      toast('시나리오 ' + id.slice(1) + ' 준비 완료 — 상태를 초기화했습니다.', 'sim');
      return;
    }
    if (act === 'add-claim') {
      var bid = (document.getElementById('cc-batch') || {}).value || UI.batchId;
      var q = Number((document.getElementById('cc-qty') || {}).value || 0);
      var conf = (document.getElementById('cc-conf') || {}).value || 'True';
      var cust = (document.getElementById('cc-cust') || {}).value || 'C-101';
      if (!q || q <= 0) { toast('수량을 입력하세요.', 'warn'); return; }
      var seq = STATE.customClaims.length + 1;
      STATE.customClaims.push({
        claim_id: 'SIM-' + String(seq).padStart(3, '0'),
        claim_date: E.CFG.asOf, customer_id: cust,
        product_id: (MODEL.prodById[bid] || {}).product_id || 'NONE',
        batch_id: bid, lot_id: (MODEL.prodById[bid] || {}).input_lot_ids || 'NONE',
        claim_type: '직접입력', defect_confirmed: conf, qty_affected: String(q), status: '접수'
      });
      E.logEvent(STATE, at, 'INTAKE', '새 클레임 접수(가정) — ' + bid + ' ' + conf + ' ' + n(q) + ' EA');
      save(); UI.intake = 'BATCH'; UI.batchId = bid; UI.prefill = null;
      render();
      var na = analysis();
      toast('접수 완료 — ' + bid + ' 확정 불량률 ' + pct(na.rateProduced) + ' (' + (na.eligible ? '회수 대상' : '기준 미달') + ')', 'sim');
      return;
    }
    if (act === 'req-logi') {
      res = E.requestLogistics(STATE, { batchId: UI.batchId, at: at, analysis: a });
      STATE = res.state; save(); render(); toast(res.note || '출하처 확인을 요청했습니다.', 'warn'); return;
    }
    if (act === 'approve') {
      var s = scoped();
      if (!s.eligible && !analysis().eligible) {
        toast('확정 불량률이 기준(10%) 미달이라 회수 의결 대상이 아닙니다. 원인 조사·보류로 처리하세요.', 'warn');
      }
      res = E.approve(STATE, { batchId: UI.batchId, at: at, analysis: s, note: (UI.lotScope ? '회수 범위 로트 확대(가정)' : '') });
      STATE = res.state; save(); render();
      toast('회수 의결 완료 — 영업·생산·물류·품질 후속 작업 ' + bsOf(UI.batchId).tasks.length + '건 생성. 배치 상태: ' + E.STATUS_LABEL[bsOf(UI.batchId).recall], 'sim');
      return;
    }
    if (act === 'reject') {
      res = E.reject(STATE, { batchId: UI.batchId, at: at, analysis: a, note: '매핑 미확인·추가 소명 필요' });
      STATE = res.state; save(); render();
      toast('의결 거절 — 원인 조사로 전환했습니다. 재상신 조건이 작업에 기록됩니다.', 'warn');
      return;
    }
    if (act === 'do-reply') {
      if (bsOf(UI.batchId).logistics === 'CONFIRMED') { toast('이미 확인 완료된 배치입니다.', 'warn'); return; }
      var txt = (document.getElementById('reply') || {}).value || UI.reply || '출하처·출하 건 확인 완료(모의)';
      res = E.logisticsReply(STATE, { batchId: UI.batchId, at: at, analysis: scoped(), note: txt });
      STATE = res.state; save(); UI.reply = ''; render();
      toast('모의 회신 반영 — 보류 작업 ' + res.reopened + '건을 재개했습니다.', 'sim');
      return;
    }
    if (act === 'do-correct') {
      var cv = Number((document.getElementById('corr') || {}).value || UI.correctedQty || 0);
      if (!(cv > 0)) { toast('정정 수량을 입력하세요.', 'warn'); return; }
      res = E.correctJudgment(STATE, { batchId: UI.batchId, at: at, analysis: analysis(), correctedQty: cv, note: '모의 재검사 회신' });
      STATE = res.state; save(); render();
      toast('판정 정정 반영 — 정정 후 ' + pct(res.rate) + (res.stillEligible ? ' (기준 유지)' : ' → 기준 미달, 후속 작업 재검토'), 'sim');
      return;
    }
    if (act === 'task-done' || act === 'task-reopen') {
      var tid = el.getAttribute('data-id');
      var bs = E.ensureBatch(STATE, UI.batchId);
      bs.tasks.forEach(function (t) {
        if (t.id === tid) { t.status = act === 'task-done' ? 'DONE' : 'TODO'; }
      });
      E.logEvent(STATE, at, 'TASK', (act === 'task-done' ? '작업 완료' : '작업 재개') + ' — ' + tid);
      save(); render(); return;
    }
    if (act === 'reevaluate') {
      var cur = analysis();
      var st = bsOf(UI.batchId).recall;
      render();
      toast('재평가 완료 — ' + UI.batchId + ' 확정 ' + n(cur.qtyConfirmed) + ' EA · ' + pct(cur.rateProduced) + ' · ' + (cur.eligible ? '회수 대상' : '기준 미달') + ' · 상태 ' + E.STATUS_LABEL[st]);
      var j = document.querySelectorAll('section.card')[1];
      if (j) j.scrollIntoView({ behavior: 'smooth' });
      return;
    }
  });

  /* ---------- 시작 ---------- */
  function fail(msg) {
    document.getElementById('app').innerHTML =
      '<div class="card"><div class="body"><b>데이터를 불러오지 못했습니다.</b><div class="note">' + esc(msg) +
      '<br><br><code>data/</code> 폴더가 함께 배포되어야 합니다. 로컬에서 열었다면 파일을 직접 열지 말고 <code>python3 -m http.server</code> 로 실행하세요.</div></div></div>';
  }

  function boot() {
    var f = E.CFG.files;
    var keys = Object.keys(f);
    Promise.all(keys.map(function (k) {
      return fetch(f[k], { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error(f[k] + ' → HTTP ' + r.status);
        return r.text();
      });
    })).then(function (outs) {
      var texts = {};
      keys.forEach(function (k, i) { texts[k] = outs[i]; });
      MODEL = E.buildModel({
        claims: E.parsePipe(texts.claims),
        prod: E.parsePipe(texts.prod),
        sbl: E.parsePipe(texts.sbl),
        shipments: E.parsePipe(texts.shipments),
        customers: E.parsePipe(texts.customers),
        products: E.parsePipe(texts.products),
        capacity: E.parsePipe(texts.capacity),
        texts: texts
      });
      if (!MODEL.prodById[UI.batchId] && MODEL.prod.length) UI.batchId = MODEL.prod[0].batch_id;
      render();
    }).catch(function (err) { fail(err.message || String(err)); });
  }

  boot();
})();
