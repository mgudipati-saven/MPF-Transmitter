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
var _recvQueue = [],

    // global queue of outgoing messages.
    _sendQueue = [],

    // global queue of outgoing seqno to track window size
    _sendWindow = [],

    // global id for ack or nak timer
    _timeoutId = null,

    // global id for heartbeat timer
    _intervalID = null,

    // global seqence number, starts from 33 and wraps around at 127
    _seqno = 32,
    
    // global mpf socket stream
    _mpfStream = null,
    
    // global mpf client
    _mpfClient = null,
    
    // global ctf socket stream
    _ctfStream = null,
    
    // global ctf client
    _ctfClient = null,
    
    // global nak count
    _nakCount = 0;

// Initialize MPF Connection
initMPF();

// Initialize CTF Connection
initCTF();

/*
 */
function initMPF () {
  _mpfStream = net.createConnection(_prop.mpf.port, _prop.mpf.host, function () {
    _logger.info("connection is established with mpf server...");

    // create a client for the new mpf stream
    _mpfClient = mpf.createClient(_mpfStream);
   
   // register message listener
    _mpfClient.on('packet', function(packet) {
      _logger.debug("new mpf packet received: " + JSON.stringify(packet));

     	switch (packet.PacketType) {
     	  case mpf.MPF_PACKET_TYPE_ACK:
     	    // positive acknowledgement
          processAck(packet.SeqNo);
        break;
     	  
     	  case mpf.MPF_PACKET_TYPE_NAK:
          // negative acknowledgement
          processNak(packet.SeqNo);
     	  break;
     	} 
    });
      
    // clear the current heartbeat timer
    clearInterval(_intervalID);

    // start the heartbeat timer
    setInterval(sendHeartbeat, 1000 * _prop.mpf.heartbeatinterval);
  });

  _mpfStream.addListener("end", function () {
    _logger.error("mpf server disconnected, attempting reconnection...");
    initMPF();
  });
}

/*
 */
function initCTF () {
  _ctfStream = net.createConnection(_prop.ctf.port, _prop.ctf.host, function() {
    _logger.info("established ctf connection...");

    // CTF Client Object
    _ctfClient = ctf.createClient(_ctfStream);

    // register messsage listener
    _ctfClient.on('message', function(msg) {
      _logger.info("new ctf message received: " + JSON.stringify(msg));
      
      if (msg['4']) {
        // quotes...collect them.
        _recvQueue.push(msg);
        _logger.debug("recv queue queue size = " + _recvQueue.length);

        // try to publish
        sendPackets();
      }
    });

    // send login command
    _ctfClient.sendCommand("5022=LoginUser|5028="+_prop.ctf.userid+"|5029="+_prop.ctf.password+"|5026=1");
    _ctfClient.sendCommand("5022=SelectAvailableTokens|5026=2");
  	//"5022=SelectUserTokens|5035=5|5035=308|5035=378|5026=9",
  
    // subscribe to the watchlist
  	_prop.securities.forEach(function(sec, pos) {
  	  var cmd = "5022=QuerySnapAndSubscribe|4=741|5="+sec.IDCTicker+"|5026="+10+pos;
      _ctfClient.sendCommand(cmd);
  	});
  });

  _ctfStream.addListener("end", function () {
    _logger.debug("ctf server disconnected...");
    initCTF();
  });
}

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
    clearTimeout(_timeoutId);

    // adjust the send queue window
    adjustSendWindow(seqno);
  }
  
  // continue publishing
  sendPackets();
}

/*
 *
 */
function processNak(seqno) {
  _logger.debug("processNak: MPF Nak received for packet with seqno " + seqno);
  
  // clear timeout
  clearTimeout(_timeoutId);
  _logger.debug("processNak: Timeout cleared");
  
  if (++_nakCount == _mpfNakLimit) {
    // nak count exceeded max allowed limit
    resetSeqNo();
    sendReset();
    _nakCount = 0;
  } else {
    // adjust the send queue window
    adjustSendWindow(prevSeqNo(seqno));
    
    // retransmit
    retransmit();
  }
}

