/* =============================================================
   W03 · 품질 이슈와 공급 복구 — 판단·승인·후속작업 엔진 (DOM 비의존)
   모든 수치는 data/ 아래 원본 CSV/MD에서 직접 읽어 계산한다.
   계산식 출처: data/00_common/calculation_definitions.md §1.9,
                data/01_corevia/quality/quality_policy_cv.md
   ============================================================= */
(function (global) {
  'use strict';

  var CFG = {
    asOf: '2026-07-01',
    /* 회수 기준: 배치 단위 규격이탈 확정 불량률 10% 이상 (quality_policy_cv.md) */
    threshold: 0.10,
    thresholdSource: 'quality_policy_cv.md / calculation_definitions.md §1.9',
    authority: '품질위원회 (approval_authority_policy.md)',
    /* strat_capacity_cv 의 capacity_qty 는 기간 표기가 없다 → 1개월 생산능력으로 가정 */
    capacityPeriodNote: 'strat_capacity_cv.snapshot_date(2026-06-30) 라인 능력. 원본에 기간 표기가 없어 1개월 기준으로 가정',
    files: {
      claims: 'data/01_corevia/quality/qc_claims_cv.csv',
      sbl: 'data/01_corevia/quality/shipment_batch_link_cv.csv',
      prod: 'data/01_corevia/production/prod_batch_log_cv.csv',
      capacity: 'data/01_corevia/production/strat_capacity_cv.csv',
      shipments: 'data/01_corevia/sales/sales_shipments_cv.csv',
      customers: 'data/01_corevia/master/m_customer_cv.csv',
      products: 'data/01_corevia/master/m_product_cv.csv',
      policy: 'data/01_corevia/quality/quality_policy_cv.md',
      calcDefs: 'data/00_common/calculation_definitions.md',
      approval: 'data/00_common/approval_authority_policy.md',
      news: 'data/05_external/news/ext_news_quality_incident.md'
    }
  };

  /* ---------- 파싱 ---------- */
  function parsePipe(text) {
    var lines = String(text).replace(/\r\n/g, '\n').split('\n').filter(function (l) { return l.length; });
    if (!lines.length) return [];
    var head = lines[0].split('|').map(function (s) { return s.trim(); });
    var out = [];
    for (var i = 1; i < lines.length; i++) {
      var cells = lines[i].split('|');
      if (cells.length !== head.length) continue;
      var row = {};
      for (var j = 0; j < head.length; j++) row[head[j]] = cells[j].trim();
      out.push(row);
    }
    return out;
  }

  function num(v) { var n = Number(String(v).replace(/,/g, '')); return isFinite(n) ? n : 0; }
  function isTrue(v) { return String(v).toLowerCase() === 'true'; }
  function fmtInt(n) { return Math.round(n).toLocaleString('ko-KR'); }
  function fmtPct(r, d) { return (r * 100).toFixed(d == null ? 2 : d) + '%'; }

  /* ---------- 모델 ---------- */
  function buildModel(raw) {
    var model = {
      claims: raw.claims || [],
      prod: raw.prod || [],
      sbl: raw.sbl || [],
      sh: raw.shipments || [],
      customers: raw.customers || [],
      products: raw.products || [],
      capacity: raw.capacity || [],
      texts: raw.texts || {}
    };
    model.prodById = {};
    model.prod.forEach(function (p) { model.prodById[p.batch_id] = p; });
    model.customerById = {};
    model.customers.forEach(function (c) { model.customerById[c.customer_id] = c; });
    model.productById = {};
    model.products.forEach(function (p) { model.productById[p.product_id] = p; });
    model.sblByBatch = {};
    model.sbl.forEach(function (r) {
      (model.sblByBatch[r.batch_id] = model.sblByBatch[r.batch_id] || []).push(r);
    });
    model.claimsByBatch = {};
    model.claims.forEach(function (c) {
      (model.claimsByBatch[c.batch_id] = model.claimsByBatch[c.batch_id] || []).push(c);
    });
    model.capacityByProduct = {};
    model.capacity.forEach(function (c) {
      if (!model.capacityByProduct[c.product_id]) model.capacityByProduct[c.product_id] = c;
    });
    /* 제품별 평균 출하 단가(원/EA) — 매출 영향 '추정'에만 사용 */
    var acc = {};
    model.sh.forEach(function (r) {
      var a = acc[r.product_id] = acc[r.product_id] || { q: 0, rev: 0 };
      a.q += num(r.shipped_qty); a.rev += num(r.revenue_krw);
    });
    model.avgPrice = {};
    Object.keys(acc).forEach(function (k) {
      model.avgPrice[k] = acc[k].q ? acc[k].rev / acc[k].q : 0;
    });
    model.mapping = mappingCheck(model);
    return model;
  }

  /* SBL(품질 출하 연결) ↔ SH(재무 출하) 1:1 매핑 검증.
     SH에는 batch_id가 없으므로 (고객·제품·출하일·수량) 완전일치로만 후보를 찾는다.
     → 원본 공백을 '숫자로' 확인하는 절차. */
  function mappingCheck(model) {
    var idx = {};
    model.sh.forEach(function (r) {
      var k = [r.customer_id, r.product_id, r.ship_date, r.shipped_qty].join('¦');
      (idx[k] = idx[k] || []).push(r.shipment_id);
    });
    var matched = 0, ambiguous = 0, unmatched = 0;
    model.sbl.forEach(function (r) {
      var k = [r.customer_id, r.product_id, r.ship_date, r.shipped_qty].join('¦');
      var hit = idx[k];
      if (!hit) unmatched++;
      else if (hit.length === 1) matched++;
      else ambiguous++;
    });
    return {
      sblRows: model.sbl.length,
      shRows: model.sh.length,
      matched: matched,
      ambiguous: ambiguous,
      unmatched: unmatched,
      confirmedRate: model.sbl.length ? matched / model.sbl.length : 0
    };
  }

  /* ---------- 배치 분석 ---------- */
  function analyzeBatch(model, batchId, extraClaims) {
    var batch = model.prodById[batchId] || null;
    var claims = model.claims.concat(extraClaims || []);
    var conf = claims.filter(function (c) { return c.batch_id === batchId && isTrue(c.defect_confirmed); });
    var pend = claims.filter(function (c) { return c.batch_id === batchId && !isTrue(c.defect_confirmed); });
    var qtyConf = conf.reduce(function (s, c) { return s + num(c.qty_affected); }, 0);
    var qtyPend = pend.reduce(function (s, c) { return s + num(c.qty_affected); }, 0);
    var produced = batch ? num(batch.produced_qty) : 0;
    var sbl = model.sblByBatch[batchId] || [];
    var shipped = sbl.reduce(function (s, r) { return s + num(r.shipped_qty); }, 0);
    var rateProduced = produced ? qtyConf / produced : 0;
    var rateShipped = shipped ? qtyConf / shipped : null;
    var eligible = qtyConf > 0 && produced > 0 && rateProduced >= CFG.threshold;

    /* 로트 추적: 같은 원료 로트를 투입한 다른 배치 (원본 input_lot_ids 기준) */
    var lotId = batch ? batch.input_lot_ids : null;
    var lotBatches = lotId ? model.prod.filter(function (p) { return p.input_lot_ids === lotId; }) : [];
    var lotInfo = lotBatches.map(function (p) {
      var cq = claims.filter(function (c) { return c.batch_id === p.batch_id && isTrue(c.defect_confirmed); })
        .reduce(function (s, c) { return s + num(c.qty_affected); }, 0);
      var sh = (model.sblByBatch[p.batch_id] || []).reduce(function (s, r) { return s + num(r.shipped_qty); }, 0);
      return {
        batch_id: p.batch_id,
        product_id: p.product_id,
        production_date: p.production_date,
        produced_qty: num(p.produced_qty),
        qc_result: p.qc_result,
        qty_confirmed: cq,
        rate: num(p.produced_qty) ? cq / num(p.produced_qty) : 0,
        shipped_qty: sh,
        eligible: cq > 0 && num(p.produced_qty) > 0 && cq / num(p.produced_qty) >= CFG.threshold,
        isCurrent: p.batch_id === batchId
      };
    }).sort(function (a, b) { return a.production_date < b.production_date ? -1 : 1; });

    /* 고객 영향: SBL은 batch→고객을 원본으로 제공한다 */
    var byCust = {};
    sbl.forEach(function (r) {
      var c = byCust[r.customer_id] = byCust[r.customer_id] || { customer_id: r.customer_id, qty: 0, rows: [] };
      c.qty += num(r.shipped_qty);
      c.rows.push(r);
    });
    var customers = Object.keys(byCust).map(function (k) {
      var c = byCust[k];
      var m = model.customerById[k] || {};
      return {
        customer_id: k,
        customer_name: m.customer_name || k,
        channel_type: m.channel_type || '',
        revenue_share_pct: num(m.revenue_share_pct),
        cost_linked_clause: isTrue(m.cost_linked_clause),
        payment_terms_days: num(m.payment_terms_days),
        qty: c.qty,
        rows: c.rows
      };
    }).sort(function (a, b) { return b.revenue_share_pct - a.revenue_share_pct; });

    /* 생산 여력 (PL-02 = 더마, F1 전용 라인) */
    var cap = model.capacityByProduct[batch ? batch.product_id : ''] || null;
    var capInfo = null;
    if (cap) {
      var capQty = num(cap.capacity_qty), util = num(cap.utilization_pct) / 100;
      var slack = Math.max(capQty * (1 - util), 0);
      capInfo = {
        line_id: cap.line_id, plant_id: cap.plant_id, product_id: cap.product_id,
        capacity_qty: capQty, utilization_pct: num(cap.utilization_pct),
        slack_qty: slack, need_qty: shipped, shortfall: Math.max(shipped - slack, 0),
        coverRate: shipped ? Math.min(slack / shipped, 1) : 0,
        alloc: allocate(slack, customers, shipped)
      };
    }

    var price = model.avgPrice[batch ? batch.product_id : ''] || 0;

    return {
      batchId: batchId,
      batch: batch,
      product: batch ? model.productById[batch.product_id] : null,
      productName: batch && model.productById[batch.product_id] ? model.productById[batch.product_id].product_name : '',
      claimsConfirmed: conf,
      claimsPending: pend,
      countConfirmed: conf.length,
      countPending: pend.length,
      qtyConfirmed: qtyConf,
      qtyPending: qtyPend,
      producedQty: produced,
      shippedQty: shipped,
      rateProduced: rateProduced,
      rateShipped: rateShipped,
      threshold: CFG.threshold,
      eligible: eligible,
      lotId: lotId,
      lotBatches: lotInfo,
      lotShippedQty: lotInfo.reduce(function (s, b) { return s + b.shipped_qty; }, 0),
      customers: customers,
      capacity: capInfo,
      revenueEstimate: shipped * price,
      avgPrice: price,
      mapping: model.mapping
    };
  }

  /* 회수 범위 확대(가정 시나리오): 같은 원료 로트를 투입한 배치 전체로 범위를 넓힌다.
     원본 정책의 회수 판단 단위는 '배치'이므로 이 결과는 반드시 가정 시나리오로 표시한다. */
  function aggregateLotScope(model, a) {
    var byC = {};
    (a.lotBatches || []).forEach(function (b) {
      (model.sblByBatch[b.batch_id] || []).forEach(function (r) {
        var c = byC[r.customer_id] = byC[r.customer_id] || { customer_id: r.customer_id, qty: 0, rows: [] };
        c.qty += num(r.shipped_qty); c.rows.push(r);
      });
    });
    var customers = Object.keys(byC).map(function (k) {
      var c = byC[k], m = model.customerById[k] || {};
      return {
        customer_id: k, customer_name: m.customer_name || k, channel_type: m.channel_type || '',
        revenue_share_pct: num(m.revenue_share_pct), cost_linked_clause: isTrue(m.cost_linked_clause),
        payment_terms_days: num(m.payment_terms_days), qty: c.qty, rows: c.rows
      };
    }).sort(function (x, y) { return y.revenue_share_pct - x.revenue_share_pct; });
    var total = customers.reduce(function (s, c) { return s + c.qty; }, 0);
    var cap = null;
    if (a.capacity) {
      cap = Object.assign({}, a.capacity, {
        need_qty: total,
        shortfall: Math.max(total - a.capacity.slack_qty, 0),
        coverRate: total ? Math.min(a.capacity.slack_qty / total, 1) : 0,
        alloc: allocate(a.capacity.slack_qty, customers, total)
      });
    }
    return Object.assign({}, a, {
      shippedQty: total, customers: customers, capacity: cap,
      revenueEstimate: total * (a.avgPrice || 0),
      scopeLabel: '로트 추적 확대 (가정)',
      scopeBatches: (a.lotBatches || []).length
    });
  }

  /* 재공급 우선순위 배분: 매출비중(revenue_share_pct) 내림차순으로 잔여 여력을 배정 */
  function allocate(slack, customers, totalNeed) {
    var left = slack, out = [];
    customers.forEach(function (c) {
      var give = Math.min(c.qty, Math.max(left, 0));
      left -= give;
      out.push({
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        revenue_share_pct: c.revenue_share_pct,
        need_qty: c.qty,
        allocated_qty: give,
        shortage_qty: Math.max(c.qty - give, 0),
        coverage: c.qty ? give / c.qty : 1
      });
    });
    return { rows: out, totalNeed: totalNeed, slack: slack, covered: Math.min(slack, totalNeed) };
  }

  /* ---------- 상태 ---------- */
  var STATUS_LABEL = {
    NONE: '미판정',
    PENDING: '의결 대기',
    APPROVED: '회수 진행',
    INVESTIGATE: '원인 조사',
    CORRECTED: '판정 정정'
  };
  var TASK_LABEL = { TODO: '진행', HOLD: '보류', DONE: '완료', REVIEW: '재검토 필요', DROPPED: '중단' };

  function emptyState() {
    return { v: 1, batches: {}, log: [], customClaims: [], updatedAt: null };
  }

  function getBatchState(state, batchId) {
    return state.batches[batchId] || {
      batchId: batchId, recall: 'NONE', logistics: 'UNCONFIRMED',
      decisions: [], tasks: [], correction: null
    };
  }

  function ensureBatch(state, batchId) {
    if (!state.batches[batchId]) {
      state.batches[batchId] = {
        batchId: batchId, recall: 'NONE', logistics: 'UNCONFIRMED',
        decisions: [], tasks: [], correction: null
      };
    }
    return state.batches[batchId];
  }

  function uid(prefix, n) { return prefix + '-' + String(n).padStart(3, '0'); }

  function pushTask(bs, task) {
    task.id = uid('T', bs.tasks.length + 1);
    bs.tasks.push(task);
    return task;
  }

  function logEvent(state, at, kind, text) {
    state.log.unshift({ at: at, kind: kind, text: text });
    if (state.log.length > 80) state.log.length = 80;
    state.updatedAt = at;
  }

  /* 1) 물류팀 출하처 확인 요청 */
  function requestLogistics(state, opt) {
    var s = clone(state);
    var bs = ensureBatch(s, opt.batchId);
    var a = opt.analysis;
    if (bs.logistics === 'CONFIRMED') return { state: s, note: '이미 확인 완료된 배치입니다.' };
    bs.logistics = 'REQUESTED';
    bs.recall = bs.recall === 'NONE' ? 'PENDING' : bs.recall;
    pushTask(bs, {
      owner: '물류팀', type: 'CONFIRM',
      title: '배치 ' + opt.batchId + ' 출하처·출하번호 대응표 확인 (SBL↔SH 미연결 ' + (a ? fmtInt(a.shippedQty) : '') + ' EA)',
      status: 'TODO', blockedBy: null,
      note: '원본 공백: SBL↔SH 1:1 매핑 ' + a.mapping.matched + '/' + a.mapping.sblRows + '건만 확인됨',
      createdAt: opt.at
    });
    logEvent(s, opt.at, 'REQUEST',
      '물류팀에 ' + opt.batchId + ' 출하처 확인 요청 (SBL↔SH 매핑 ' + a.mapping.matched + '/' + a.mapping.sblRows + ' 확인)');
    return { state: s, note: '출하처 확인 요청을 등록했습니다. 확인 전까지 범위 확정 작업은 보류됩니다.' };
  }

  /* 2) 품질위원회 의결 — 회수 승인 */
  function approve(state, opt) {
    var s = clone(state);
    var bs = ensureBatch(s, opt.batchId);
    var a = opt.analysis;
    bs.recall = 'APPROVED';
    bs.decisions.push({ at: opt.at, by: '품질위원회', decision: 'APPROVE', note: opt.note || '' });
    var confirmedLogi = bs.logistics === 'CONFIRMED';
    var names = (a.customers || []).map(function (c) { return c.customer_name + '(' + c.customer_id + ')'; }).join(', ');

    pushTask(bs, {
      owner: '영업팀', type: 'CUSTOMER_NOTICE',
      title: '회수 대상 고객 통보 — ' + (names || '납품처 없음'),
      status: confirmedLogi ? 'TODO' : 'TODO', blockedBy: null,
      note: 'SBL 원본으로 확인된 납품처 ' + a.customers.length + '곳 · ' + fmtInt(a.shippedQty) + ' EA',
      createdAt: opt.at
    });
    pushTask(bs, {
      owner: '영업팀', type: 'CUSTOMER_NOTICE_SCOPE',
      title: 'SBL↔SH 미확인 잔여 범위 확인 후 추가 통보 대상 확정',
      status: confirmedLogi ? 'TODO' : 'HOLD', blockedBy: confirmedLogi ? null : '출하처 확인(물류팀)',
      note: confirmedLogi ? '출하처 확인 회신 반영' : '출하처 확인 전에는 추가 통보 대상을 확정하지 않는다',
      createdAt: opt.at
    });
    pushTask(bs, {
      owner: '물류팀', type: 'RECALL_ORDER',
      title: '회수 지시서 발행 · 회수 수량 확정 (' + fmtInt(a.shippedQty) + ' EA)',
      status: confirmedLogi ? 'TODO' : 'HOLD', blockedBy: confirmedLogi ? null : '출하처 확인(물류팀)',
      note: '재고 위치·고객 보유량 자료는 원본에 없음 → 회수 실적은 회수 후 별도 집계',
      createdAt: opt.at
    });
    pushTask(bs, {
      owner: '생산팀', type: 'RESUPPLY',
      title: '재공급 우선순위 조정 — ' + (a.capacity ? a.capacity.line_id + ' 잔여 ' + fmtInt(a.capacity.slack_qty) + ' EA / 필요 ' + fmtInt(a.capacity.need_qty) + ' EA' : '라인 여력 확인 필요'),
      status: 'TODO', blockedBy: null,
      note: a.capacity ? '부족 ' + fmtInt(a.capacity.shortfall) + ' EA → 매출비중 순 배분(영업팀과 납기 협의)' : '',
      createdAt: opt.at
    });
    pushTask(bs, {
      owner: '품질팀', type: 'INVESTIGATE',
      title: '원인 조사 트랙 개시 (회수와 별도 진행)',
      status: 'TODO', blockedBy: null,
      note: '로트 ' + a.lotId + ' · 동일 로트 투입 배치 ' + a.lotBatches.length + '건 재확인',
      createdAt: opt.at
    });
    logEvent(s, opt.at, 'APPROVE',
      '품질위원회 회수 의결 — ' + opt.batchId + ' (확정 불량률 ' + fmtPct(a.rateProduced) + ' ≥ 10%). 후속 작업 5건 생성');
    return { state: s };
  }

  /* 3) 의결 거절 → 원인 조사 전환 */
  function reject(state, opt) {
    var s = clone(state);
    var bs = ensureBatch(s, opt.batchId);
    var a = opt.analysis;
    bs.recall = 'INVESTIGATE';
    bs.decisions.push({ at: opt.at, by: '품질위원회', decision: 'REJECT', note: opt.note || '' });
    pushTask(bs, {
      owner: '품질팀', type: 'INVESTIGATE',
      title: '원인 조사·소명 자료 작성 (회수 미실시 근거 포함)',
      status: 'TODO', blockedBy: null,
      note: '재상신 조건: 확정 수량 재검사 결과 또는 출하처 확인 회신 확보',
      createdAt: opt.at
    });
    pushTask(bs, {
      owner: '영업팀', type: 'CUSTOMER_NOTICE_SCOPE',
      title: '고객 문의 대응 준비 — 회수 미실시 사유 안내 (발송 보류)',
      status: 'HOLD', blockedBy: '품질위원회 재상신',
      note: '거절 상태에서는 고객 통보를 발송하지 않는다',
      createdAt: opt.at
    });
    logEvent(s, opt.at, 'REJECT',
      '품질위원회 의결 거절 — ' + opt.batchId + ' → 원인 조사 전환. 재상신 조건 기록');
    return { state: s };
  }

  /* 4) 물류팀 모의 회신 → 보류 작업 자동 재개 */
  function logisticsReply(state, opt) {
    var s = clone(state);
    var bs = ensureBatch(s, opt.batchId);
    var a = opt.analysis;
    bs.logistics = 'CONFIRMED';
    bs.logisticsReply = { at: opt.at, text: opt.note || '' };
    var reopened = 0;
    bs.tasks.forEach(function (t) {
      if (t.status === 'HOLD' && /출하처 확인/.test(t.blockedBy || '')) {
        t.status = 'TODO'; t.blockedBy = null;
        t.note = (t.note ? t.note + ' · ' : '') + '출하처 확인 회신으로 재개';
        reopened++;
      }
    });
    pushTask(bs, {
      owner: '영업팀', type: 'CUSTOMER_NOTICE_SCOPE',
      title: '확인된 출하 건 기준 추가 통보·매출 영향 확정 (추정 ' + wonWon(a.revenueEstimate) + ')',
      status: 'TODO', blockedBy: null,
      note: '매출 영향액은 평균 출하단가 추정치 — 확정 금액은 재무 확인 필요',
      createdAt: opt.at
    });
    logEvent(s, opt.at, 'REPLY',
      '물류팀 모의 회신 반영 — ' + opt.batchId + ' 출하처 확인 완료, 보류 작업 ' + reopened + '건 재개');
    return { state: s, reopened: reopened };
  }

  /* 5) 판정 정정(모의 재검사) → 기존 영업·생산 후속 작업 자동 재검토 */
  function correctJudgment(state, opt) {
    var s = clone(state);
    var bs = ensureBatch(s, opt.batchId);
    var a = opt.analysis;
    var correctedQty = opt.correctedQty;
    var rate = a.producedQty ? correctedQty / a.producedQty : 0;
    var stillEligible = rate >= CFG.threshold;
    bs.correction = {
      at: opt.at, correctedQty: correctedQty, rate: rate,
      stillEligible: stillEligible, note: opt.note || '모의 재검사 회신'
    };
    if (bs.recall === 'APPROVED' && !stillEligible) {
      bs.recall = 'CORRECTED';
      bs.tasks.forEach(function (t) {
        if (t.status === 'DONE') return;
        if (t.type === 'CUSTOMER_NOTICE' || t.type === 'CUSTOMER_NOTICE_SCOPE') t.status = 'REVIEW';
        else if (t.type === 'RESUPPLY') t.status = 'REVIEW';
        else if (t.type === 'RECALL_ORDER') t.status = 'REVIEW';
        else t.status = t.status;
      });
      pushTask(bs, {
        owner: '영업팀', type: 'REVIEW',
        title: '회수 통보 중단·정정 안내 재검토 (정정 후 ' + fmtPct(rate) + ' < 10%)',
        status: 'TODO', blockedBy: null,
        note: '이미 발송한 통보의 정정 범위 확인 필요',
        createdAt: opt.at
      });
      pushTask(bs, {
        owner: '생산팀', type: 'REVIEW',
        title: '재공급 우선순위 재계산 — 회수 물량 제외',
        status: 'TODO', blockedBy: null,
        note: '배분 취소 ' + fmtInt(a.shippedQty) + ' EA, 잔여 여력 복원',
        createdAt: opt.at
      });
    }
    logEvent(s, opt.at, 'CORRECT',
      '판정 정정(모의 재검사) — ' + opt.batchId + ' 확정 ' + fmtInt(correctedQty) + ' EA → ' +
      fmtPct(rate) + (stillEligible ? ' (기준 유지)' : ' (기준 미달, 회수 중단 검토)'));
    return { state: s, stillEligible: stillEligible, rate: rate };
  }

  /* 재평가: 의결 시점 판단과 현재 계산이 달라졌는지 */
  function needsReview(state, batchId, analysis) {
    var bs = state.batches[batchId];
    if (!bs || !bs.decisions.length) return null;
    var decided = bs.decisions[bs.decisions.length - 1];
    if (decided.decision === 'APPROVE' && !analysis.eligible) return '의결 당시 회수 대상이었으나 현재 계산은 기준 미달 — 재검토 필요';
    if (decided.decision === 'REJECT' && analysis.eligible) return '의결 당시 조사 전환이었으나 현재 계산은 회수 대상 — 재상신 필요';
    return null;
  }

  function wonWon(n) {
    if (!n) return '0원';
    if (n >= 1e8) return (n / 1e8).toFixed(1) + '억원';
    if (n >= 1e4) return fmtInt(n / 1e4) + '만원';
    return fmtInt(n) + '원';
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  global.W03Engine = {
    CFG: CFG, STATUS_LABEL: STATUS_LABEL, TASK_LABEL: TASK_LABEL,
    parsePipe: parsePipe, buildModel: buildModel, mappingCheck: mappingCheck,
    analyzeBatch: analyzeBatch, allocate: allocate, aggregateLotScope: aggregateLotScope,
    emptyState: emptyState, getBatchState: getBatchState, ensureBatch: ensureBatch,
    requestLogistics: requestLogistics, approve: approve, reject: reject,
    logisticsReply: logisticsReply, correctJudgment: correctJudgment,
    needsReview: needsReview, logEvent: logEvent, clone: clone,
    fmtInt: fmtInt, fmtPct: fmtPct, wonWon: wonWon, num: num, isTrue: isTrue
  };
})(typeof window !== 'undefined' ? window : globalThis);
