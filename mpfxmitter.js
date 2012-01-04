var net = require('net'),
    events = require('events'),
    util = require('util'),
    iniparser = require('iniparser'),
    winston = require('winston'),
    mpf = require('./mpf'),
    myutil = require('./util'),
    ctf = require('./ctf');

//
// Create a new winston logger instance with two tranports: Console, and File
//
var _logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({ 
      levels: winston.config.syslog.levels, 
      level: 'info', 
      timestamp: true
    }),
    new (winston.transports.File)({ 
      levels: winston.config.syslog.levels, 
      level: 'debug', 
      timestamp: true, 
      json: false, 
      filename: './mpf.log' 
    })
  ]
});

// parse ini configuration file
var _ini = iniparser.parseSync('./config.ini');
_logger.debug(JSON.stringify(_ini));

//
// global settings
//
var _prop = {};

// ctf configuration
_prop.ctf = {};
_prop.ctf.host = _ini.CTF.Host;
_prop.ctf.port = _ini.CTF.Port;
_prop.ctf.userid = _ini.CTF.UserID;
_prop.ctf.password = _ini.CTF.Password;

// mpf configuration
_prop.mpf = {};
_prop.mpf.host = _ini.MPF.Host;
_prop.mpf.port = _ini.MPF.Port;
_prop.mpf.heartbeatinterval = ( typeof _ini.MPF.HeartbeatInterval == 'undefined' ? 60 : _ini.MPF.HeartbeatInterval );
_prop.mpf.publishinterval = ( typeof _ini.MPF.PublishInterval == 'undefined' ? 10 : _ini.MPF.PublishInterval );
_prop.mpf.windowsize = ( typeof _ini.MPF.WindowSize == 'undefined' ? 7 : _ini.MPF.WindowSize );
_prop.mpf.timeout = ( typeof _ini.MPF.Timeout == 'undefined' ? 10 : _ini.MPF.Timeout );
_prop.mpf.naklimit = ( typeof _ini.MPF.NakLimit == 'undefined' ? 5 : _ini.MPF.NakLimit );
_prop.mpf.bankcode = ( typeof _ini.MPF.BankCode == 'undefined' ? 'IDCO' : _ini.MPF.BankCode );
_prop.mpf.citycode = ( typeof _ini.MPF.CityCode == 'undefined' ? 'NYS' : _ini.MPF.CityCode );
_prop.mpf.exch = _ini.MPF.Exchanges.split(",");
_prop.fieldmap = _ini.FieldMap;

//    
// master securities = { 
//  securities: [
//    {BBTicker: 'IHDIV', IDCTicker: 'I:IHD.IV', IDType: 4, RecordType: 70, TransactionTypes: [T,A]},
//    {BBTicker: 'ILCIV', IDCTicker: 'I:ILC.IV', IDType: 4, RecordType: 70, TransactionTypes: [T,A]}
//  ]
// };

var arr = new Array();
_prop.mpf.exch.forEach(function(exch, pos) {
  var section = _ini[exch]; // [ASX]
  if (section) {
    if (section.Securities) { // Securities=IHDIV,ILCIV,IOZIV,ISOIV
      section.Securities.split(",").forEach(function(security, pos) {
        var sym = _ini[security].IDCTicker;
        if (sym) {
          arr.push({IDCTicker: sym,
                    BBTicker: security, 
                    IDType: _ini[security].IDType,
                    RecordType: _ini[security].RecordType,
                    TransactionTypes: _ini[security].TransactionTypes.split(",")
                  });
        }
      });
    }
  }
});
_prop.securities = arr;
_logger.debug(JSON.stringify(_prop));

// global array to collect price messages coming in
var _inboxarr = new Array();

// global array to save price messages for retransmission
var _outboxarr = new Array();

// global array to keep track of the send window size...contains seqnos
var _sendwindow = new Array();

// id for ack/nak timeouts
var _timeoutid = null;


//
// event emitter
//
var _eventemitter = new events.EventEmitter();

// emit an event when a new packet arrives from ctf server
_eventemitter.addListener("NewCTFMessage", function(buf) {
  _logger.debug("NewCTFMessage = " + buf.toString());

  var ctfmsg = ctf.toJSONObject(buf.toString());
  
  if (ctfmsg['4']) {
    // quotes...collect them.
    _inboxarr.push(ctfmsg);
    _logger.debug("inbox queue size = " + _inboxarr.length);
    
    // try to publish
    sendPackets();
  }
});

// emit an event when a new packet arrives from mpf server
_eventemitter.addListener("NewMPFPacket", function(buf) {
  var mpfmsg = mpf.parse(buf);
  _logger.debug("NewMPFPacket: " + JSON.stringify(mpfmsg));
  
	if ( mpfmsg.packettype == mpf.MPF_PACKET_TYPE_ACK ) {
	  // positive acknowledgement
    processAck(mpfmsg.seqno);
	} else if ( mpfmsg.packettype == mpf.MPF_PACKET_TYPE_NAK ) {
    // negative acknowledgement
    processNak(mpfmsg.seqno);
	}
  else {
    _logger.error("Error: MPF Packet type received: " + mpfmsg.packettype);
  }
});

