var WebSocketServer = require('websocket').server;
var http = require('http');
var fs = require('fs');
var Constants = {
  PLAYER_AVAILABLE: 'ma',
  MATCH_UPDATE: 'mu',
  SECRET: 'NWV$(UW^Y*@G$%B@2b54uigvb24cyt2c8'
}
/**
 * HTTP server
 */
var server = http.createServer({
  // key: fs.readFileSync('privkey.pem'),
  // cert: fs.readFileSync('fullchain.pem')
});
server.listen(27015, function() {
  console.log((new Date()) + " Server is listening on port " + 27015);
});

/**
 * WebSocket server
 */

var sessions = {};
var sockets = {};

var wsServer = new WebSocketServer({
  // WebSocket server is tied to a HTTP server. WebSocket request is just
  // an enhanced HTTP request. For more info http://tools.ietf.org/html/rfc6455#page-6
  httpServer: server,
  maxReceivedFrameSize: 131072,
  maxReceivedMessageSize: 10 * 1024 * 1024,
});

// This callback function is called every time someone
// tries to connect to the WebSocket server
wsServer.on('request', function(request) {
  console.log((new Date()) + ' Connection from origin ' + request.origin + '.');
  
  // accept connection - you should check 'request.origin' to make sure that
  // client is connecting from your website
  // (http://en.wikipedia.org/wiki/Same_origin_policy)
  if(request.resourceURL.path.indexOf(Constants.SECRET) === -1 ) return
  var connection = request.accept(null, request.origin);
  var socketId = Date.now()+''+Math.random()
  connection.id = socketId
  sockets[socketId] = connection

  console.log((new Date()) + ' Connection accepted.');

  // user sent some message
  connection.on('message', function(message) {
    if (message.type === 'utf8') { // accept only text
        var obj = JSON.parse(message.utf8Data)
        var targetSession = sessions[obj.sessionId]
        if(!targetSession && obj.type !== Constants.PLAYER_AVAILABLE) return
        let event = obj.event
        switch(obj.type){
          case Constants.PLAYER_AVAILABLE:
            if(targetSession){
              targetSession.players.push({...event.currentUser})
              targetSession.playerSockets.push({id: event.currentUser.id, socketId})
              console.log('player joined session '+obj.sessionId+': '+event.currentUser.name)
            }
            else{
              targetSession = {
                playerSockets: [{id: event.currentUser.id, socketId}],
                players: [{...event.currentUser}],
                planets: [],
                sessionId: obj.sessionId
              }
              console.log('created new session '+obj.sessionId)
            }
            break
          case Constants.MATCH_UPDATE:
            targetSession = {...targetSession, ...obj.event}
            break
        }
        sessions[obj.sessionId] = targetSession
        publishSessionUpdate(targetSession)
    }
  });

  // user disconnected
  connection.on('close', (code) => {
      console.log((new Date()) + "A Peer disconnected.");
      // remove user from the list of connected clients
      var sessionIds = Object.keys(sessions)
      sessionIds.forEach((name) => {
        let session = sessions[name]
        let player = session.playerSockets.find((player) => player.socketId === socketId)
        if(player){
          console.log('removing player '+player.name+' from session '+name)
          session.players = session.players.filter((rplayer) => rplayer.id !== player.id)
          session.playerSockets = session.playerSockets.filter((rplayer) => rplayer.id !== player.id)
          // remove user from sessions and send update
          publishSessionUpdate(session)
          delete sockets[socketId]
          console.log(session.players)
          if(session.players.length === 0) { //TODO or there are no human players left
            delete sessions[name]
            console.log('removed session '+name)
          }
        } 
      })
  });
});

const publishSessionUpdate = (targetSession) => {
  var message = getSessionUpdateMessage(targetSession)
  // broadcast message to clients of session
  var json = JSON.stringify({ type:'message', data: message });
  targetSession.playerSockets.forEach((player) => {
      sockets[player.socketId].sendUTF(json);
  })
}

const getSessionUpdateMessage = (targetSession) => {
  return JSON.stringify({
    type: Constants.MATCH_UPDATE,
    event: targetSession
  })
}
