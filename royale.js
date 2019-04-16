var WebSocketServer = require('websocket').server;
var http = require('http');
var Constants = {
  PLAYER_AVAILABLE: 'ma',
  MATCH_UPDATE: 'mu',
  PLAYER_REPLACE: 'prp',
  PLAYER_MAP_REPLACE: 'pmp',
  MATCH_TICK: 'mt'
}

/**
 * HTTP server
 */
var server = http.createServer(function(request, response) {
  // Not important for us. We're writing WebSocket server, not HTTP server
});
server.listen(3334, function() {
  console.log((new Date()) + " Server is listening on port " + 3334);
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
        switch(obj.type){
          case Constants.PLAYER_AVAILABLE:
            if(targetSession){
              targetSession.players.push({...obj.currentUser, socketId})
            }
            else{
              targetSession = {
                players: [{...obj.currentUser, socketId}], 
                ...obj.session, 
                sessionId: obj.sessionId
              }
              console.log('created new session '+obj.sessionId)
            }
            break
          case Constants.MATCH_UPDATE:
            targetSession = {...targetSession, ...obj.session}
            break
          case Constants.PLAYER_REPLACE: 
            var player = obj.player
            targetSession.players = targetSession.players.filter(splayer=>splayer.id !== player.id)
            targetSession.players.push(player)
            break
          case Constants.PLAYER_MAP_REPLACE: 
            var player = obj.player
            targetSession.map.forEach(row => row.forEach(tile => {
                if(tile.playerId && tile.playerId === player.id) delete tile.playerId
            }))
            var tile = targetSession.map[player.x][player.y]
            tile.playerId = player.id
            delete tile.weapon
            delete tile.item
            targetSession.players = targetSession.players.filter(splayer=>splayer.id !== player.id)
            targetSession.players.push(player)
            break
          case Constants.MATCH_TICK: 
            targetSession.ticks++
            break
        }
        sessions[obj.sessionId] = targetSession
        publishSessionUpdate(targetSession)
    }
  });

  // user disconnected
  connection.on('close', (code) => {
      console.log((new Date()) + "A Peer disconnected: "+code);
      // remove user from the list of connected clients
      var sessionIds = Object.keys(sessions)
      sessionIds.forEach((name) => {
        let session = sessions[name]
        let player = session.players.find((player) => player.socketId === socketId)
        if(player){
          console.log('removing player '+player.name+' from session '+name)
          session.players = session.players.filter((rplayer) => rplayer.id !== player.id)
          publishSessionUpdate(session)
          delete sockets[socketId]
          if(session.players.length === 0) {
            delete sessions[name]
            console.log('removed session '+name)
          }
        } 
      })
      
      // remove user from sessions and send update
  });
});

const publishSessionUpdate = (targetSession) => {
  var message = getSessionUpdateMessage(targetSession)
  // broadcast message to clients of session
  var json = JSON.stringify({ type:'message', data: message });
  targetSession.players.forEach((player) => {
      sockets[player.socketId].sendUTF(json);
  })
}

const getSessionUpdateMessage = (targetSession) => {
  return JSON.stringify({
    type: Constants.MATCH_UPDATE,
    session: targetSession
  })
}
