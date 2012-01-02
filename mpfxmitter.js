var net = require('net'),
    events = require('events'),
    iniparser = require('../src/node_modules/iniparser/lib/node-iniparser'),
    mpf = require('./mpf'),
    util = require('./util'),
    ctf = require('./ctf');

// parse ini configuration file
var config = iniparser.parseSync('./config.ini');
console.log(config);

// ctf configuration
var CTF_HOST = config.CTF.Host,
    CTF_PORT = config.CTF.Port,
    CTF_USERID = config.CTF.UserID,
    CTF_PASSWORD = config.CTF.Password;

// mpf configuration
var MPF_HOST = config.MPF.Host,
    MPF_PORT = config.MPF.Port,
    MPF_HEARTBEAT_INTERVAL = config.MPF.HeartbeatInterval,
    MPF_PUBLISH_INTERVAL = config.MPF.PublishInterval,
    MPF_WINDOW_SIZE = config.MPF.WindowSize,
    MPF_TIMEOUT = config.MPF.Timeout,
    MPF_NAK_LIMIT = config.MPF.NakLimit,
    MPF_BANK_CODE = config.MPF.BankCode,
    MPF_CITY_CODE = config.MPF.CityCode,
    exchanges = config.MPF.Exchanges.split(","),
    jsonFieldMap = config.FieldMap;
    
// master securities watchlist
var securitiesWatchList = new Array();
var jsonSecurities = {};
exchanges.forEach(function(exch, pos) {
  var section = config[exch];
  if (section) {
    if (section.Securities) {
      section.Securities.split(",").forEach(function(security, pos) {
        var sym = config[security].IDCTicker;
        if (sym) {
          securitiesWatchList.push(sym);
          jsonSecurities[sym] = { "BBTicker": security, 
                                  "IDType": config[security].IDType,
                                  "RecordType": config[security].RecordType,
                                  "TransactionTypes": config[security].TransactionTypes.split(",")
                                };
        }
      });
    }
  }
});

// event emitter
var eventEmitter = new events.EventEmitter();
  
// mpf connection
var mpfConnection = net.createConnection(MPF_PORT, MPF_HOST, function () {
  console.log("connection is established with mpf server...");
  
  // start the heartbeat timer
  setInterval(sendHeartbeat, 1000 * MPF_HEARTBEAT_INTERVAL);

  // start the publish timer
  //setInterval(sendPackets, 1000 * MPF_PUBLISH_INTERVAL);
});

/* 
 * mpf connection handlers
 */

var laststate = mpf.MPF_FRAME_START,
    lastarr = new Array();
mpfConnection.addListener("data", function (chunk) {
  console.log("data is received from mpf server <= " + chunk.toString('hex'));
  laststate = mpf.deserialize(chunk, laststate, lastarr, function (mpfarr) {
    eventEmitter.emit("NewMPFPacket", mpfarr);
  });
});

mpfConnection.addListener("end", function () {
  console.log("mpf server disconnected...");
});

// emit an event when a new packet arrives from mpf server
eventEmitter.addListener("NewMPFPacket", function(buf) {
  var mpfmsg = mpf.parse(buf);
  console.log(mpfmsg);
	if ( mpfmsg.PacketType == mpf.MPF_PACKET_TYPE_ACK ) {
	  // positive acknowledgement
    processAck(mpfmsg.SeqNo);
	} else if ( mpfmsg.PacketType == mpf.MPF_PACKET_TYPE_NAK ) {
    // negative acknowledgement
    processNak(mpfmsg.SeqNo);
	}
  else {
    console.log("Error: MPF Packet type received: " + mpfmsg.PacketType);
  }
});

/*
 *
 */
function processAck(seqno) {
  console.log("MPF Ack received for packet with seqno " + seqno);

  if (seqno == 32) {
    // reset acknowledged
    _reset = false;
  } else {
    // clear timeout
    clearTimeout(_timeoutId);

    // adjust the outbox window
    console.log("window array = " + _windowArr);
    var inx = _windowArr.indexOf(seqno);
    _windowArr = _windowArr.splice(++inx);
    console.log("window array = " + _windowArr);
  }
  
  // continue publishing
  sendPackets();
}

/*
 *
 */
 var _nakCount = 0;
function processNak(seqno) {
  console.log("MPF Nak received for packet with seqno " + seqno);
  
  // clear timeout
  clearTimeout(_timeoutId);
  
  if (++_nakCount == MPF_NAK_LIMIT) {
    // nak count exceeded max allowed limit
    resetSeqNo();
    sendReset();
    _nakCount = 0;
  } else {
    // adjust the outbox window
    console.log("window array = " + _windowArr);
    var inx = _windowArr.indexOf(prevSeqNo(seqno));
    _windowArr = _windowArr.splice(++inx);
    console.log("window array = " + _windowArr);

    // retransmit
    retransmit();
  }
}

var _reset = false;
function sendReset() {
  // send a reset packet with seqno 32
  console.log("Sending reset packet");
  var buf = mpf.createResetPacket();
  mpfConnection.write(buf);
  _reset = true;
}

