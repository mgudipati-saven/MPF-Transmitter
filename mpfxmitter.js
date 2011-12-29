var net = require('net'),
  events = require('events'),
  iniparser = require('../src/node_modules/iniparser/lib/node-iniparser'),
  mpf = require('./mpf'),
  util = require('./util'),
  ctf = require('./ctf');

// parse ini configuration file
var config = iniparser.parseSync('./config.ini');
//console.log(config.ctf.host + ":" + config.ctf.port);

// ctf configuration
var CTF_HOST = config.CTF.Host,
  CTF_PORT = config.CTF.Port,
  CTF_USERID = config.CTF.UserID,
  CTF_PASSWORD = config.CTF.Password;

// mpf configuration
var MPF_HOST = config.MPF.Host,
  MPF_PORT = config.MPF.Port,
  MPF_HEARTBEAT_INTERVAL = config.MPF.HeartbeatInterval,
  MPF_BANK_CODE = config.MPF.BankCode,
  MPF_CITY_CODE = config.MPF.CityCode;
  
// event emitter
var eventEmitter = new events.EventEmitter();
  
// mpf connection
var mpfConnection = net.createConnection(MPF_PORT, MPF_HOST, function () {
  console.log("connection is established with mpf server...");
  
  setInterval(sendHeartbeat, 1000 * MPF_HEARTBEAT_INTERVAL);
});

/* 
 * mpf connection handlers
 */
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
  buf = mpf.createType5Packet(nextSeqNo(), MPF_BANK_CODE);
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
ctfConnection = net.createConnection(CTF_PORT, CTF_HOST);

/* 
* ctf connection handlers
*/

// List of CTF commands
var ctfCommandList = [ 
	"5022=LoginUser|5028="+CTF_USERID+"|5029="+CTF_PASSWORD+"|5026=1",
	"5022=SelectAvailableTokens|5026=5",
	//"5022=SelectUserTokens|5035=5|5035=308|5035=378|5026=9",
	//"5022=QuerySnap|4=941|5=E:TCS.EQ|5026=11",
	//"5022=Subscribe|4=741|5026=12",
	"5022=Subscribe|4=741|5026=12",
	//"5022=QuerySnapAndSubscribe|4=941|5=E:TCS.EQ|5026=22",
];

ctfConnection.addListener("connect", function () {
  console.log("connection is established with ctf server...");
  //client.setEncoding('ascii');
  
	ctfCommandList.forEach(function(cmd, pos) {
		ctfConnection.write(ctf.serialize(cmd));
	});
});

// ctf message parser states...
var EXPECTING_CTF_FRAME_START = 1,
  EXPECTING_CTF_PROTOCOL_SIGNATURE = 2,
  EXPECTING_CTF_PAYLOAD_SIZE = 3,
  EXPECTING_CTF_PAYLOAD = 4,
  EXPECTING_CTF_FRAME_END = 5;

// ctf message parsing...
var ctfState = EXPECTING_CTF_FRAME_START, // current ctf state
  payloadBuffer = null, // buffer to hold ctf payload
  payloadBytesLeft = 0, // ctf payload bytes left to be processed
  payloadSizeBuffer = null, // buffer to hold ctf payload size
  payloadSizeBytesLeft = 0; // ctf payload size bytes left to be processed

ctfConnection.addListener("data", function (chunk) {
  //console.log("data is received from ctf server..." + chunk.toString());
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


