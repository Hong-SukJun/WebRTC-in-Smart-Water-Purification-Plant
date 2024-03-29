'use strict';

var isChannelReady = false;
var isInitiator = false;
var isStarted = false;
var localStream;
var pc;
var remoteStream;
var turnReady;

var pcConfig = {
  'iceServers': [{
    'urls': 'stun:10.20.13.47:3478'
  }]
};

// Set up audio and video regardless of what devices are present.
var sdpConstraints = {
  offerToReceiveAudio: true,
  offerToReceiveVideo: true
};

/////////////////////////////////////////////

var room = 'foo';
// Could prompt for room name:
// room = prompt('Enter room name:');

var socket = io.connect();

if (room !== '') {
  socket.emit('create or join', room);
  console.log('Attempted to create or  join room', room);
}

socket.on('created', function(room) {
  console.log('Created room ' + room);
  isInitiator = true;
});

socket.on('full', function(room) {
  console.log('Room ' + room + ' is full');
});

socket.on('join', function (room){
  console.log('Another peer made a request to join room ' + room);
  console.log('This peer is the initiator of room ' + room + '!');
  isChannelReady = true;
});

socket.on('joined', function(room) {
  console.log('joined: ' + room);
  isChannelReady = true;
});

socket.on('log', function(array) {
  console.log.apply(console, array);
});

////////////////////////////////////////////////

function sendMessage(message) {
  console.log('Client sending message: ', message);
  socket.emit('message', message);
}

// This client receives a message
socket.on('message', function(message) {
  console.log('Client received message:', message);
  if (message === 'got user media') {
    maybeStart();
  } else if (message.type === 'offer') {
    if (!isInitiator && !isStarted) {
      maybeStart();
    }
    pc.setRemoteDescription(new RTCSessionDescription(message));
    doAnswer();
  } else if (message.type === 'answer' && isStarted) {
    pc.setRemoteDescription(new RTCSessionDescription(message));
  } else if (message.type === 'candidate' && isStarted) {
    var candidate = new RTCIceCandidate({
      sdpMLineIndex: message.label,
      candidate: message.candidate
    });
    pc.addIceCandidate(candidate);
  } else if (message === 'bye' && isStarted) {
    handleRemoteHangup();
  }
});

////////////////////////////////////////////////////

var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');

navigator.mediaDevices.enumerateDevices()
.then(function(devices) {
  var videoDevices = devices.filter(function(device) {
    return device.kind === 'videoinput';
  });
  if (videoDevices.length > 0) {
    navigator.mediaDevices.getUserMedia({
      audio: true,
      video: {
        facingMode: "environment"
      }
    })
    .then(gotStream)
    .catch(function(e) {
      alert('getUserCamera() error: ' + e.name);
    });
  } else {
    navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    })
    .then(gotStream)
    .catch(function(e) {
      alert('getUserMike() error: ' + e.name);
    });
  }
});

function gotStream(stream) {
  console.log('Adding local stream.');
  localStream = stream;
  localVideo.srcObject = stream;
  sendMessage('got user media');
  if (isInitiator) {
    maybeStart();
  }
}

var constraints = {
  video: true
  };
  
  console.log('Getting user media with constraints', constraints);
  
  function maybeStart() {
  console.log('>>>>>>> maybeStart() ', isStarted, localStream, isChannelReady);
  if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
  console.log('>>>>>> creating peer connection');
  createPeerConnection();
  pc.addStream(localStream);
  isStarted = true;
  console.log('isInitiator', isInitiator);
  if (isInitiator) {
  doCall();
  }
  }
}

window.onbeforeunload = function() {
  sendMessage('bye');
  };
  
  /////////////////////////////////////////////////////////
  
  function createPeerConnection() {
  try {
  pc = new RTCPeerConnection(pcConfig);
  pc.onicecandidate = handleIceCandidate;
  pc.onaddstream = handleRemoteStreamAdded;
  pc.onremovestream = handleRemoteStreamRemoved;
  console.log('Created RTCPeerConnnection');
  } catch (e) {
  console.log('Failed to create PeerConnection, exception: ' + e.message);
  alert('Cannot create RTCPeerConnection object.');
  return;
  }
  }

function handleIceCandidate(event) {
  console.log('icecandidate event: ', event);
  if (event.candidate) {
  sendMessage({
  type: 'candidate',
  label: event.candidate.sdpMLineIndex,
  id: event.candidate.sdpMid,
  candidate: event.candidate.candidate
  });
  } else {
  console.log('End of candidates.');
  }
}

function handleCreateOfferError(event) {
console.log('createOffer() error: ', event);
}

function doCall() {
console.log('Sending offer to peer');
pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function doAnswer() {
console.log('Sending answer to peer.');
  pc.createAnswer().then(
  setLocalAndSendMessage,
  onCreateSessionDescriptionError
  );
}

function setLocalAndSendMessage(sessionDescription) {
pc.setLocalDescription(sessionDescription);
console.log('setLocalAndSendMessage sending message', sessionDescription);
sendMessage(sessionDescription);
}

function onCreateSessionDescriptionError(error) {
trace('Failed to create session description: ' + error.toString());
}

function handleRemoteStreamAdded(event) {
console.log('Remote stream added.');
remoteStream = event.stream;
remoteVideo.srcObject = remoteStream;
}

function handleRemoteStreamRemoved(event) {
console.log('Remote stream removed. Event: ', event);
}

function hangup() {
console.log('Hanging up.');
stop();
sendMessage('bye');
}

function handleRemoteHangup() {
console.log('Session terminated.');
stop();
isInitiator = false;
}

function stop() {
isStarted = false;
pc.close();
pc = null;
}

// Add this function inside the 'connection' event
socket.on('leave', function(room) {
// Leave the room
  socket.leave(room);

  // Check the number of clients in the room
  var clientsInRoom = io.sockets.adapter.rooms[room];
  var numClients = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;

  // If there are no clients left in the room, delete the room
  if (numClients === 0) {
    console.log('Room ' + room + ' is empty, deleting the room');
    // You can add additional code here to delete the room from your database or any other storage
    } else {
    console.log('Room ' + room + ' has ' + numClients + ' client(s) left');
    }
      // Notify other clients that a user has left the room
  socket.broadcast.to(room).emit('user left', socket.id);
});

socket.on('bye', function(room) {
  console.log('Received bye from client', socket.id);
  // Trigger the 'leave' event to handle room deletion
  socket.emit('leave', room);
});