function adjustSendWindow(seqno) {
  _logger.debug("adjustSendWindow: send queue = " + JSON.stringify(_sendQueue));
  var inx = -1;
  for (var i=0; i<_sendQueue.length; i++) {
    var packet = _sendQueue[i];
    if (packet.SeqNo == seqno) {
      inx = i;
      break;
    }
  }
  if (inx) {
    _sendQueue = _sendQueue.splice(++inx);
    _logger.debug("adjustSendWindow: send queue = " + JSON.stringify(_sendQueue));
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
  if ( _reset ) {
    _logger.debug("sendHeartbeat: in reset, can't send heartbeat");
    return;
  }  
  
  if ( _sendQueue.length < _prop.mpf.windowsize ) {
    var packet = { PacketType: 0x25, SeqNo: nextSeqNo(), BankCode: _prop.mpf.bankcode };
    _mpfClient.sendPacket(packet);
    
    // push it to send queue for restransmission if needed
    _sendQueue.push(packet);
    
    if ( _sendQueue.length == _prop.mpf.windowsize ) {
      // no more publishing possible, set timeout for an ack or nak
      _logger.debug("sendHeartbeat: setting timeout for ack/nak after window size reached 0");
      _timeoutId = setTimeout(processTimeout, 1000 * _prop.mpf.timeout);
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
  
  // check window size and recv queue for messages
  while ( _sendQueue.length < _prop.mpf.windowsize && _recvQueue.length != 0 ) {
    if ( sendPrices( _recvQueue.shift() ) ) {
      if ( _sendQueue.length == _prop.mpf.windowsize) {
        // no more publishing possible, set timeout for an ack or nak
        _logger.debug("sendPackets: setting timeout for ack/nak after window size reached 0");
        _timeoutId = setTimeout(processTimeout, 1000 * _prop.mpf.timeout);
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
  
  // send the packets from send queue again
  _sendQueue.forEach(function (packet) {
    _logger.debug("retransmit: " + JSON.stringify(packet));
    _mpfClient.sendPacket(packet);
  });

  // send more packets if recv queue has any and window is empty, else set timeout for ack/nak
  if ( _sendQueue.length == _prop.mpf.windowsize) {
    // no more publishing possible, set timeout for an ack or nak
    _logger.debug("sendPackets: setting timeout for ack/nak after window size reached 0");
    _timeoutId = setTimeout(processTimeout, 1000 * _prop.mpf.timeout);
  } else {
    sendPackets();
  }
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
function sendPrices(msg) {
  _logger.info("sendPrices: " + JSON.stringify(msg));

  var srcid = msg['4'],
      sym = msg['5'],
      time = msg['16'];

  if ( srcid && sym && time ) {
    // trade or quote message,  check if on our watchlist
    var sec = findSecurity(sym);
    if (sec) {
      // create an array of transactions
      var arr = new Array();
      sec.TransactionTypes.forEach(function(type, pos) {
        var field = _prop.fieldmap[type];
        if (field && msg[field]) {
          arr.push( { Type: type, Value: msg[field] } );
        }
      });
      var packet = {  PacketType:     0x22,
                      SeqNo:          nextSeqNo(),
                      RecordType:     sec.RecordType,
                      SourceID:       _prop.mpf.citycode+_prop.mpf.bankcode,
                      TimeStamp:      new Date(parseInt(time)).format("HH:MM:ss"),
                      SecurityIDType: sec.IDType,
                      SecurityID:     sym,
                      Transactions:   arr,
                    };
      _mpfClient.sendPacket(packet);

      // push it to send queue for restransmission if needed
      _sendQueue.push(packet);      
      return true;
    } 
  }
  
  return false;
}