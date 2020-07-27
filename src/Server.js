const express = require('express');
const cors = require('cors');
const md5 = require('md5');
const socketIO = require('socket.io');
const path = require('path');
const { createServer } = require('http');

const app = express();
const server = createServer(app);
const io = socketIO(server);

const connectedUsers = {};
const chats = {};

app.use(cors());
app.use(express.json());
app.use(express.static(path.resolve(__dirname, '..', 'public')));

app.get('/', (req, res) => {
  return res.sendFile(path.resolve(__dirname, 'pages', 'index.html'));
});

app.get('/:id', (req, res) => {
  return res.sendFile(path.resolve(__dirname, 'pages', 'chat.html'));
});

app.get('/api/chats', (req, res) => {
  const avalibleChats = Object.keys(chats).map(key => {
    return chats[key]
  }).filter(chat => chat.users.length === 1);

  return res.json(avalibleChats);
});

app.get('/api/chats/:id', (req, res) => {
  const { id } = req.params;

  if (!chats[id]) return res.status(404).json({ message: 'Chat not found.' });

  return res.json(chats[id]);
});

app.post('/api/chats', (req, res) => {
  const { chatName } = req.body;

  if (!chatName || chatName === '') return res.status(400).json({ message: 'Invalid chat name.' });

  const chatId = md5(Date.now());

  chats[chatId] = {
    id: chatId,
    title: chatName,
    users: [],
  };

  return res.json({ id: chatId });
});

io.on('connection', (socket) => {
  console.log(`A user connected: ${socket.id}`);

  connectedUsers[socket.id] = socket;

  socket.on('join_chat', (data) => {
    if (!data.username || data.username === '' || !data.id || data.id === '') {
      return socket.emit('join_chat_error', {});
    }

    if (!chats[data.id]) {
      return socket.emit('chat_not_exist', {});
    }

    if (chats[data.id].users.length >= 2) {
      return socket.emit('chat_full', {});
    }

    if (!chats[data.id].owner) {
      chats[data.id].owner = socket.id;
    }

    if (chats[data.id].users.length >= 1) {
      connectedUsers[chats[data.id].users[0].id].emit('user_join', { id: socket.id, username: data.username });
    }

    console.log(`${data.username} joined in ${chats[data.id].title}`);
    const user = {
      username: data.username,
      id: socket.id,
    };

    chats[data.id].users.push(user);
    connectedUsers[socket.id].chat = data.id;

    socket.emit('join_chat_success', { id: socket.id, me: user });
  });

  socket.on('message', (data) => {
    const { message, id } = data;

    if (!chats[id]) return socket.emit('chat_not_exist', {});

    const reciver = chats[id].users.filter(user => user.id !== socket.id);

    if (reciver.length <= 0) return;

    connectedUsers[reciver[0].id].emit('message', { message, sender: socket.id });
  });

  socket.on('disconnect', () => {
    console.log(`A user disconnected: ${socket.id}`);

    if (connectedUsers[socket.id].chat) {
      console.log(`${chats[connectedUsers[socket.id].chat].users.filter(user => user.id === socket.id)[0].username} quit from ${chats[connectedUsers[socket.id].chat].title}`);
      chats[connectedUsers[socket.id].chat].users = chats[connectedUsers[socket.id].chat].users.filter(user => user.id !== socket.id);

      if (chats[connectedUsers[socket.id].chat].users.length <= 0) delete chats[connectedUsers[socket.id].chat];
      else {
        const newOwner = chats[connectedUsers[socket.id].chat].users[0].id
        chats[connectedUsers[socket.id].chat].owner = newOwner;
        connectedUsers[newOwner].emit('user_quit', { id: socket.id });
      };

    }

    connectedUsers[socket.id] = undefined;
  });
});

server.listen(3333, () => {
  console.log('listening on 3333');
});
