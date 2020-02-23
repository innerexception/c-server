var WebSocketServer = require('websocket').server;
var http = require('https');
var Constants = require('./Constants.js').ReducerActions
var Phrases = require('./Constants.js').Phrases
var MatchStatus = require('./Constants.js').MatchStatus
var fs = require('fs');
/**
 * HTTP server
 */
var server = http.createServer({
  key: fs.readFileSync('privkey.pem'),
  cert: fs.readFileSync('fullchain.pem')
});
server.listen(2345, function() {
  console.log((new Date()) + " Server is listening on port " + 2345);
});

/**
 * WebSocket server
 */

var sessions = [];

var wsServer = new WebSocketServer({
  // WebSocket server is tied to a HTTP server. WebSocket request is just
  // an enhanced HTTP request. For more info http://tools.ietf.org/html/rfc6455#page-6
  httpServer: server
});

// This callback function is called every time someone
// tries to connect to the WebSocket server
wsServer.on('request', function(request) {
  console.log((new Date()) + ' Connection from origin ' + request.origin + '.');
  
  // accept connection - you should check 'request.origin' to make sure that
  // client is connecting from your website
  // (http://en.wikipedia.org/wiki/Same_origin_policy)
  if(request.origin.indexOf('cryptonomical.com') === -1 ) return
  var connection = request.accept(null, request.origin);
  var socketId = Date.now()+''+Math.random()
  connection.id = socketId

  console.log((new Date()) + ' Connection accepted.');

  // user sent some message
  connection.on('message', function(message) {
    if (message.type === 'utf8') { // accept only text
        var obj = JSON.parse(message.utf8Data)
        var targetSession = sessions[obj.sessionName]
        if(!targetSession && obj.type !== Constants.MATCH_AVAILABLE) return
        switch(obj.type){
          case Constants.MATCH_AVAILABLE:
            if(targetSession){
              targetSession.players.push({...obj.currentUser, socket: connection})
            }
            else{
              targetSession = {
                players: [{...obj.currentUser, socket: connection}], 
                sessionName: obj.sessionName,
                score:0,
                activePhrase: '',
                level:0,
                status: ''
              }
              console.log('created session '+obj.sessionName)
            }
            break
          case Constants.MATCH_START: 
            targetSession.level++
            targetSession.status = MatchStatus.ACTIVE
            targetSession.bossId = obj.currentUser.id
            targetSession.activePhrase = getNextPhrase()
            targetSession.players = targetSession.players.map((player) => {
              return {...player, choices: getChoices(targetSession.activePhrase)}
            })
            targetSession.ticks = 0
            targetSession.goal = targetSession.level*5
            targetSession.tickLimit = 60 - (targetSession.level*5)
            targetSession.score = 0
            break
          case Constants.PHRASE_ENTERED: 
            if(targetSession.activePhrase === obj.phrase){
              targetSession.score++
              targetSession.activePhrase = getNextPhrase()
              targetSession.players = targetSession.players.map((player) => {
                return {...player, choices: getChoices(targetSession.activePhrase)}
              })
            }
            break
          case Constants.MATCH_TICK: 
            targetSession.ticks++
            break
          case Constants.MATCH_LOST:
            targetSession.status = MatchStatus.LOST
            break
          case Constants.MATCH_WIN:
            targetSession.status = MatchStatus.WIN
            break
        }

        sessions[obj.sessionName] = targetSession
        publishSessionUpdate(targetSession)
        if(targetSession.status === MatchStatus.LOST){
          delete sessions[obj.sessionName]
        }
    }
  });

  // user disconnected
  connection.on('close', (code) => {
      console.log((new Date()) + "A Peer disconnected.");
      // remove user from the list of connected clients
      var sessionNames = Object.keys(sessions)
      sessionNames.forEach((name) => {
        let session = sessions[name]
        let player = session.players.find((player) => player.socket.id === socketId)
        if(player){
          console.log('removing player '+player.name+' from session '+name)
          session.players = session.players.filter((rplayer) => rplayer.id !== player.id)
          publishSessionUpdate(session)
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
      console.log((new Date()) + ' ' + message);
      player.socket.sendUTF(json);
  })
}

const getSessionUpdateMessage = (targetSession) => {
  return JSON.stringify({
    type: Constants.MATCH_UPDATE,
    session: {...targetSession, players: targetSession.players.map((player) => {return {...player, socket: ''}})}
  })
}

const getNextPhrase = () => {
  return Phrases[getRandomInt(Phrases.length-1)]
}

const getChoices = (keyPhrase) => {
  let choices = new Array(7).fill().map((i) => getNextPhrase())
  choices = choices.filter((choice) => choice !== keyPhrase)
  choices.push(keyPhrase)
  choices = shuffleArray(choices)
  console.log(choices)
  return choices
}

const getRandomInt = (max) => {
  return Math.floor(Math.random() * Math.floor(max));
}

const shuffleArray = (array) => {
  for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
  }
  return Array.from(array)
}
