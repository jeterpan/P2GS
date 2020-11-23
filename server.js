const fs = require('fs')
const path = require('path');
const https = require('https');
const url = require('url');
const express = require('express');
const socketio = require('socket.io');
const formatMessage = require('./utils/messages');
const {
  userJoin,
  getCurrentUser,
  userLeave,
  getRoomUsers,
  getUserByName
} = require('./utils/users');
const { EventEmitter } = require('events');

const myEmitter = new EventEmitter()

const app = express();

const server = new https.createServer({
  cert: fs.readFileSync('/etc/letsencrypt/live/gather2poker.com.br-0001/cert.pem'),
  key: fs.readFileSync('/etc/letsencrypt/live/gather2poker.com.br-0001/privkey.pem')
}, app);

const PORT = process.env.PORT || 443;

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

const io = socketio(server);

// Set static folder
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', function (req, res) {
	res.sendFile(__dirname + '/public/index.html')
})


app.post('/api/global', function (req, res) {
    
  const ctxparam = url.parse(req.url,true).query

  myEmitter.emit('msgFromGod', ctxparam, res)

})

const botName = 'P2GS Websocket Server';


// Run when client connects
io.sockets.on('connection', socket => {
  socket.on('joinRoom', ({ username, privilege, room }) => {
    const user = userJoin(socket.id, username, privilege, room);

    socket.join(user.room);

    // Welcome current user
    socket.emit('message', formatMessage(botName, 'Welcome to P2G!'));

    // Broadcast when a user connects
    socket.broadcast
      .to(user.room)
      .emit(
        'message',
        formatMessage(botName, `${user.username} has joined the room`)
      );

    // Send users and room info
    io.to(user.room).emit('roomUsers', {
      room: user.room,
      users: getRoomUsers(user.room)
    });
  });

  // Check if msgFromGod event is already instantiated, if not:
  if( ! myEmitter.eventNames().includes('msgFromGod') ) {

      // create the instance
      // We choose instantiate here inside the io.socket.on('connection')
      //  this way we are able to send msg to all available chosen rooms or chosen players needed
      myEmitter.on('msgFromGod', (ctx, res) => {

        if(ctx.room) {

          // Get room users
          const roomUsers = getRoomUsers(ctx.room)

          console.log(roomUsers)

          if ( roomUsers.length >= 0 ) {

            console.log(ctx.player)

            if(ctx.player) {

              let user = {}

              user = getUserByName(ctx.player)

              if(typeof user != 'undefined') {

                if(user.id) {
                  // Broadcast to a specific user
                  socket.broadcast
                  .to(user.id)
                  .emit(
                    'action',
                    formatMessage('backend', `${ctx.event}`)
                  );
        
                  res.status(200).json({ success: true, ...ctx })
  
                } else {
                  res.status(400).json({ success: false, error: `User ${ctx.player} not found in room ${ctx.room}`, ...ctx})    
                }

              } else {
                res.status(400).json({ success: false, error: `User ${ctx.player} not found in room ${ctx.room}`, ...ctx})    
              }

            } else {

              socket.broadcast
              .to(ctx.room)
              .emit(
                'action',
                formatMessage('backend', `${ctx.event}`)
              );
    
              res.status(200).json({ success: true, ...ctx })
    
            }

          } else {
            res.status(400).json({ success: false, error: `Room ${ctx.room} not found`, ...ctx})
          }
          
        }

    });
  }


  // Listen for chat Message
  socket.on('chatMessage', msg => {
    const user = getCurrentUser(socket.id);
    if(user.privilege === 'manager') {

        io.to(user.room).emit('message', formatMessage(user.username, msg));
    }
  });

  // Runs when client disconnects
  socket.on('disconnect', () => {
    const user = userLeave(socket.id);

    if (user) {
      io.to(user.room).emit(
        'message',
        formatMessage(botName, `${user.username} has left the room`)
      );

      // Send users and room info
      io.to(user.room).emit('roomUsers', {
        room: user.room,
        users: getRoomUsers(user.room)
      });
    }
  });
});
