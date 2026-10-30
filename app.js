/* =====================================================================
 *  유흥 동문회 레크리에이션 - 동작 코드
 *  콘텐츠 수정은 js/data.js 에서 하세요. 이 파일은 보통 건드릴 필요 없습니다.
 * ===================================================================== */
(function () {
  'use strict';

  var D = window.RECREATION;
  if (!D) { document.body.innerHTML = '<p style="padding:2rem">data.js를 불러오지 못했습니다.</p>'; return; }

  /* ---------------------------------------------------------------
   *  유틸
   * ------------------------------------------------------------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function randInt(n) {
    if (window.crypto && crypto.getRandomValues) {
      var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n;
    }
    return Math.floor(Math.random() * n);
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = randInt(i + 1); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function button(label, cls, fn) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'btn ' + (cls || ''); b.textContent = label;
    if (fn) b.addEventListener('click', fn);
    return b;
  }
  function list(items, cls) {
    return '<ul class="' + (cls || 'bullets') + '">' + items.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
  }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtTime(s) { return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60); }
  function scrollToId(id) {
    var t = document.getElementById(id);
    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------------------------------------------------------------
   *  상태 저장소 (점수 / 팀 이름) - localStorage
   * ------------------------------------------------------------- */
  var KEY = 'yuheung-recreation-v1';
  var Store = {
    s: { scores: {}, history: [], teamNames: {}, puzzleWinner: '' },
    subs: [],
    load: function () {
      try {
        var raw = localStorage.getItem(KEY);
        if (raw) {
          var p = JSON.parse(raw);
          this.s.scores = p.scores || {};
          this.s.history = p.history || [];
          this.s.teamNames = p.teamNames || {};
          this.s.puzzleWinner = p.puzzleWinner || '';
        }
      } catch (e) { /* 저장소를 못 쓰는 환경이면 메모리로만 동작 */ }
    },
    save: function () { try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch (e) {} },
    on: function (fn) { this.subs.push(fn); },
    emit: function () { this.save(); this.subs.forEach(function (f) { f(); }); },
    get: function (game, i) { return Number((this.s.scores[game] || {})[i]) || 0; },
    add: function (game, i, delta, noHistory) {
      if (!delta) return;
      if (!this.s.scores[game]) this.s.scores[game] = {};
      this.s.scores[game][i] = this.get(game, i) + delta;
      if (!noHistory) {
        this.s.history.push({ game: game, team: i, delta: delta });
        if (this.s.history.length > 300) this.s.history.shift();
      }
      this.emit();
    },
    set: function (game, i, val) { this.add(game, i, (Number(val) || 0) - this.get(game, i)); },
    undo: function () {
      var h = this.s.history.pop();
      if (!h) return null;
      this.s.scores[h.game][h.team] = this.get(h.game, h.team) - h.delta;
      this.emit();
      return h;
    },
    reset: function () { this.s.scores = {}; this.s.history = []; this.emit(); },
    setName: function (i, name) {
      var n = String(name || '').trim();
      if (n) this.s.teamNames[i] = n; else delete this.s.teamNames[i];
      this.emit();
    },
    setPuzzleWinner: function (v) { this.s.puzzleWinner = v; this.save(); }
  };
  Store.load();

  function teamName(i) { return Store.s.teamNames[i] || D.teams[i].name; }
  function nameTag(i) { return '<span data-team-name="' + i + '">' + esc(teamName(i)) + '</span>'; }
  function refreshNames() {
    $$('[data-team-name]').forEach(function (n) { n.textContent = teamName(Number(n.getAttribute('data-team-name'))); });
  }
  Store.on(refreshNames);

  function totals(keys) {
    return D.teams.map(function (_, i) {
      return keys.reduce(function (sum, k) { return sum + Store.get(k, i); }, 0);
    });
  }
  function ranks(tot) {
    return tot.map(function (v) { return 1 + tot.filter(function (o) { return o > v; }).length; });
  }
  function teamMembers(i) {
    var t = D.teams[i];
    var named = (t.members || []).filter(Boolean);
    if (named.length) return named;
    var out = [];
    for (var k = 1; k <= t.size; k++) out.push(teamName(i) + ' ' + k + '번');
    return out;
  }

  /* ---------------------------------------------------------------
   *  소리 (타이머 종료 알림)
   * ------------------------------------------------------------- */
  var audioCtx = null;
  function beep(times) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      for (var k = 0; k < (times || 3); k++) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.value = 880;
        o.connect(g); g.connect(audioCtx.destination);
        var t0 = audioCtx.currentTime + k * 0.35;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
        o.start(t0); o.stop(t0 + 0.27);
      }
    } catch (e) {}
  }

  /* ---------------------------------------------------------------
   *  타이머
   * ------------------------------------------------------------- */
  function createTimer(opts) {
    var total = opts.seconds, left = opts.seconds, id = null, endAt = 0;
    var api = {
      running: function () { return id !== null; },
      left: function () { return left; },
      render: function () {
        opts.display.textContent = fmtTime(left);
        opts.display.classList.toggle('warn', left <= 10 && left > 0);
        opts.display.classList.toggle('done', left === 0);
      },
      start: function () {
        if (id !== null || left <= 0) return;
        try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
        endAt = Date.now() + left * 1000;
        id = setInterval(function () {
          left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
          api.render();
          if (left <= 0) { clearInterval(id); id = null; beep(3); if (opts.onEnd) opts.onEnd(); if (opts.onState) opts.onState(); }
        }, 200);
        if (opts.onState) opts.onState();
      },
      pause: function () {
        if (id === null) return;
        left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
        clearInterval(id); id = null; api.render();
        if (opts.onState) opts.onState();
      },
      reset: function (sec) {
        if (id !== null) { clearInterval(id); id = null; }
        if (sec != null) total = sec;
        left = total; api.render();
        if (opts.onState) opts.onState();
      }
    };
    api.render();
    return api;
  }

  /* 시작/일시정지/리셋 + 프리셋 버튼이 달린 기본 타이머 */
  function timerUI(root, cfg) {
    root.classList.add('timer');
    root.innerHTML =
      '<div class="time" aria-live="off">00:00</div>' +
      '<div class="timer-btns"></div>' +
      '<div class="presets"></div>';
    var display = $('.time', root), btns = $('.timer-btns', root), presets = $('.presets', root);
    var toggle;
    var timer = createTimer({
      display: display, seconds: cfg.defaultMinutes * 60,
      onState: function () { if (toggle) toggle.textContent = timer.running() ? '일시정지' : '시작'; }
    });
    toggle = button('시작', 'primary lg', function () { timer.running() ? timer.pause() : timer.start(); });
    btns.append(toggle, button('리셋', 'ghost', function () { timer.reset(); }));
    cfg.presetMinutes.forEach(function (m) {
      presets.append(button(m + '분', 'chip', function () {
        timer.reset(m * 60);
        $$('.chip', presets).forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
        this.setAttribute('aria-pressed', 'true');
      }));
    });
    var def = $$('.chip', presets).filter(function (c) { return c.textContent === cfg.defaultMinutes + '분'; })[0];
    if (def) def.setAttribute('aria-pressed', 'true');
    timer.render();
    return timer;
  }

  /* ---------------------------------------------------------------
   *  점수 입력 패드 (게임 섹션에 붙는 팀별 +/- 버튼)
   * ------------------------------------------------------------- */
  function scorePad(gameKey, steps, label) {
    var wrap = el('<div class="scorepad"><div class="pad-title">' + esc(label || '팀 점수') + '</div></div>');
    D.teams.forEach(function (t, i) {
      var row = el('<div class="sp-row" style="--c:' + esc(t.color) + '">' +
        '<span class="sp-name"><i class="dot"></i>' + nameTag(i) + '</span>' +
        '<span class="sp-val" data-val>0</span><span class="sp-btns"></span></div>');
      var b = $('.sp-btns', row);
      b.append(button('−1', 'minus', function () { Store.add(gameKey, i, -1); }));
      steps.forEach(function (s) { b.append(button('+' + s, 'plus', function () { Store.add(gameKey, i, s); })); });
      wrap.append(row);
    });
    function refresh() {
      $$('[data-val]', wrap).forEach(function (v, i) { v.textContent = Store.get(gameKey, i); });
    }
    Store.on(refresh); refresh();
    return wrap;
  }

  /* ---------------------------------------------------------------
   *  점수판 표
   * ------------------------------------------------------------- */
  function scoreboard(keys) {
    var games = D.scoreGames.filter(function (g) { return keys.indexOf(g.key) >= 0; });
    var html = '<div class="board-wrap"><table class="board"><thead><tr><th>팀</th>' +
      games.map(function (g) { return '<th>' + esc(g.label) + '</th>'; }).join('') +
      '<th>합계</th><th>순위</th></tr></thead><tbody>';
    D.teams.forEach(function (t, i) {
      html += '<tr style="--c:' + esc(t.color) + '"><th scope="row"><i class="dot"></i>' + nameTag(i) + '</th>';
      games.forEach(function (g) {
        html += '<td><input type="number" inputmode="numeric" step="1" data-game="' + g.key + '" data-team="' + i + '" aria-label="' +
          esc(t.name + ' ' + g.label) + ' 점수"></td>';
      });
      html += '<td class="sum" data-sum="' + i + '">0</td><td class="rank" data-rank="' + i + '">-</td></tr>';
    });
    html += '</tbody></table></div>';
    var root = el(html);
    $$('input', root).forEach(function (inp) {
      inp.addEventListener('change', function () {
        Store.set(inp.getAttribute('data-game'), Number(inp.getAttribute('data-team')), inp.value);
      });
    });
    function refresh() {
      $$('input', root).forEach(function (inp) {
        if (document.activeElement === inp) return;
        inp.value = Store.get(inp.getAttribute('data-game'), Number(inp.getAttribute('data-team')));
      });
      var tot = totals(keys), rk = ranks(tot);
      tot.forEach(function (v, i) {
        $('[data-sum="' + i + '"]', root).textContent = v;
        var r = $('[data-rank="' + i + '"]', root);
        r.textContent = rk[i];
        r.className = 'rank r' + rk[i];
      });
    }
    Store.on(refresh); refresh();
    return root;
  }

  /* ---------------------------------------------------------------
   *  공통 섹션 머리말
   * ------------------------------------------------------------- */
  function head(c) {
    return '<div class="sec-head">' +
      '<div class="kicker">' + (c.tag ? '<span class="tag">' + esc(c.tag) + '</span>' : '') +
      (c.no ? '<span class="no">' + esc(c.no) + '</span>' : '') + '</div>' +
      '<h2>' + esc(c.title) + '</h2>' +
      (c.subtitle ? '<p class="sub">' + esc(c.subtitle) + '</p>' : '') + '</div>';
  }

  /* ===============================================================
   *  섹션 정의
   * ============================================================= */
  var sections = [];
  function section(id, nav, build) { sections.push({ id: id, nav: nav, build: build }); }

  /* ---- 시작 ---- */
  section('intro', '시작', function (root) {
    root.classList.add('intro');
    root.innerHTML =
      '<div class="intro-inner">' +
      '<div class="orb o1"></div><div class="orb o2"></div><div class="orb o3"></div>' +
      '<p class="en">' + esc(D.event.en) + '</p>' +
      '<h1>' + esc(D.event.title) + '</h1>' +
      '<p class="tagline">' + esc(D.event.tagline) + '</p>' +
      '<div class="chips-row">' + D.event.chips.map(function (c) { return '<span class="pill">' + esc(c) + '</span>'; }).join('') + '</div>' +
      '<div class="intro-cta"></div>' +
      '<p class="hint">키보드 ← / → 로 다음 순서로 이동할 수 있어요</p></div>';
    $('.intro-cta', root).append(button('시작하기', 'primary lg', function () { scrollToId('agenda'); }));
  });

  /* ---- 진행 순서 ---- */
  section('agenda', '순서', function (root) {
    var A = D.agenda;
    var total = A.items.reduce(function (s, it) { return s + it.minutes; }, 0);
    root.innerHTML = head(A) + '<div class="agenda-grid"></div>' +
      '<p class="hint">합계 ' + total + '분</p>';
    var grid = $('.agenda-grid', root);
    A.items.forEach(function (it, idx) {
      var card = el('<button type="button" class="agenda-card"><span class="num">' + pad2(idx + 1) + '</span>' +
        '<span class="t">' + esc(it.title) + '</span><span class="m">' + it.minutes + '분</span></button>');
      card.addEventListener('click', function () { scrollToId(it.to); });
      grid.append(card);
    });
  });

  /* ---- 팀 구성 ---- */
  section('teams', '팀 구성', function (root) {
    var T = D.teamIntro;
    root.innerHTML = head(T) +
      '<div class="two-col">' +
      '<div class="card"><h3>' + D.teams.length + '개 팀</h3><div class="team-grid"></div>' +
      '<p class="muted">' + esc(T.note1) + '</p><p class="muted">' + esc(T.note2) + ' (아래 칸에서 바로 수정)</p></div>' +
      '<div class="card"><h3>공통 규칙</h3>' + list(T.rules) + '</div></div>';
    var grid = $('.team-grid', root);
    D.teams.forEach(function (t, i) {
      var c = el('<label class="team-card" style="--c:' + esc(t.color) + '"><i class="dot"></i>' +
        '<input type="text" maxlength="14" value="' + esc(teamName(i)) + '" aria-label="' + esc(t.name) + ' 이름">' +
        '<span class="size">' + t.size + '명</span></label>');
      var inp = $('input', c);
      inp.addEventListener('change', function () { Store.setName(i, inp.value); inp.value = teamName(i); });
      grid.append(c);
    });
  });

  /* ---- GAME 01 노래 믹스 퀴즈 ---- */
  section('song', '노래 퀴즈', function (root) {
    var S = D.song;
    root.innerHTML = head(S) +
      '<div class="two-col">' +
      '<div class="card"><h3>진행 방법</h3>' + list(S.howTo) + '</div>' +
      '<div class="card"><h3>문제 구성 예시</h3>' + list(S.composition) +
      '<p class="muted">' + esc(S.pointNote) + '</p>' +
      '<div class="lv-points">' + Object.keys(S.levelPoints).map(function (k) {
        return '<span class="lv lv-' + esc(k) + '">' + esc(k) + ' ' + S.levelPoints[k] + '점</span>';
      }).join('') + '</div></div></div>' +
      '<div class="filters"><div class="chipset" data-f="year"></div><div class="chipset" data-f="level"></div>' +
      '<button type="button" class="btn ghost sm" id="songToggleAll">정답 모두 보기</button></div>' +
      '<div class="round-grid"></div><div class="pad-slot"></div>';

    var years = ['전체'].concat(S.rounds.map(function (r) { return r.year; }).filter(function (v, i, a) { return a.indexOf(v) === i; }));
    var levels = ['전체'].concat(Object.keys(S.levelPoints));
    var filt = { year: '전체', level: '전체' };
    function makeChips(kind, items) {
      var host = $('[data-f="' + kind + '"]', root);
      items.forEach(function (v) {
        var c = button(v, 'chip', function () {
          filt[kind] = v;
          $$('.chip', host).forEach(function (x) { x.setAttribute('aria-pressed', String(x === c)); });
          apply();
        });
        c.setAttribute('aria-pressed', String(v === '전체'));
        host.append(c);
      });
    }
    makeChips('year', years); makeChips('level', levels);

    var grid = $('.round-grid', root);
    S.rounds.forEach(function (r, idx) {
      var card = el('<article class="round" data-year="' + esc(r.year) + '" data-level="' + esc(r.level) + '">' +
        '<header><span class="q">Q' + (idx + 1) + '</span>' +
        '<span class="lv lv-' + esc(r.level) + '">' + esc(r.level) + '</span>' +
        '<span class="yr">' + esc(r.year) + '</span></header>' +
        '<div class="player"></div>' +
        '<button type="button" class="btn ghost sm reveal">정답 보기</button>' +
        '<ol class="answers" hidden>' + (r.songs || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol></article>');
      var player = $('.player', card);
      if (r.audio) {
        var a = document.createElement('audio');
        a.controls = true; a.preload = 'none'; a.src = r.audio;
        player.append(a);
        a.addEventListener('error', function () {
          player.innerHTML = '<p class="muted warn-text">음원 파일을 찾을 수 없어요: ' + esc(r.audio) + '</p>';
        });
      } else {
        player.innerHTML = '<p class="muted">음원 없음 - data.js 의 audio 경로를 채워주세요</p>';
      }
      var ans = $('.answers', card), rev = $('.reveal', card);
      rev.addEventListener('click', function () {
        ans.hidden = !ans.hidden;
        rev.textContent = ans.hidden ? '정답 보기' : '정답 숨기기';
      });
      grid.append(card);
    });
    function apply() {
      $$('.round', grid).forEach(function (c) {
        var ok = (filt.year === '전체' || c.getAttribute('data-year') === filt.year) &&
                 (filt.level === '전체' || c.getAttribute('data-level') === filt.level);
        c.hidden = !ok;
      });
    }
    var allOpen = false;
    $('#songToggleAll', root).addEventListener('click', function () {
      allOpen = !allOpen;
      $$('.round', grid).forEach(function (c) {
        $('.answers', c).hidden = !allOpen;
        $('.reveal', c).textContent = allOpen ? '정답 숨기기' : '정답 보기';
      });
      this.textContent = allOpen ? '정답 모두 숨기기' : '정답 모두 보기';
    });
    var steps = Object.keys(S.levelPoints).map(function (k) { return S.levelPoints[k]; })
      .filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
    $('.pad-slot', root).append(scorePad('song', steps, '노래 퀴즈 점수'));
  });

  /* ---- GAME 02 이심전심 ---- */
  section('simsim', '이심전심', function (root) {
    var S = D.simsim;
    root.innerHTML = head(S) +
      '<div class="two-col">' +
      '<div class="card"><h3>진행 순서</h3><ol class="steps">' +
      S.steps.map(function (t, i) { return '<li><span class="n">' + (i + 1) + '</span>' + esc(t) + '</li>'; }).join('') +
      '</ol><p class="muted">' + esc(S.note) + '</p></div>' +
      '<div class="card stage-card"><h3>제시어</h3>' +
      '<div class="big-word" id="simWord">?</div>' +
      '<div class="countdown" id="simCount" aria-live="polite"></div>' +
      '<div class="btn-row"></div>' +
      '<div class="add-row"><input type="text" id="simAdd" placeholder="즉석 제시어 추가" maxlength="20"><button type="button" class="btn ghost sm" id="simAddBtn">추가</button></div>' +
      '<div class="used" id="simUsed"></div></div></div>' +
      '<div class="pad-slot"></div>';

    var deck = shuffle(S.words), used = [];
    var wordEl = $('#simWord', root), countEl = $('#simCount', root), usedEl = $('#simUsed', root);
    var cdTimer = null;
    function nextWord() {
      if (!deck.length) { deck = shuffle(S.words.concat(extra)); used = []; }
      var w = deck.pop();
      used.push(w);
      wordEl.textContent = w;
      wordEl.classList.remove('pop'); void wordEl.offsetWidth; wordEl.classList.add('pop');
      countEl.textContent = '';
      usedEl.innerHTML = '<span class="muted">나온 제시어</span> ' + used.map(function (u) { return '<span class="pill sm">' + esc(u) + '</span>'; }).join('');
      if (cdTimer) { clearTimeout(cdTimer); cdTimer = null; }
    }
    var extra = [];
    function countdown() {
      if (cdTimer) clearTimeout(cdTimer);
      var seq = S.countdown, i = 0;
      (function step() {
        countEl.textContent = seq[i];
        countEl.classList.remove('pop'); void countEl.offsetWidth; countEl.classList.add('pop');
        i++;
        if (i < seq.length) cdTimer = setTimeout(step, 900); else cdTimer = null;
      })();
    }
    var row = $('.btn-row', root);
    row.append(button('제시어 뽑기', 'primary lg', nextWord), button('“하나, 둘, 셋!”', 'accent lg', countdown));
    $('#simAddBtn', root).addEventListener('click', addCustom);
    $('#simAdd', root).addEventListener('keydown', function (e) { if (e.key === 'Enter') addCustom(); });
    function addCustom() {
      var inp = $('#simAdd', root), v = inp.value.trim();
      if (!v) return;
      extra.push(v); deck.push(v); inp.value = '';
      nextWord();
    }
    $('.pad-slot', root).append(scorePad('simsim', [1, 2, 3, 4, 5], '이심전심 점수 (같은 동작 인원수)'));
  });

  /* ---- MID GAME A4 퍼즐 ---- */
  section('puzzle', 'A4 퍼즐', function (root) {
    var P = D.puzzle;
    root.innerHTML = head(P) +
      '<div class="two-col">' +
      '<div class="card"><h3>규칙</h3>' + list(P.rules) + '</div>' +
      '<div class="card"><h3>준비물</h3>' + list(P.supplies) + '<p class="muted">' + esc(P.note) + '</p></div></div>' +
      '<div class="card center"><div class="timer-slot"></div>' +
      '<div class="winner-row"><label for="puzzleWinner">우승자</label><input type="text" id="puzzleWinner" placeholder="이름을 적어두세요" maxlength="20"></div></div>';
    timerUI($('.timer-slot', root), P);
    var inp = $('#puzzleWinner', root);
    inp.value = Store.s.puzzleWinner;
    inp.addEventListener('input', function () { Store.setPuzzleWinner(inp.value); });
  });

  /* ---- GAME 03 몸으로 말해요 ---- */
  section('charades', '몸으로 말해요', function (root) {
    var C = D.charades;
    root.innerHTML = head(C) +
      '<div class="two-col">' +
      '<div class="card"><h3>진행 방법</h3>' + list(C.howTo) + '</div>' +
      '<div class="card"><h3>주제 선택</h3>' + list(C.topics) + '<p class="muted">' + esc(C.timeNote) + '</p></div></div>' +
      '<div class="card play">' +
      '<div class="play-top"><div><div class="lbl">주제</div><div class="chipset" id="chCat"></div></div>' +
      '<div><div class="lbl">도전 팀</div><div class="chipset" id="chTeam"></div></div>' +
      '<div><div class="lbl">제한 시간</div><div class="chipset" id="chSec"></div></div></div>' +
      '<div class="play-main"><div class="time" id="chTime">00:00</div>' +
      '<div class="word-card" id="chWordCard"><div class="word" id="chWord">시작 버튼을 누르세요</div>' +
      '<button type="button" class="btn ghost sm" id="chPeek">단어 보기 (설명자만)</button></div></div>' +
      '<div class="btn-row" id="chBtns"></div>' +
      '<div class="result" id="chResult" hidden></div></div>' +
      '<div class="pad-slot"></div>';

    var st = { cat: '전체', team: 0, sec: C.defaultSeconds, pool: [], correct: 0, pass: 0, playing: false, applied: false };
    function chipset(host, items, cur, onPick) {
      host.innerHTML = '';
      items.forEach(function (it) {
        var c = button(it.label, 'chip', function () {
          if (st.playing) return;
          onPick(it.value);
          $$('.chip', host).forEach(function (x) { x.setAttribute('aria-pressed', String(x === c)); });
        });
        c.setAttribute('aria-pressed', String(it.value === cur));
        if (it.team != null) c.style.setProperty('--c', D.teams[it.team].color);
        if (it.team != null) c.innerHTML = '<i class="dot"></i>' + nameTag(it.team);
        host.append(c);
      });
    }
    chipset($('#chCat', root), [{ label: '전체', value: '전체' }].concat(C.categories.map(function (c) { return { label: c.name, value: c.name }; })), '전체', function (v) { st.cat = v; });
    chipset($('#chTeam', root), D.teams.map(function (t, i) { return { label: t.name, value: i, team: i }; }), 0, function (v) { st.team = v; st.applied = false; });
    chipset($('#chSec', root), C.presetSeconds.map(function (s) { return { label: (s / 60) + '분', value: s }; }), C.defaultSeconds, function (v) { st.sec = v; timer.reset(v); });

    var wordEl = $('#chWord', root), peek = $('#chPeek', root), res = $('#chResult', root), btns = $('#chBtns', root);
    var shown = false;
    function setShown(v) { shown = v; $('#chWordCard', root).classList.toggle('hide', !v); peek.textContent = v ? '단어 가리기' : '단어 보기 (설명자만)'; }
    peek.addEventListener('click', function () { if (st.playing) setShown(!shown); });

    function poolFor() {
      var words = [];
      C.categories.forEach(function (c) { if (st.cat === '전체' || c.name === st.cat) words = words.concat(c.words); });
      return shuffle(words);
    }
    function nextWord() {
      if (!st.pool.length) st.pool = poolFor();
      wordEl.textContent = st.pool.pop();
      setShown(false);
    }
    var timer = createTimer({
      display: $('#chTime', root), seconds: C.defaultSeconds,
      onEnd: function () { finish(); },
      onState: syncBtns
    });
    function begin() {
      st.correct = 0; st.pass = 0; st.pool = poolFor(); st.playing = true; st.applied = false;
      res.hidden = true;
      timer.reset(st.sec);
      nextWord();
      timer.start();
      syncBtns();
    }
    function finish() {
      st.playing = false;
      timer.pause();
      wordEl.textContent = '시간 종료!';
      $('#chWordCard', root).classList.remove('hide');
      showResult();
      syncBtns();
    }
    function showResult() {
      res.hidden = false;
      res.innerHTML = '<div class="big-num">' + st.correct + '<small>개 정답</small></div>' +
        '<div class="muted">' + nameTag(st.team) + ' / 패스 ' + st.pass + '회</div><div class="res-btn"></div>';
      var b = button('점수판에 +' + st.correct + ' 반영', 'primary', function () {
        if (st.applied) return;
        st.applied = true; Store.add('charades', st.team, st.correct);
        b.textContent = '반영 완료'; b.disabled = true;
      });
      if (!st.correct) b.disabled = true;
      $('.res-btn', res).append(b);
    }
    function syncBtns() {
      btns.innerHTML = '';
      if (!st.playing) {
        btns.append(button('시작', 'primary lg', begin));
        return;
      }
      btns.append(
        button('정답', 'ok lg', function () { st.correct++; nextWord(); }),
        button('패스', 'ghost lg', function () { st.pass++; nextWord(); }),
        button(timer.running() ? '일시정지' : '계속', 'ghost', function () { timer.running() ? timer.pause() : timer.start(); }),
        button('종료', 'danger', finish)
      );
    }
    syncBtns();
    $('.pad-slot', root).append(scorePad('charades', [1, 2, 3], '몸으로 말해요 점수'));
  });

  /* ---- GAME 04 텔레파시 ---- */
  function calcTelepathy(answers) {
    var norm = function (a) { return String(a || '').replace(/\s+/g, '').toLowerCase(); };
    var vals = answers.map(norm), counts = {}, kinds = 0;
    vals.forEach(function (v) { if (!v) return; if (!counts[v]) { counts[v] = 0; kinds++; } counts[v]++; });
    var base = answers.length + 1, pts = base - kinds;
    return {
      base: base, kinds: kinds, pts: pts,
      per: vals.map(function (v) { return v && counts[v] === 1 ? pts : 0; }),
      dup: vals.map(function (v) { return v && counts[v] > 1; })
    };
  }
  section('telepathy', '텔레파시', function (root) {
    var T = D.telepathy;
    root.innerHTML = head(T) +
      '<div class="two-col">' +
      '<div class="card"><h3>진행 방법</h3>' + list(T.howTo) + '</div>' +
      '<div class="card formula"><h3>점수 계산</h3>' +
      '<div class="formula-box"><strong>' + esc(T.formula[0]) + '</strong><span>' + esc(T.formula[1]) + '</span></div>' +
      '<div class="ex" id="telEx"></div></div></div>' +
      '<div class="card play"><div class="play-top"><div><div class="lbl">제시어</div><div class="tel-prompt" id="telPrompt">-</div></div>' +
      '<div class="btn-row"></div></div>' +
      '<div class="tel-grid" id="telGrid"></div><div class="tel-sum" id="telSum"></div>' +
      '<div class="btn-row" id="telBtns"></div></div>' +
      '<p class="hint">' + esc(T.exampleNote) + '</p>';

    /* 예시 계산 */
    var ex = calcTelepathy(T.exampleAnswers.slice(0, D.teams.length));
    var counts = {};
    T.exampleAnswers.forEach(function (a) { counts[a] = (counts[a] || 0) + 1; });
    $('#telEx', root).innerHTML =
      '<p class="muted">예시: ' + T.exampleAnswers.map(function (a, i) { return (D.teams[i] ? D.teams[i].name : '') + ' ' + esc(a); }).join(' / ') + '</p>' +
      '<p>기본 ' + ex.base + '점 − ' + ex.kinds + '종류 = <b>' + ex.pts + '점</b></p>' +
      '<p class="muted">중복되지 않은 답을 낸 팀만 ' + ex.pts + '점 획득</p>';

    var deck = shuffle(T.prompts);
    var promptEl = $('#telPrompt', root);
    $('.play-top .btn-row', root).append(button('다음 제시어', 'primary', function () {
      if (!deck.length) deck = shuffle(T.prompts);
      promptEl.textContent = deck.pop();
    }));

    var grid = $('#telGrid', root), sum = $('#telSum', root), btns = $('#telBtns', root);
    var inputs = [], outs = [], applied = false, lastRes = null;
    D.teams.forEach(function (t, i) {
      var row = el('<label class="tel-row" style="--c:' + esc(t.color) + '"><span class="who"><i class="dot"></i>' + nameTag(i) + '</span>' +
        '<input type="text" maxlength="20" placeholder="답변 입력" autocomplete="off"><span class="out"></span></label>');
      inputs.push($('input', row)); outs.push($('.out', row));
      $('input', row).addEventListener('input', function () { applied = false; recalc(); });
      grid.append(row);
    });
    function recalc() {
      lastRes = calcTelepathy(inputs.map(function (x) { return x.value; }));
      lastRes.per.forEach(function (p, i) {
        outs[i].textContent = !inputs[i].value.trim() ? '' : (lastRes.dup[i] ? '중복 0점' : '+' + p);
        outs[i].className = 'out ' + (lastRes.dup[i] ? 'dup' : (p ? 'gain' : ''));
      });
      var any = inputs.some(function (x) { return x.value.trim(); });
      sum.innerHTML = any ? '기본 ' + lastRes.base + '점 − 서로 다른 답 ' + lastRes.kinds + '종류 = <b>' + lastRes.pts + '점</b> (중복 없는 팀만 획득)' : '팀별 답변을 입력하면 점수가 자동 계산돼요.';
      applyBtn.disabled = !any || applied || !lastRes.per.some(function (p) { return p > 0; });
      applyBtn.textContent = applied ? '반영 완료' : '점수판에 반영';
    }
    var applyBtn = button('점수판에 반영', 'primary', function () {
      if (applied || !lastRes) return;
      lastRes.per.forEach(function (p, i) { if (p) Store.add('telepathy', i, p); });
      applied = true; recalc();
    });
    btns.append(applyBtn, button('다음 라운드 (입력 지우기)', 'ghost', function () {
      inputs.forEach(function (x) { x.value = ''; }); applied = false; recalc();
    }));
    recalc();
  });

  /* ---- 휴식 & 중간 집계 ---- */
  section('break', '중간 집계', function (root) {
    var B = D.breakTime;
    root.innerHTML = head(B) + '<div class="card"><div class="board-slot"></div></div>' +
      '<div class="card center"><div class="timer-slot"></div></div><p class="hint">' + esc(B.note) + '</p>';
    $('.board-slot', root).append(scoreboard(D.interimKeys));
    timerUI($('.timer-slot', root), B);
  });

  /* ---- FINAL GAME 보물찾기 ---- */
  section('treasure', '보물찾기', function (root) {
    var T = D.treasure;
    root.innerHTML = head(T) +
      '<div class="kind-grid">' + T.kinds.map(function (k) {
        return '<div class="kind"><div class="k-name">' + esc(k.name) + '</div><div class="k-desc">' + esc(k.desc) + '</div></div>';
      }).join('') + '</div>' +
      '<div class="two-col"><div class="card"><h3>규칙</h3>' + list(T.rules) + '</div>' +
      '<div class="card center"><div class="timer-slot"></div></div></div><div class="pad-slot"></div>';
    timerUI($('.timer-slot', root), T);
    $('.pad-slot', root).append(scorePad('treasure', T.steps, '보물찾기 점수'));
  });

  /* ---- 최종 집계 & 룰렛 ---- */
  var WHEEL_COLORS = ['#ff6b8b', '#ffb84d', '#4ee0b5', '#5cc8ff', '#b18cff', '#ff8f5c', '#7ee081', '#f06ad8'];
  section('final', '최종 / 룰렛', function (root) {
    var F = D.final, allKeys = D.scoreGames.map(function (g) { return g.key; });
    root.innerHTML = head(F) +
      '<div class="two-col">' +
      '<div class="card"><h3>' + esc(F.step1Title) + '</h3>' + list(F.step1) + '</div>' +
      '<div class="card"><h3>' + esc(F.step2Title) + '</h3>' + list(F.step2) + '</div></div>' +
      '<div class="card"><div class="board-slot"></div>' +
      '<div class="btn-row"><button type="button" class="btn primary lg" id="revealBtn">최종 결과 발표</button></div>' +
      '<ol class="podium" id="podium" hidden></ol></div>' +
      '<div class="card roulette"><h3>꼴찌 팀 룰렛</h3><div class="rou-grid">' +
      '<div class="wheel-box"><div class="pointer"></div><canvas id="wheel" width="520" height="520" aria-label="룰렛"></canvas></div>' +
      '<div class="rou-side"><label class="lbl" for="rouTeam">대상 팀</label><select id="rouTeam"></select>' +
      '<label class="lbl" for="rouList">후보 (한 줄에 한 명, 직접 수정 가능)</label><textarea id="rouList" rows="8"></textarea>' +
      '<div class="btn-row"><button type="button" class="btn primary lg" id="spinBtn">룰렛 돌리기</button></div>' +
      '<div class="rou-result" id="rouResult" aria-live="polite"></div></div></div></div>';

    $('.board-slot', root).append(scoreboard(allKeys));

    /* ---- 최종 발표 ---- */
    var podium = $('#podium', root), revealing = false, lastPlace = [];
    $('#revealBtn', root).addEventListener('click', function () {
      if (revealing) return;
      revealing = true;
      var tot = totals(allKeys), rk = ranks(tot);
      var order = D.teams.map(function (_, i) { return i; }).sort(function (a, b) { return rk[b] - rk[a] || b - a; });
      var maxRank = Math.max.apply(null, rk);
      lastPlace = order.filter(function (i) { return rk[i] === maxRank; });
      podium.hidden = false; podium.innerHTML = '';
      var k = 0;
      (function step() {
        var i = order[k];
        var li = el('<li class="pd r' + rk[i] + '" style="--c:' + esc(D.teams[i].color) + '"><span class="rk">' + rk[i] + '위</span>' +
          '<span class="nm"><i class="dot"></i>' + nameTag(i) + '</span><span class="pt">' + tot[i] + '점</span></li>');
        podium.prepend(li);
        k++;
        if (k < order.length) setTimeout(step, 1100);
        else { revealing = false; if (rk[i] === 1) confetti(); selectAutoTeam(); }
      })();
    });

    /* ---- 룰렛 ---- */
    var sel = $('#rouTeam', root), ta = $('#rouList', root), cv = $('#wheel', root), ctx = cv.getContext('2d');
    sel.innerHTML = '<option value="auto">최하위 팀 (자동)</option>' + D.teams.map(function (_, i) {
      return '<option value="' + i + '" data-team-name="' + i + '">' + esc(teamName(i)) + '</option>';
    }).join('') + '<option value="all">전체 참가자</option>';
    function fillList() {
      var v = sel.value, names = [];
      if (v === 'auto') {
        var tot = totals(allKeys), rk = ranks(tot), mx = Math.max.apply(null, rk);
        D.teams.forEach(function (_, i) { if (rk[i] === mx) names = names.concat(teamMembers(i)); });
      } else if (v === 'all') {
        D.teams.forEach(function (_, i) { names = names.concat(teamMembers(i)); });
      } else { names = teamMembers(Number(v)); }
      ta.value = names.join('\n');
      rot = 0; draw();
    }
    function selectAutoTeam() { sel.value = 'auto'; fillList(); scrollToId('final'); }
    function candidates() { return ta.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean); }

    var rot = 0, spinning = false;
    function draw() {
      var names = candidates(), n = Math.max(names.length, 1), R = cv.width / 2, seg = Math.PI * 2 / n;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.save(); ctx.translate(R, R); ctx.rotate(rot);
      for (var i = 0; i < n; i++) {
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R - 6, i * seg, (i + 1) * seg); ctx.closePath();
        ctx.fillStyle = WHEEL_COLORS[i % WHEEL_COLORS.length]; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = '#0f1020'; ctx.stroke();
        if (names[i]) {
          ctx.save(); ctx.rotate(i * seg + seg / 2); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
          ctx.fillStyle = '#10112a';
          ctx.font = '700 ' + Math.max(14, Math.min(30, 220 / Math.sqrt(n) / 1.4)) + 'px Pretendard Variable, Pretendard, system-ui, sans-serif';
          ctx.fillText(names[i].length > 10 ? names[i].slice(0, 9) + '…' : names[i], R - 28, 0);
          ctx.restore();
        }
      }
      ctx.restore();
      ctx.beginPath(); ctx.arc(R, R, 34, 0, Math.PI * 2); ctx.fillStyle = '#0f1020'; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = '#ffb84d'; ctx.stroke();
    }
    sel.addEventListener('change', fillList);
    ta.addEventListener('input', function () { rot = 0; draw(); });
    $('#spinBtn', root).addEventListener('click', function () {
      var names = candidates();
      if (spinning || names.length < 2) { if (names.length < 2) $('#rouResult', root).textContent = '후보를 2명 이상 입력해주세요.'; return; }
      spinning = true;
      $('#rouResult', root).textContent = '';
      var n = names.length, seg = Math.PI * 2 / n, pick = randInt(n);
      var jitter = (Math.random() - 0.5) * seg * 0.7;
      var target = -Math.PI / 2 - (pick + 0.5) * seg + jitter;
      var cur = ((rot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      var tgt = ((target % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      var delta = ((tgt - cur) + Math.PI * 2) % (Math.PI * 2) + Math.PI * 2 * (5 + randInt(3));
      var start = rot, dur = 5200, t0 = performance.now();
      (function frame(now) {
        var p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 4);
        rot = start + delta * e; draw();
        if (p < 1) requestAnimationFrame(frame);
        else {
          spinning = false;
          $('#rouResult', root).innerHTML = '<span class="muted">당첨</span> <strong>' + esc(names[pick]) + '</strong>';
          confetti();
        }
      })(t0);
    });
    fillList();
  });

  /* ---- 최종 미션 & 마무리 ---- */
  section('mission', '미션 / 마무리', function (root) {
    var M = D.mission, E = D.event;
    root.innerHTML = head(M) +
      '<div class="two-col">' + M.options.map(function (o) {
        return '<div class="card option"><span class="opt-label">' + esc(o.label) + '</span><p>' + esc(o.text) + '</p></div>';
      }).join('') + '</div>' + list(M.notes) +
      '<div class="closing"><h2>' + esc(E.closingTitle) + '</h2><p class="big">' + esc(E.title) + '</p>' +
      '<p class="sub">' + esc(E.closingSub) + '</p><p class="thanks">' + esc(E.closingThanks) + '</p></div>';
  });

  /* ---------------------------------------------------------------
   *  confetti (가벼운 캔버스 효과)
   * ------------------------------------------------------------- */
  function confetti() {
    var cv = $('#confetti'), ctx = cv.getContext('2d');
    cv.width = window.innerWidth; cv.height = window.innerHeight; cv.style.display = 'block';
    var cols = ['#ff6b8b', '#ffb84d', '#4ee0b5', '#5cc8ff', '#b18cff', '#fff'];
    var ps = [];
    for (var i = 0; i < 150; i++) {
      ps.push({ x: cv.width / 2 + (Math.random() - 0.5) * 200, y: cv.height * 0.6,
        vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 18 - 6,
        s: 6 + Math.random() * 6, c: cols[i % cols.length], r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4 });
    }
    var t0 = performance.now();
    (function loop(now) {
      ctx.clearRect(0, 0, cv.width, cv.height);
      ps.forEach(function (p) {
        p.vy += 0.45; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); ctx.restore();
      });
      if (now - t0 < 3600) requestAnimationFrame(loop);
      else { ctx.clearRect(0, 0, cv.width, cv.height); cv.style.display = 'none'; }
    })(t0);
  }

  /* ---------------------------------------------------------------
   *  페이지 조립
   * ------------------------------------------------------------- */
  document.title = D.event.title + ' ' + D.event.en;
  $('#brand').textContent = D.event.title;
  var app = $('#app'), nav = $('#nav');
  sections.forEach(function (s) {
    var node = document.createElement('section');
    node.id = s.id; node.className = 'panel'; node.setAttribute('data-sec', s.id);
    var inner = document.createElement('div'); inner.className = 'inner';
    node.append(inner); app.append(node);
    s.build(s.id === 'intro' ? node : inner);
    var a = document.createElement('a');
    a.href = '#' + s.id; a.textContent = s.nav; a.setAttribute('data-nav', s.id);
    nav.append(a);
  });

  /* 현재 위치 표시 */
  var current = 'intro';
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          current = e.target.id;
          $$('#nav a').forEach(function (a) {
            var on = a.getAttribute('data-nav') === current;
            a.classList.toggle('on', on);
            if (on) {
              var box = nav.getBoundingClientRect(), r = a.getBoundingClientRect();
              if (r.left < box.left || r.right > box.right) nav.scrollLeft += (r.left - box.left) - box.width / 3;
            }
          });
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    $$('.panel').forEach(function (p) { io.observe(p); });
  }

  /* 키보드 이동 */
  document.addEventListener('keydown', function (e) {
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag) || e.ctrlKey || e.metaKey || e.altKey) return;
    var ids = sections.map(function (s) { return s.id; }), i = ids.indexOf(current);
    if (e.key === 'ArrowRight') { scrollToId(ids[Math.min(ids.length - 1, i + 1)]); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { scrollToId(ids[Math.max(0, i - 1)]); e.preventDefault(); }
  });

  /* 점수판 다이얼로그 */
  var dlg = $('#scoreDialog');
  $('#dlgBoard').append(scoreboard(D.scoreGames.map(function (g) { return g.key; })));
  $('#fab').addEventListener('click', function () { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); });
  $('#dlgClose').addEventListener('click', function () { dlg.close ? dlg.close() : dlg.removeAttribute('open'); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  $('#undoBtn').addEventListener('click', function () { Store.undo(); });
  $('#resetBtn').addEventListener('click', function () {
    if (window.confirm('모든 팀의 점수를 0으로 초기화할까요?')) Store.reset();
  });

  Store.emit();
})();