//
// mpf socket
//
var _mpfsock = net.createConnection(_prop.mpf.port, _prop.mpf.host, function () {
  _logger.info("connection is established with mpf server...");
  
  // start the heartbeat timer
  setInterval(sendHeartbeat, 1000 * _prop.mpf.heartbeatinterval);

  // start the publish timer
  //setInterval(sendPackets, 1000 * _mpfPublishInterval);
});

/* 
 * mpf connection handlers
 */

var laststate = mpf.MPF_FRAME_START,
    lastarr = new Array();
_mpfsock.addListener("data", function (chunk) {
  _logger.debug("data is received from mpf server <= " + chunk.toString('hex'));
  laststate = mpf.deserialize(chunk, laststate, lastarr, function (mpfarr) {
    _eventemitter.emit("NewMPFPacket", mpfarr);
  });
});

_mpfsock.addListener("end", function () {
  _logger.error("mpf server disconnected...");
  //TODO...attempt reconnection
});

/*
 *
 */
function processAck(seqno) {
  _logger.debug("processAck: MPF Ack received for packet with seqno " + seqno);

  if (seqno == 32) {
    // reset acknowledged
    _reset = false;
  } else {
    // clear timeout
    clearTimeout(_timeoutid);

    // adjust the outbox window
    _logger.debug("processAck: window array = " + _sendwindow);
    var inx = _sendwindow.indexOf(seqno);
    _sendwindow = _sendwindow.splice(++inx);
    _logger.debug("processAck: window array = " + _sendwindow);
  }
  
  // continue publishing
  sendPackets();
}

/*
 *
 */
var _nakcnt = 0;
function processNak(seqno) {
  _logger.debug("processNak: MPF Nak received for packet with seqno " + seqno);
  
  // clear timeout
  clearTimeout(_timeoutid);
  
  if (++_nakcnt == _mpfNakLimit) {
    // nak count exceeded max allowed limit
    resetSeqNo();
    sendReset();
    _nakcnt = 0;
  } else {
    // adjust the outbox window
    _logger.debug("processNak: window array = " + _sendwindow);
    var inx = _sendwindow.indexOf(prevSeqNo(seqno));
    _sendwindow = _sendwindow.splice(++inx);
    _logger.debug("processNak: window array = " + _sendwindow);

    // retransmit
    retransmit();
  }
}

var _reset = false;
function sendReset() {
  // send a reset packet with seqno 32
  _logger.info("sendReset: sending reset packet");
  var buf = mpf.createResetPacket();
  _mpfsock.write(buf);
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
  _logger.debug("sendHeartbeat: entered");
  if (_reset) {
    _logger.debug("sendHeartbeat: in reset, can't send heartbeat");
    return;
  }  
  
  if (_sendwindow.length < _prop.mpf.windowsize) {
    var seqno = nextSeqNo();
    buf = mpf.createType5Packet(seqno, _prop.mpf.bankcode);
    xmitmpf(seqno, buf);    
    if (_sendwindow.length == _prop.mpf.windowsize) {
      // no more publishing possible, set timeout for an ack or nak
      _logger.debug("sendHeartbeat: setting timeout for ack/nak after window size reached 0");
      _timeoutid = setTimeout(processTimeout, 1000 * _prop.mpf.timeout);
    }
  } else {
    //TODO
  }
}

/*
 *
 */
function sendPackets() {
  _logger.debug("sendPackets: entered");
  if (_reset) {
    _logger.debug("sendPackets: in reset");
    return;
  }
  
  // check window size and inbox for messages
  while ( _sendwindow.length < _prop.mpf.windowsize && _inboxarr.length != 0 ) {
    if ( sendPrices(_inboxarr.shift()) ) {
      if (_sendwindow.length == _prop.mpf.windowsize) {
        // no more publishing possible, set timeout for an ack or nak
        _logger.debug("sendPackets: setting timeout for ack/nak after window size reached 0");
        _timeoutid = setTimeout(processTimeout, 1000 * _prop.mpf.timeout);
        break;
      }
    }
  }
}

/*
 *
 */
function processTimeout() {  
  _logger.debug("processTimeout: entered");
  retransmit();
}

/*
 *
 */
function retransmit () {
  _logger.debug("retransmit: entered");
  // send the packets from outbox again
  _sendwindow.forEach(function (seqno, pos) {
    _logger.debug("retransmit: packet with seqno " + seqno + " => <" + buf.toString('hex') + ">");
    _mpfsock.write(_outboxarr[seqno]);
  });

  // send more packets if inbox has any and window is empty
  sendPackets();
}

// finds a security record in the config securities array
function findSecurity (sym) {
  var arr = _prop.securities;
  for (var i = 0; i < arr.length; i++) {
    if (arr[i].IDCTicker == sym) {
      return arr[i];
    }
  }
  
  return null;  
}

/*
 * sends type 2 packet to mpf server
 */
