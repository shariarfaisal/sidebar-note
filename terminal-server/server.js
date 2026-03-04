const { WebSocketServer } = require('ws');
const pty = require('node-pty');
const os = require('os');

const PORT = 8768;
const shell = os.platform() === 'win32' ? 'powershell.exe' : '/bin/zsh';

const wss = new WebSocketServer({ port: PORT });

console.log(`Terminal server listening on ws://localhost:${PORT}`);

wss.on('connection', (ws) => {
  const processes = new Map();

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'spawn': {
        const id = msg.id;
        if (!id) break;

        // Kill existing process with same id if any
        if (processes.has(id)) {
          processes.get(id).kill();
          processes.delete(id);
        }

        const cols = msg.cols || 80;
        const rows = msg.rows || 24;

        const ptyProcess = pty.spawn(shell, [], {
          name: 'xterm-256color',
          cols,
          rows,
          cwd: msg.cwd || os.homedir(),
          env: {
            ...process.env,
            COLORTERM: 'truecolor',
            TERM: 'xterm-256color',
            FORCE_COLOR: '1',
          },
        });

        ptyProcess.onData((data) => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'output', id, data }));
          }
        });

        ptyProcess.onExit(({ exitCode }) => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'exit', id, code: exitCode }));
          }
          processes.delete(id);
        });

        processes.set(id, ptyProcess);
        ws.send(JSON.stringify({ type: 'spawned', id }));
        break;
      }

      case 'input': {
        const proc = processes.get(msg.id);
        if (proc) {
          proc.write(msg.data);
        }
        break;
      }

      case 'resize': {
        const proc = processes.get(msg.id);
        if (proc && msg.cols && msg.rows) {
          try {
            proc.resize(msg.cols, msg.rows);
          } catch {}
        }
        break;
      }

      case 'kill': {
        const proc = processes.get(msg.id);
        if (proc) {
          proc.kill();
          processes.delete(msg.id);
        }
        break;
      }
    }
  });

  function killAll() {
    for (const [id, proc] of processes) {
      proc.kill();
    }
    processes.clear();
  }

  ws.on('close', killAll);
  ws.on('error', killAll);
});
