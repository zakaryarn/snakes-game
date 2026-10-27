// سرور مار و پله - بدون نیاز به نصب هیچ پکیجی (فقط Node.js)
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 3000;
const JUMPS = {4:14,9:31,21:42,28:84,36:44,51:67,71:91, 16:6,47:26,49:11,56:53,62:19,64:60,87:24,93:73,95:75,98:78};
const rooms = {};

function getRoom(id) {
  return rooms[id] || (rooms[id] = { players: [], turn: 0, winner: null, last: null });
}
function pub(room, you) {
  return { you, turn: room.turn, winner: room.winner, last: room.last,
    players: room.players.map(p => ({ name: p.name, pos: p.pos, online: !!p.res })) };
}
function broadcast(room) {
  room.players.forEach((p, i) => p.res && p.res.write('data: ' + JSON.stringify(pub(room, i)) + '\n\n'));
}
function findPlayer(room, pid) { return room.players.findIndex(p => p.id === pid); }

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const roomId = (url.searchParams.get('room') || '').slice(0, 20);

  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
  }

  if (url.pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const room = getRoom(roomId);
    let pid = url.searchParams.get('pid');
    let i = findPlayer(room, pid);
    if (i < 0) {
      if (room.players.length >= 2) { res.write('event: full\ndata: {}\n\n'); return res.end(); }
      pid = crypto.randomUUID();
      room.players.push({ id: pid, name: (url.searchParams.get('name') || 'بازیکن').slice(0, 12), pos: 0, res: null });
      i = room.players.length - 1;
    }
    room.players[i].res = res;
    res.write('event: hello\ndata: ' + JSON.stringify({ pid }) + '\n\n');
    broadcast(room);
    req.on('close', () => { if (room.players[i]) room.players[i].res = null; broadcast(room); });
    return;
  }

  if (req.method === 'POST' && (url.pathname === '/roll' || url.pathname === '/restart')) {
    const room = rooms[roomId];
    const i = room ? findPlayer(room, url.searchParams.get('pid')) : -1;
    res.writeHead(200); res.end('ok');
    if (i < 0) return;
    if (url.pathname === '/restart') {
      if (room.winner === null) return;
      room.players.forEach(p => p.pos = 0); room.turn = 0; room.winner = null; room.last = null;
    } else {
      if (room.players.length < 2 || room.winner !== null || room.turn !== i) return;
      const p = room.players[i], dice = 1 + Math.floor(Math.random() * 6), from = p.pos;
      let to = from + dice, kind = null;
      if (to > 100) to = from;                       // باید دقیقاً به ۱۰۰ برسی
      else if (JUMPS[to]) { kind = JUMPS[to] > to ? 'ladder' : 'snake'; to = JUMPS[to]; }
      p.pos = to;
      room.last = { player: i, dice, from, to, kind };
      if (to === 100) room.winner = i; else room.turn = 1 - i;
    }
    broadcast(room);
    return;
  }
  res.writeHead(404); res.end();
});

setInterval(() => Object.values(rooms).forEach(r => r.players.forEach(p => p.res && p.res.write(': ping\n\n'))), 20000);
server.listen(PORT, () => console.log('بازی روی پورت ' + PORT + ' اجراست: http://localhost:' + PORT));
