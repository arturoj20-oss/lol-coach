// Vista Ajustes: toda la configuracion, claves y prueba del overlay
'use strict';

App.register('settings', {
  channels: ['config', 'state', 'champions'],

  mount(el) {
    this.el = el;
    const roles = ['', 'top', 'jungle', 'mid', 'adc', 'support'];
    setHtml(el, html`<div class="view-pad settings">
      <div class="view-head"><h1 class="title">Ajustes</h1><span class="muted">Los cambios se guardan al momento</span></div>
      <div class="settings-grid">
        <section class="card">
          <div class="card-head"><h2>General</h2></div>
          <div class="field"><span class="label">Tema</span>
            <div class="seg theme-seg" role="group" aria-label="Tema">
              <button type="button" data-theme-opt="dark">${raw(SVG.moon)}Oscuro</button>
              <button type="button" data-theme-opt="light">${raw(SVG.sun)}Claro</button>
              <button type="button" data-theme-opt="system" data-tip="Sigue el modo claro u oscuro de Windows">${raw(SVG.monitor)}Sistema</button>
            </div></div>
          <div class="sep"></div>
          <label class="switch"><input type="checkbox" data-k="autoAccept"><span>Aceptar partida automáticamente</span></label>
          <div class="field set-range">
            <span class="label">Retraso antes de aceptar</span>
            <div class="range-row"><input class="range" type="range" min="0" max="10" step="1" data-k="acceptDelay" aria-label="Retraso antes de aceptar"><output class="num" data-out="acceptDelay"></output></div>
          </div>
          <label class="check"><input type="checkbox" data-k="startWithWindows"><span>Iniciar con Windows (minimizado en la bandeja)</span></label>
          <div class="update-row"><p class="muted small set-hint grow" data-update></p><button type="button" class="btn small" data-act="checkUpdate">Buscar actualizaciones</button></div>
          <div class="sep"></div>
          <div class="field set-range">
            <span class="label">Objetivo de farmeo</span>
            <label class="check"><input type="checkbox" data-k="csAuto"><span>Automático según tu campeón y tu posición</span></label>
            <p class="muted small set-hint">CS medio de tu campeón en esa posición (U.GG, Esmeralda+) según la duración de tus partidas. Si no hay datos, se usa el valor manual.</p>
            <div class="range-row" data-cs-manual><input class="range" type="range" min="1" max="10" step="0.5" data-k="csTarget" aria-label="Objetivo manual de CS por minuto"><output class="num" data-out="csTarget"></output></div>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2>Selección de campeones</h2></div>
          <div class="set-two">
            <div class="field"><span class="label">Preseleccionar</span><div data-slot="pick"></div></div>
            <div class="field"><span class="label">Banear</span><div data-slot="ban"></div></div>
          </div>
          <label class="check"><input type="checkbox" data-k="autoLock"><span>Bloquear el campeón automáticamente</span></label>
          <div class="field"><span class="label">Rol para las recomendaciones</span>
            <div class="seg role-seg" role="group" aria-label="Rol">${roles.map(r => html`<button type="button" data-role="${r}">${r ? roleName(r) : 'Auto'}</button>`)}</div></div>
          <div class="field"><span class="label">Importar al bloquear</span>
            <div class="checks-row">
              <label class="check"><input type="checkbox" data-k="autoImport.runes"><span>Runas</span></label>
              <label class="check"><input type="checkbox" data-k="autoImport.spells"><span>Hechizos</span></label>
              <label class="check"><input type="checkbox" data-k="autoImport.items"><span>Objetos</span></label>
            </div></div>
          <div class="sep"></div>
          <div class="field"><div class="key-head"><label class="check"><input type="checkbox" data-k="otpBuilds"><span>Descargar datos de mains con mi clave de Riot</span></label><span class="key-badge" data-otp-badge></span></div>
            <p class="muted small set-hint">La app ya trae datos de mains (los 3 más activos de cada campeón en EUW, KR y NA): sus builds van a la lista y sus enfrentamientos a «Tu enfrentamiento», también con esto desactivado. Activado, descarga con tu clave de Riot los campeones que falten y pone al día los que ya trae. Va en segundo plano (cerca de 1 hora por campeón); empieza por tus campeones y el que estés viendo.</p>
            <p class="muted small" data-otp-status></p></div>
        </section>

        <section class="card">
          <div class="card-head"><h2>Overlay en partida</h2><span class="spacer"></span><span class="test-wrap"><button class="btn small" data-act="testOverlay">Probar overlay</button></span></div>
          <div class="notice set-hint">${raw(SVG.info)}<span class="grow">Pon el juego en «Sin bordes» o «Ventana». En pantalla completa no se ve.</span></div>
          <label class="switch"><input type="checkbox" data-k="overlay.enabled"><span>Mostrar overlay durante la partida</span></label>
          <div class="key-head"><label class="check"><input type="checkbox" data-k="gameCampTimers"><span>Activar en el juego los timers de campamentos del minimapa</span></label><span class="key-badge" data-camp-badge></span></div>
          <div class="overlay-opts">
            <div class="field"><span class="label">Información</span>
              <div class="checks-col">
                <label class="check"><input type="checkbox" data-k="overlay.objectives"><span>Aviso 90 s antes de dragón, Barón, larvas y Heraldo</span></label>
                <label class="check"><input type="checkbox" data-k="overlay.goldDiff"><span>Oro por línea al pulsar Tab</span></label>
                <label class="check"><input type="checkbox" data-k="overlay.cs"><span>CS al pulsar Tab (tuyo y diferencia por línea)</span></label>
                <label class="check"><input type="checkbox" data-k="overlay.skillOrder"><span>Flecha encima de la habilidad a subir</span></label>
              </div></div>
            <div class="checks-col">
              <label class="check"><input type="checkbox" data-k="overlay.sound"><span>Sonido en los avisos</span></label>
              <div class="field"><span class="label">Lado de la pantalla</span>
                <div class="seg side-seg"><button type="button" data-side="left">Izquierda</button><button type="button" data-side="right">Derecha</button></div></div>
              <div class="field set-range"><span class="label">Tamaño</span>
                <div class="range-row"><input class="range" type="range" min="0.8" max="1.4" step="0.1" data-k="overlay.scale" aria-label="Tamaño del overlay"><output class="num" data-out="overlay.scale"></output></div></div>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2>Claves e IA</h2></div>
          ${this.keyField('riot', 'Riot Games', 'Para rango, historial, scouting y análisis. Consíguela en developer.riotgames.com.', 'RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')}
          <div class="sep"></div>
          <div class="field"><div class="key-head"><span class="label">Coach con IA</span><span class="key-badge" data-ai-badge></span></div>
            <div class="seg ai-seg"><button type="button" data-ai="local">Claude local</button><button type="button" data-ai="api">API de Anthropic</button></div>
            <div class="muted small">Consejos en la selección y análisis de partidas. «Claude local» usa tu Claude Code, sin clave.</div></div>
          ${this.keyField('anthropic', 'Anthropic (API)', 'Solo hace falta si eliges «API de Anthropic».', 'sk-ant-...')}
          <p class="muted small key-note">Las claves se guardan cifradas en este equipo y no se muestran después de guardarlas.</p>
        </section>
      </div>
    </div>`);

    // Selectores de campeon
    const owned = () => { const ids = new Set(App.data.champions?.owned || []); return (App.data.champions?.all || []).filter(c => ids.has(c.id)); };
    this.pick = ChampPicker({ source: owned, label: 'Campeón preseleccionado', onChange: v => window.api.setConfig({ pick: v }) });
    this.ban = ChampPicker({ source: () => App.data.champions?.all || [], label: 'Campeón a banear', onChange: v => window.api.setConfig({ ban: v }) });
    $('[data-slot="pick"]', el).replaceWith(this.pick.el);
    $('[data-slot="ban"]', el).replaceWith(this.ban.el);

    el.addEventListener('change', e => this.onChange(e.target));
    el.addEventListener('input', e => { if (e.target.type === 'range') this.paintOutput(e.target.dataset.k, +e.target.value); });
    el.addEventListener('click', e => {
      const role = e.target.closest('[data-role]');
      if (role) return window.api.setConfig({ role: role.dataset.role });
      const side = e.target.closest('[data-side]');
      if (side) return window.api.setConfig({ overlay: { side: side.dataset.side } });
      const theme = e.target.closest('[data-theme-opt]');
      if (theme) {
        // Se aplica al momento sin esperar a que vuelva la configuracion
        Theme.set(theme.dataset.themeOpt);
        $$('[data-theme-opt]', this.el).forEach(b => b.classList.toggle('on', b === theme));
        return window.api.setConfig({ theme: theme.dataset.themeOpt });
      }
      const ai = e.target.closest('[data-ai]');
      if (ai) return window.api.setConfig({ ai: ai.dataset.ai });
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'testOverlay') {
        window.api.action('testOverlay').then(() => App.toast('Overlay de prueba visible durante 10 s', 'ok')).catch(err => App.toast(err.message, 'error'));
      }
      if (act.dataset.act === 'saveKey') this.saveKey(act.dataset.name);
      if (act.dataset.act === 'checkUpdate') {
        // El aviso de «al día» vuelve a salir tras una comprobacion pedida a mano
        App.updateToastShown = false;
        window.api.action('checkUpdate').catch(err => App.toast(err.message, 'error'));
      }
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.dataset.secret) this.saveKey(e.target.dataset.secret);
    });
    this.apply();
  },

  keyField(name, label, hint, placeholder) {
    return html`<div class="key-field" data-key="${name}">
      <div class="key-head"><span class="label">${label}</span><span class="key-badge"></span></div>
      <div class="key-row">
        <input class="input" type="password" placeholder="${placeholder}" data-secret="${name}" autocomplete="off" spellcheck="false" aria-label="Clave de ${label}">
        <button class="btn" data-act="saveKey" data-name="${name}">Guardar</button>
      </div>
      <div class="key-msg muted small">${hint}</div>
    </div>`;
  },

  update(channel) {
    if (channel === 'champions') { this.pick.refresh(); this.ban.refresh(); return; }
    this.apply();
  },

  // Rellena los controles con la configuracion actual (sin pisar lo que se esta tocando)
  apply() {
    const c = App.data.config;
    if (!c) return;
    const get = k => k.split('.').reduce((o, p) => o?.[p], c);
    for (const input of $$('[data-k]', this.el)) {
      if (input === document.activeElement && input.type !== 'checkbox') continue;
      const v = get(input.dataset.k);
      if (input.type === 'checkbox') input.checked = !!v;
      else input.value = v ?? '';
      if (input.type === 'range') this.paintOutput(input.dataset.k, +v);
    }
    // Con el objetivo automatico, el manual solo es el de respaldo: se ve atenuado
    $('[data-cs-manual]', this.el)?.classList.toggle('is-fallback', c.csAuto !== false);
    $$('[data-role]', this.el).forEach(b => b.classList.toggle('on', b.dataset.role === (c.role || '')));
    $$('[data-side]', this.el).forEach(b => b.classList.toggle('on', b.dataset.side === c.overlay?.side));
    $$('[data-ai]', this.el).forEach(b => b.classList.toggle('on', b.dataset.ai === (c.ai || 'local')));
    $$('[data-theme-opt]', this.el).forEach(b => b.classList.toggle('on', b.dataset.themeOpt === (c.theme || 'dark')));
    const camp = App.data.state?.campTimers;
    setHtml($('[data-camp-badge]', this.el), camp == null ? html`<span class="tag">Sin cliente</span>`
      : camp ? html`<span class="tag green">${raw(SVG.check)}Activados</span>` : html`<span class="tag red">Desactivados</span>`);
    const otp = App.data.state?.otp;
    const hasRiot = !!App.data.state?.keys?.riot;
    setHtml($('[data-otp-badge]', this.el), !c.otpBuilds ? '' : !hasRiot ? html`<span class="tag red">Falta la clave de Riot</span>`
      : otp?.worker ? html`<span class="tag green" data-tip="Lo descarga el programa de fondo (npm run mains-worker:status); la app recarga lo que va guardando">${raw(SVG.check)}Programa de fondo</span>`
      : otp?.running ? html`<span class="tag green">${raw(SVG.check)}Recopilando</span>` : html`<span class="tag">En pausa</span>`);
    const cur = otp?.current;
    // Version y actualizaciones automaticas (state.update, de updater.js)
    const up = App.data.state?.update;
    if (up) {
      const txt = { dev: 'sin empaquetar: no se actualiza', idle: 'actualizaciones automáticas', checking: 'buscando actualizaciones...', latest: 'al día',
        downloading: `descargando la ${up.next} (${up.percent ?? 0} %)...`, ready: `la ${up.next} está lista: instálala desde la barra de arriba o se instalará sola al cerrar la app`, error: 'no se pudo comprobar si hay actualizaciones (mira el registro)' }[up.state] || '';
      $('[data-update]', this.el).textContent = `Versión ${up.version} · ${txt}`;
      const btn = $('[data-act="checkUpdate"]', this.el);
      btn.disabled = ['dev', 'checking', 'downloading', 'ready'].includes(up.state);
    }
    $('[data-otp-status]', this.el).textContent = !otp ? ''
      : !c.otpBuilds ? `Descarga desactivada: se usan los datos que ya hay (${fmt.int(otp.ready)} de ${fmt.int(otp.total)} campeones listos)`
      : `${fmt.int(otp.ready)} de ${fmt.int(otp.total)} campeones listos · ${fmt.int(otp.mains)} mains · ${fmt.int(otp.games)} partidas guardadas`
        + (cur ? ` · ahora: ${Dd.champName(cur.championId)}${cur.season ? ` (${fmt.int(cur.fetched)} de ${fmt.int(cur.season)} partidas)` : ''}` : '');
    const ai = App.data.state?.ai;
    setHtml($('[data-ai-badge]', this.el), !ai ? '' : ai.ready
      ? html`<span class="tag green">${raw(SVG.check)}${ai.mode === 'api' ? 'Clave lista' : 'Claude Code encontrado'}</span>`
      : html`<span class="tag red">${ai.mode === 'api' ? 'Falta la clave' : 'Claude Code no encontrado'}</span>`);
    $('.overlay-opts', this.el).classList.toggle('disabled', !c.overlay?.enabled);
    // Con el overlay desactivado no se dibuja nada, asi que la prueba no tendria sentido
    const testBtn = $('[data-act="testOverlay"]', this.el);
    testBtn.disabled = !c.overlay?.enabled;
    testBtn.parentElement.dataset.tip = c.overlay?.enabled ? 'Muestra el overlay 10 s con datos de ejemplo para colocarlo' : 'Activa el overlay para poder probarlo';
    this.pick.set(c.pick);
    this.ban.set(c.ban);

    const keys = App.data.state?.keys || {};
    for (const name of ['riot', 'anthropic']) {
      const badge = $(`[data-key="${name}"] .key-badge`, this.el);
      setHtml(badge, keys[name] ? html`<span class="tag green">${raw(SVG.check)}Configurada</span>` : html`<span class="tag ${name === 'riot' ? 'red' : ''}">Sin configurar</span>`);
    }
  },

  paintOutput(k, v) {
    const out = $(`[data-out="${k}"]`, this.el);
    if (!out) return;
    if (k === 'acceptDelay') out.textContent = v ? `${v} s` : 'Al instante';
    else if (k === 'csTarget') out.textContent = `${fmt.dec(v)} CS/min${App.data.config?.csAuto !== false ? ' (si no hay datos)' : ''}`;
    else if (k === 'overlay.scale') out.textContent = fmt.pct(v);
  },

  onChange(input) {
    const k = input.dataset.k;
    if (!k) return;
    let v = input.type === 'checkbox' ? input.checked : input.value;
    if (input.type === 'range') v = +v;
    const [a, b] = k.split('.');
    window.api.setConfig(b ? { [a]: { [b]: v } } : { [a]: v });
  },

  async saveKey(name) {
    const field = $(`[data-key="${name}"]`, this.el);
    const input = $('input', field);
    const btn = $('button', field);
    const msg = $('.key-msg', field);
    const value = input.value.trim();
    btn.disabled = true;
    setHtml(msg, html`<span class="spinner small inline"></span> Comprobando la clave...`);
    msg.className = 'key-msg small';
    try {
      const r = await window.api.setSecret(name, value);
      if (r?.ok) {
        input.value = '';
        msg.textContent = value ? 'Clave guardada y verificada.' : 'Clave eliminada.';
        msg.className = 'key-msg small win';
        App.toast(value ? 'Clave guardada' : 'Clave eliminada', 'ok');
      } else {
        msg.textContent = r?.error || 'La clave no es válida.';
        msg.className = 'key-msg small loss';
      }
    } catch (err) {
      msg.textContent = err?.message || 'No se pudo guardar la clave.';
      msg.className = 'key-msg small loss';
    } finally {
      btn.disabled = false;
    }
  },
});