function sendPrices(jsonmsg) {
  _logger.debug("sendPrices: entered");
  _logger.info("sendPrices: " + JSON.stringify(jsonmsg));

  var srcid = jsonmsg['4'],
      sym = jsonmsg['5'],
      time = jsonmsg['16'];

  if ( srcid && sym && time ) {
    // trade or quote message,  check if on our watchlist
    var sec = findSecurity(sym);
    if (sec) {
      // create a data array for the required transaction types
      var arr = new Array(),
          arrlen = 0;
      sec.TransactionTypes.forEach(function(type, pos) {
        var field = _prop.fieldmap[type];
        if (field && jsonmsg[field]) {
          arr[type] = jsonmsg[field];
          arrlen++;
        }
      });
      if (arrlen != 0) {
        var seqno = nextSeqNo();
        buf = mpf.createType2Packet(seqno, 
                                    sec.RecordType,
                                    _prop.mpf.citycode+_prop.mpf.bankcode,
                                    new Date(parseInt(time)).format("HH:MM:ss"),
                                    sec.IDType,
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
  _logger.info("sending mpf packet with seqno " + seqno + " => <" + buf.toString('hex') + ">");
  _mpfsock.write(buf);

  // push it to outbox for restransmission if needed
  _outboxarr[seqno] = buf;
  
  // adjust window size
  _sendwindow.push(seqno);  
}

//
// ctf socket
//
var _ctfsock = net.createConnection(_prop.ctf.port, _prop.ctf.host);

/* 
* ctf connection handlers
*/

// List of CTF commands
var ctfcmds = [ 
	"5022=LoginUser|5028="+_prop.ctf.userid+"|5029="+_prop.ctf.password+"|5026=1",
	"5022=SelectAvailableTokens|5026=5",
	//"5022=SelectUserTokens|5035=5|5035=308|5035=378|5026=9",
];

_ctfsock.addListener("connect", function () {
  _logger.debug("connection is established with ctf server...");
  //client.setEncoding('ascii');
  
	ctfcmds.forEach(function(cmd, pos) {
		_ctfsock.write(ctf.serialize(cmd));
	});
	
	// subscribe to the watchlist
	_prop.securities.forEach(function(sec, pos) {
	  var cmd = "5022=QuerySnapAndSubscribe|4=741|5="+sec.IDCTicker+"|5026="+10+pos;
		_ctfsock.write(ctf.serialize(cmd));
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

_ctfsock.addListener("data", function (chunk) {
  _logger.debug("data is received from ctf server..." + chunk.toString());
  for (var i = 0; i < chunk.length; i++) {
    switch (ctfState) {
      case EXPECTING_CTF_FRAME_START:
        if (chunk[i] == ctf.FRAME_START) {
          ctfState = EXPECTING_CTF_PROTOCOL_SIGNATURE;
        } else {
          _logger.error("Error: expecting ctf start byte, received " + chunk[i]);
          // TODO
        }
      break;

      case EXPECTING_CTF_PROTOCOL_SIGNATURE:
        if (chunk[i] == ctf.PROTOCOL_SIGNATURE) {
          ctfState = EXPECTING_CTF_PAYLOAD_SIZE;
          payloadSizeBuffer = new Buffer(4);
          payloadSizeBytesLeft = 4;
        } else {
          _logger.error("Error: expecting ctf protocol signature byte, received " + chunk[i]);
          // TODO
        }
      break;

      case EXPECTING_CTF_PAYLOAD_SIZE:
        // continute to collect payload size bytes
        payloadSizeBuffer[payloadSizeBuffer.length - payloadSizeBytesLeft--] = chunk[i];

        if (payloadSizeBytesLeft == 0) {
          // done collecting payload size bytes
          _logger.debug("ctf payload size buffer = " + payloadSizeBuffer);
          var payloadSize = myutil.toNum(payloadSizeBuffer);
          _logger.debug("ctf payload size = ", payloadSize);
          payloadBuffer = new Buffer(payloadSize);
          payloadBytesLeft = payloadSize;
          ctfState = EXPECTING_CTF_PAYLOAD;
        }
      break;

      case EXPECTING_CTF_PAYLOAD:
        payloadBuffer[payloadBuffer.length - payloadBytesLeft--] = chunk[i];
        if (payloadBytesLeft == 0) {
          _logger.debug("New CTF Message: " + payloadBuffer);
          ctfState = EXPECTING_CTF_FRAME_END;
        }
      break;

      case EXPECTING_CTF_FRAME_END:
        if (chunk[i] == ctf.FRAME_END) {
          _logger.debug("ctf payload =" + payloadBuffer.toString());
          _eventemitter.emit("NewCTFMessage", payloadBuffer);
          ctfState = EXPECTING_CTF_FRAME_START;
        } else {
          _logger.error("Error: expecting ctf frame end byte, received " + chunk[i]);
          // TODO
        }
      break;
    }
  }
});

_ctfsock.addListener("end", function () {
  _logger.debug("ctf server disconnected...");
  //TODO attempt reconnection
});
