var net = require('net'),
  events = require('events');
  mpf = require('./mpf')
  util = require('./util')
  
// mpf connection
var mpfConnection = net.createConnection(2000, "127.0.0.1");

/* 
 * mpf connection handlers
 */
mpfConnection.addListener("connect", function () {
  console.log("connection is established with mpf server...");
  
  setInterval(sendHeartbeat, 1000);
});

mpfConnection.addListener("data", function (chunk, mpfState, mpfBuf, index) {
  console.log("data is received from mpf server <= " + chunk.toString('hex'));
  
  if (typeof mpfState == 'undefined') {
    mpfState = 0;
  }
  
  for (var i = 0; i < chunk.length; i++) {
    switch (mpfState) {
      case 0:
        if (chunk[i] == mpf.MPF_FRAME_START) {
          mpfState = 1;
          mpfBuf = new Buffer(4);
          index = 0;
        } else {
          console.log("Error: expecting mpf start of transmission, received " + chunk[i]);
          // TODO
        }
      break;
      
      case 1:
        if (chunk[i] == mpf.MPF_FRAME_END) {
          mpfState = 2;
        }        
      break;

      case 2:
        lrc = util.computeLRC(mpfBuf, 1, mpfBuf.length-1);
        if (chunk[i] == lrc) {
          mpfState = 0;
          mpfEventEmitter.emit("NewPacket", mpfBuf);
        } else {
          console.log("Error: LRC Failed!! " + lrc + " != " + chunk[i]);
          // TODO
        }        
      break;
    }
    
    // copy the byte into mpf buffer
    mpfBuf[index++] = chunk[i];
  }
});

mpfConnection.addListener("end", function () {
  console.log("mpf server disconnected...");
});

/*
 * Increment the global sequence number.
 */
var seqno = 32;
function nextSeqNo() {
   if (seqno == 127) {
     // wrap around to 32
     seqno = 32;
   }

   return ++seqno;
}

/*
 * sends heartbeat packet to mpf server
 */
function sendHeartbeat () {
  buf = mpf.createType5Packet(nextSeqNo(), "IDCO");
  console.log("sending heartbeat packet => " + buf.toString());
  mpfConnection.write(buf);
}

/*
 * sends type 2 packet to mpf server
 */
function sendPrices() {
  buf = mpf.createType2Packet(nextSeqNo(), "IDCO");
  console.log("sending heartbeat packet => " + buf.toString());
  mpfConnection.write(buf);
}

// emit an event when a new packet arrives from mpf server
var mpfEventEmitter = new events.EventEmitter();

mpfEventEmitter.addListener("NewPacket", function(buf) {
	if (buf[1] == 0x06) {
	  // positive acknowledgement
    console.log("ACK!!");
	} else if (buf[1] == 0x15) {
    // negative acknowledgement
    console.log("NAK!!");
	}
  else {
    console.log("Error: MPF protocol violated. Expecting <ACK> or <NAK>, received " + buf[1]);
  }
  sendPrices();
});