function resetSeqNo() {
  _seqno = 32;
}

/*
 * Increment the global sequence number.
 */
var _seqno = 32;
function nextSeqNo() {
   if (_seqno == 127) {
     // wrap around to 32
     _seqno = 32;
   }

   return ++_seqno;
}

function prevSeqNo(seqno) {
  if (seqno == 33) {
    return 127;
  }
  
  return --seqno;
}

/*
 * sends heartbeat packet to mpf server
 */
function sendHeartbeat () {
  if (_windowArr.length < MPF_WINDOW_SIZE) {
    var seqno = nextSeqNo();
    buf = mpf.createType5Packet(seqno, MPF_BANK_CODE);
    xmitmpf(seqno, buf);    
    if (_windowArr.length == MPF_WINDOW_SIZE) {
      // no more publishing possible, set timeout for an ack or nak
      console.log("Setting timeout for ack/nak after window size reached 0");
      _timeoutId = setTimeout(processTimeout, 1000 * MPF_TIMEOUT);
    }
  } else {
    //TODO
  }
}

var _outboxArr = new Array();
var _windowArr = new Array();
var _timeoutId = null;

/*
 *
 */
function sendPackets() {
  if (_reset) {
    return;
  }
  
  // check window size and inbox for messages
  while ( _windowArr.length < MPF_WINDOW_SIZE && _inboxArr.length != 0 ) {
    if ( sendPrices(_inboxArr.shift()) ) {
      if (_windowArr.length == MPF_WINDOW_SIZE) {
        // no more publishing possible, set timeout for an ack or nak
        console.log("Setting timeout for ack/nak after window size reached 0");
        _timeoutId = setTimeout(processTimeout, 1000 * MPF_TIMEOUT);
        break;
      }
    }
  }
}

/*
 *
 */
function processTimeout() {  
  console.log("MPF Timeout");
  retransmit();
}

/*
 *
 */
function retransmit () {
  // send the packets from outbox again
  _windowArr.forEach(function (seqno, pos) {
    console.log("retransmitting packet with seqno " + seqno + " => <" + buf.toString('hex') + ">");
    mpfConnection.write(_outboxArr[seqno]);
  });

  // send more packets, if any
  sendPackets();
}

/*
 * sends type 2 packet to mpf server
 */
function sendPrices(jsonmsg) {
  var srcid = jsonmsg['4'],
      sym = jsonmsg['5'],
      time = jsonmsg['16'];

  if ( srcid && sym && time ) {
    console.log(jsonmsg);
    // trade or quote message,  check if on our watchlist
    if (jsonSecurities[sym]) {
      // create a data array for the required transaction types
      var arr = new Array(),
          arrlen = 0;
      jsonSecurities[sym].TransactionTypes.forEach(function(type, pos) {
        var field = jsonFieldMap[type];
        if (field && jsonmsg[field]) {
          arr[type] = jsonmsg[field];
          arrlen++;
        }
      });
      if (arrlen != 0) {
        var seqno = nextSeqNo();
        buf = mpf.createType2Packet(seqno, 
                                    jsonSecurities[sym].RecordType,
                                    MPF_CITY_CODE+MPF_BANK_CODE,
                                    new Date(parseInt(time)).format("HH:MM:ss"),
                                    jsonSecurities[sym].IDType,
                                    sym,
                                    arrlen,
                                    arr,
                                    0x30);
        xmitmpf(seqno, buf);
        return true;
      }
    } 
  }
  
  return false;
}

function xmitmpf(seqno, buf) {
  console.log("sending mpf packet with seqno " + seqno + " => <" + buf.toString('hex') + ">");
  mpfConnection.write(buf);

  // push it to outbox for restransmission if needed
  _outboxArr[seqno] = buf;
  
  // adjust window size
  _windowArr.push(seqno);  
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
	//"5022=Subscribe|4=741|5026=12",
];

ctfConnection.addListener("connect", function () {
  console.log("connection is established with ctf server...");
  //client.setEncoding('ascii');
  
	ctfCommandList.forEach(function(cmd, pos) {
		ctfConnection.write(ctf.serialize(cmd));
	});
	
	// subscribe to the watchlist
	securitiesWatchList.forEach(function(sym, pos) {
	  var cmd = "5022=QuerySnapAndSubscribe|4=741|5="+sym+"|5026="+10+pos;
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

// global array to collect price messages coming in
var _inboxArr = new Array();

// emit an event when a new packet arrives from ctf server
eventEmitter.addListener("NewCTFMessage", function(buf) {
  //console.log("NewCTFMessage => " + buf.toString());

  var ctfmsg = ctf.toJSONObject(buf.toString());
  
  if (ctfmsg['4']) {
    // quotes...collect them.
    _inboxArr.push(ctfmsg);
    console.log("num price messages = " + _inboxArr.length);
    
    // try to publish
    sendPackets();
  }
});
