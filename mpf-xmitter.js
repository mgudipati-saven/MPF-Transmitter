var net = require('net'),
  events = require('events'),
  mpf = require('./mpf'),
  util = require('./util'),
  ctf = require('./ctf');

// event emitter
var eventEmitter = new events.EventEmitter();
  
// mpf connection
var mpfConnection = net.createConnection(2000, "127.0.0.1");

/* 
 * mpf connection handlers
 */
mpfConnection.addListener("connect", function () {
  console.log("connection is established with mpf server...");
  
  setInterval(sendHeartbeat, 1000 * 60);
});

// mpf message deserialization states...
var EXPECTING_MPF_FRAME_START = 1,
  EXPECTING_MPF_FRAME_END = 2,
  EXPECTING_MPF_LRC = 3;  

mpfConnection.addListener("data", function (chunk, mpfState, mpfBuf, index) {
  console.log("data is received from mpf server <= " + chunk.toString('hex'));
  
  if (typeof mpfState == 'undefined') {
    mpfState = EXPECTING_MPF_FRAME_START;
  }
  
  for (var i = 0; i < chunk.length; i++) {
    switch (mpfState) {
      case EXPECTING_MPF_FRAME_START:
        if (chunk[i] == mpf.MPF_FRAME_START) {
          mpfState = EXPECTING_MPF_FRAME_END;
          mpfBuf = new Buffer(4);
          index = 0;
        } else {
          console.log("Error: expecting mpf start of transmission, received " + chunk[i]);
          // TODO
        }
      break;
      
      case EXPECTING_MPF_FRAME_END:
        if (chunk[i] == mpf.MPF_FRAME_END) {
          mpfState = EXPECTING_MPF_LRC;
        }        
      break;

      case EXPECTING_MPF_LRC:
        lrc = util.computeLRC(mpfBuf, 1, mpfBuf.length-1);
        if (chunk[i] == lrc) {
          mpfState = EXPECTING_MPF_FRAME_START;
          eventEmitter.emit("NewMPFPacket", mpfBuf);
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

// emit an event when a new packet arrives from mpf server
eventEmitter.addListener("NewMPFPacket", function(buf) {
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
function sendPrices(json) {
  var arr = new Array();
  if (json['5'] && json['8'] && json['10']) {
    arr['T'] = json['8'];
    arr['A'] = json['10'];
    buf = mpf.createType2Packet(nextSeqNo(), 
                                '80',
                                'NYCTEST',
                                '09:51:21',
                                '4',
                                json['5'],
                                2,
                                arr,
                                0x30);
    console.log("sending type 2 packet => " + buf.toString());
    mpfConnection.write(buf);
  }
}

//
// CTF CONNECTION
//
ctfConnection = net.createConnection(4001, "198.190.11.31");

/* 
* ctf connection handlers
*/

// List of CTF commands
var ctfCommandList = [ 
	"5022=LoginUser|5028=tamsupport|5029=bgood2me|5026=1",
	"5022=SelectAvailableTokens|5026=5",
	//"5022=SelectUserTokens|5035=5|5035=308|5035=378|5026=9",
	//"5022=QuerySnap|4=941|5=E:TCS.EQ|5026=11",
	//"5022=Subscribe|4=741|5026=12",
	//"5022=Subscribe|4=941|5026=12",
	"5022=QuerySnapAndSubscribe|4=941|5=E:TCS.EQ|5026=22",
];

ctfConnection.addListener("connect", function () {
  console.log("connection is established with ctf server...");
  //client.setEncoding('ascii');
  
	ctfCommandList.forEach(function(cmd, pos) {
		ctfConnection.write(ctf.serialize(cmd));
	});
});

// ctf message deserialization states...
var EXPECTING_CTF_FRAME_START = 1,
  EXPECTING_CTF_PROTOCOL_SIGNATURE = 2,
  EXPECTING_CTF_PAYLOAD_SIZE = 3,
  EXPECTING_CTF_PAYLOAD = 4,
  EXPECTING_CTF_FRAME_END = 5;

ctfConnection.addListener("data", function (chunk, ctfState, payloadSizeBuffer, payloadSizeBytesLeft, payloadBuffer) {
  //console.log("data is received from ctf server..." + chunk.toString());

  if (typeof ctfState == 'undefined') {
    ctfState = EXPECTING_CTF_FRAME_START;
  }
  
  for (var i = 0; i < chunk.length; i++) {
    switch (ctfState) {
      case EXPECTING_CTF_FRAME_START:
        if (chunk[i] == ctf.FRAME_START) {
          ctfState = EXPECTING_CTF_PROTOCOL_SIGNATURE;
        } else {
          console.log("Error: expecting ctf start byte, received " + chunk[i]);
          // TODO
        }
      break;

      case EXPECTING_CTF_PROTOCOL_SIGNATURE:
        if (chunk[i] == ctf.PROTOCOL_SIGNATURE) {
          ctfState = EXPECTING_CTF_PAYLOAD_SIZE;
          payloadSizeBuffer = new Buffer(4);
          payloadSizeBytesLeft = 4;
        } else {
          console.log("Error: expecting ctf protocol signature byte, received " + chunk[i]);
          // TODO
        }
      break;

      case EXPECTING_CTF_PAYLOAD_SIZE:
        // continute to collect payload size bytes
        payloadSizeBuffer[payloadSizeBuffer.length - payloadSizeBytesLeft--] = chunk[i];

        if (payloadSizeBytesLeft == 0) {
          // done collecting payload size bytes
          //console.log(payloadSizeBuffer);
          var payloadSize = util.toNum(payloadSizeBuffer);
          //console.log("payload size = ", payloadSize);
          payloadBuffer = new Buffer(payloadSize);
          payloadBytesLeft = payloadSize;
          ctfState = EXPECTING_CTF_PAYLOAD;
        }
      break;

      case EXPECTING_CTF_PAYLOAD:
        payloadBuffer[payloadBuffer.length - payloadBytesLeft--] = chunk[i];
        if (payloadBytesLeft == 0) {
          //console.log("New CTF Message: " + payloadBuffer);
          ctfState = EXPECTING_CTF_FRAME_END;
        }
      break;

      case EXPECTING_CTF_FRAME_END:
        if (chunk[i] == ctf.FRAME_END) {
          //lastCTFMessage = payloadBuffer.toString();
          //console.log("=>" + payloadBuffer.toString());
          eventEmitter.emit("NewCTFMessage", payloadBuffer);
          ctfState = EXPECTING_CTF_FRAME_START;
        } else {
          console.log("Error: expecting ctf frame end byte, received " + chunk[i]);
          // TODO
        }
      break;
    }
  }
});

ctfConnection.addListener("end", function () {
  console.log("ctf server disconnected...");
});

// emit an event when a new packet arrives from ctf server
eventEmitter.addListener("NewCTFMessage", function(buf) {
  //console.log("NewCTFMessage => " + buf.toString());

  var json = ctf.toJSONObject(buf.toString());
  console.log(json);
  
  if (json['4']) {
    // quotes...
    sendPrices(json);
  }
});


