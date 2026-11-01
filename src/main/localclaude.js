// Conector con Claude Code instalado en el equipo (claude.exe en modo -p): usa la sesion y la
// suscripcion del usuario, sin clave de API. Se lanza sin herramientas, sin guardar la sesion y en
// modo seguro (sin CLAUDE.md, memoria, plugins ni hooks) para que responda rapido y solo a lo que se le pasa.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

class LocalClaude {
  constructor(dir) {
    this.dir = dir;
    this.exe = null;
    this.checkedAt = 0;
  }

  // Ruta de claude.exe (instalador nativo) o claude.cmd (npm); null si no esta instalado
  find() {
    if (this.exe && fs.existsSync(this.exe)) return this.exe;
    // Si no estaba, no se vuelve a buscar hasta pasado un minuto (el estado se pide cada segundo)
    if (Date.now() - (this.checkedAt || 0) < 60000) return null;
    this.checkedAt = Date.now();
    const known = [
      path.join(os.homedir(), '.local', 'bin', 'claude.exe'),
      process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'claude.cmd'),
    ].filter(Boolean);
    this.exe = known.find(f => fs.existsSync(f)) || null;
    if (!this.exe) {
      try {
        const found = execFileSync('where.exe', ['claude'], { encoding: 'utf8', timeout: 3000, windowsHide: true });
        this.exe = found.split(/\r?\n/).map(s => s.trim()).find(s => /\.(exe|cmd)$/i.test(s)) || null;
      } catch { }
    }
    return this.exe;
  }

  available() {
    return !!this.find();
  }

  // Devuelve el texto de la respuesta. model: alias de Claude Code (sonnet, opus...)
  ask({ system, prompt, model = 'sonnet', effort = 'low', timeoutMs = 120000 }) {
    const exe = this.find();
    if (!exe) return Promise.reject(new Error('No se encuentra Claude Code en este equipo'));

    fs.mkdirSync(this.dir, { recursive: true });
    const sysFile = path.join(this.dir, `claude-system-${process.pid}-${Date.now()}.txt`);
    fs.writeFileSync(sysFile, system, 'utf8');
    const args = ['-p', '--output-format', 'json', '--tools', '', '--no-session-persistence', '--safe-mode',
      '--model', model, '--effort', effort, '--system-prompt-file', sysFile];
    // Un .cmd solo se puede lanzar con shell, y entonces hay que poner las comillas a mano
    const shell = /\.cmd$/i.test(exe);
    const argv = shell ? args.map(a => (a === '' || /\s/.test(a) ? `"${a}"` : a)) : args;

    return new Promise((resolve, reject) => {
      const child = spawn(shell ? `"${exe}"` : exe, argv, { cwd: this.dir, windowsHide: true, shell });
      let out = '', err = '';
      const timer = setTimeout(() => {
        child.kill();
        finish(new Error('Claude Code ha tardado demasiado en responder'));
      }, timeoutMs);
      let done = false;
      const finish = (error, text) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        fs.rm(sysFile, { force: true }, () => { });
        error ? reject(error) : resolve(text);
      };

      child.stdout.on('data', d => { out += d; });
      child.stderr.on('data', d => { err += d; });
      child.on('error', e => finish(new Error(`No se pudo abrir Claude Code: ${e.message}`)));
      child.on('close', code => {
        let res = null;
        try { res = JSON.parse(out); } catch { }
        if (!res) return finish(new Error(`Claude Code ha fallado (código ${code}): ${(err || out).trim().slice(0, 300)}`));
        if (res.is_error) {
          const msg = String(res.result || res.subtype || 'error desconocido');
          if (/log ?in|auth|credential/i.test(msg)) return finish(new Error('Claude Code no tiene la sesión iniciada: abre una terminal y ejecuta «claude» para entrar'));
          return finish(new Error(`Claude Code: ${msg.slice(0, 300)}`));
        }
        const text = String(res.result || '').trim();
        if (!text) return finish(new Error('Claude Code no ha devuelto ninguna respuesta'));
        finish(null, text);
      });
      child.stdin.end(prompt, 'utf8');
    });
  }
}

module.exports = { LocalClaude };
