/**
 * Multi Product Feed
 * 
 * @author Murty Gudipati
 * @version 1.0
 * 
 * copyright 2012, Saven Technologies, Inc
 * 
 */
var net = require('net'),
    events = require('events'),
    util = require('util'), 
    myutil = require('./util'),
    
  	MPF_PACKET_START = exports.MPF_PACKET_START           = 0x02, // start of packet
  	MPF_PACKET_END = exports.MPF_PACKET_END               = 0x03, // end of packet
  	MPF_PACKET_LRC = exports.MPF_PACKET_LRC               = 0x04, // lrc
  	MPF_PACKET_TYPE_RESET = exports.MPF_PACKET_TYPE_RESET = 0x05, // reset packet
  	MPF_PACKET_TYPE_ACK = exports.MPF_PACKET_TYPE_ACK     = 0x06, // positive acknowledgement packet
  	MPF_PACKET_TYPE_NAK = exports.MPF_PACKET_TYPE_NAK     = 0x15, // negative acknowledgement packet
  	MPF_PACKET_TYPE_2 = exports.MPF_PACKET_TYPE_2         = 0x22, // packet type 2, prices
  	MPF_PACKET_TYPE_5 = exports.MPF_PACKET_TYPE_5         = 0x25; // packet type 5, heartbeat

/**
 * MPF Client constructor
 * 
 * @param {Socket} stream
 * 		The feed's socket stream
 */
function Client(stream) {
	this._sock = stream;

  this._state = MPF_PACKET_START;   // current ctf state
  
  // event emitter
	events.EventEmitter.call(this);
}
util.inherits(Client, events.EventEmitter);

/**
 * createClient
 *    Creates a new instance of the client object attached to the stream
 *
 * @param {Socket} stream
 * 		The feed's socket stream
 *
 * @return {Client} 
 *    A new instance of the MPF Client object
 *
 * @access public
 */
exports.createClient = function (stream) {
  var c = new Client(stream);

  // initialize feed parser
  stream.on('data', function (chunk) {
    //console.log("data is received from mpf stream <= " + chunk.toString('hex'));
    c.deserialize(chunk);
  });

  return c;
}

/**
 * sendPacket
 *    Sends an mpf packet on the wire
 *
 * @param {JSON} data
 *    JSON data
 *
 * @access public
 */
Client.prototype.sendPacket = function(data) {
  var self = this,
      buf = null;

  switch (data.PacketType) {
    case MPF_PACKET_TYPE_RESET:
      buf = createResetPacket();
    break;

    case MPF_PACKET_TYPE_ACK:
      buf = createACKPacket(data.SeqNo);
    break;
    
    case MPF_PACKET_TYPE_NAK:
      buf = createNAKPacket(data.SeqNo);
    break;

    case MPF_PACKET_TYPE_2:
      buf = createType2Packet(data);
    break;

    case MPF_PACKET_TYPE_5:
      buf = createType5Packet(data);
    break;    
  }
  
  if (buf) {
    self._sock.write(buf);
  }
}

/**
 * createType5Packet
 *    Creates an mpf packet of type 5 for heartbeats.
 *
 * @param {JSON} data
 * 		The JSON data
 *
 * @return  {Buffer}  
 *    The heartbeat packet
 */
function createType5Packet (data) {
  buf = new Buffer(10);
  buf[0] = MPF_PACKET_START;                 // start of transmission
  buf[1] = MPF_PACKET_TYPE_5;               // packet type
  buf[2] = data.SeqNo;                      // sequence number
  buf[3] = 0x20;                            // reserved for future use
  buf.write(data.BankCode, 4, 4, 'ascii');  // broker bank code
  buf[8] = MPF_PACKET_END;                   // end of transmission
  buf[9] = myutil.computeLRC(buf, 1, 8);    // compute lrc

	return buf;
}

/**
 * createType2Packet
 *    Creates an mpf packet of type 2 for prices.
 *
 * @param {JSON} data
 *    The JSON formatted price data
 *
 * @return {Buffer}
 *    type 2 packet
 *
 */
function createType2Packet (data) {
  buf = new Buffer(37 + 15 * data.Transactions.length);

  var offset = 0;
  buf[offset++] = MPF_PACKET_START;                                    // start of transmission
  buf[offset++] = MPF_PACKET_TYPE_2;                                  // packet type
  buf[offset++] = data.SeqNo;                                              // sequence number

  buf.write(data.RecordType, offset, 2, 'ascii');                             // record type e.g. '70' for Bond
  offset += 2;

  buf.write(data.SourceID, offset, 7, 'ascii');                               // source id e.g. 'NYSIDCO'
  offset += 7

  buf.write(data.TimeStamp, offset, 8, 'ascii')                                 // time in HH:MM:SS GMT
  offset += 8;

  buf.write(data.SecurityIDType, offset++, 1, 'ascii');                            // security identifier type

  var securityid = myutil.ljust(data.SecurityID, ' ', 12);
  buf.write(securityid, offset, 12, 'ascii');                         // security identifier
  offset += 12;

  buf.write("%02d".printf(data.Transactions.length), offset);                              // number of instances or tansactions
  offset += 2;

  data.Transactions.forEach (function(item) {
    buf.write(item.Type, offset++, 1, 'ascii');                            // transaction type
    var val = myutil.rjust(item.Value, ' ', 14);
    buf.write(val, offset, 14, 'ascii');                              // data
    offset += 14;
  });
  
  buf[offset++] = MPF_PACKET_END;                                      // end of transmission
  
  buf[offset] = myutil.computeLRC( buf, 1, offset-1 );// compute lrc

	return buf;
}

/**
 * createResetPacket
 *    Creates an mpf reset packet of with seqno 32.
 *
 * @return {Buffer} 
 *    reset packet
 */
function createResetPacket () {
  buf = new Buffer(5);
  buf[0] = MPF_PACKET_START;               // start of transmission
  buf[1] = MPF_PACKET_TYPE_2;             // packet type
  buf[2] = 32;                            // sequence number
  buf[3] = MPF_PACKET_END;                 // end of transmission
  buf[4] = myutil.computeLRC(buf, 1, 3);  // compute lrc
  
	return buf;
}

/**
 * createACKPacket
 * Creates an mpf packet of type <ACK> for positive acknowledgement.
 *
 * @param {Number} seqno
 * 		The sequence number of the packet to be acknowledged
 *
 * @return  {Buffer}  
 *    The ack packet
 */
function createACKPacket (seqno) {
  buf = new Buffer(5);
  buf[0] = MPF_PACKET_START;               // start of transmission
  buf[1] = MPF_PACKET_TYPE_ACK;           // packet type
  buf[2] = seqno;                         // sequence number
  buf[3] = MPF_PACKET_END;                 // end of transmission
  buf[4] = myutil.computeLRC(buf, 1, 3);  // compute lrc
  
	return buf;
}

/**
 * createNAKPacket
 * Creates an mpf packet of type <NAK> for negative acknowledgement.
 *
 * @param {Number} seqno
 * 		The sequence number of the packet to be acknowledged
 *
 * @return  {Buffer}  
 *    The nak packet
 */
function createNAKPacket (seqno) {
  buf = new Buffer(5);
  buf[0] = MPF_PACKET_START;                 // start of transmission
  buf[1] = MPF_PACKET_TYPE_NAK;             // packet type
  buf[2] = seqno;                           // sequence number
  buf[3] = MPF_PACKET_END;                   // end of transmission  
  buf[4] = myutil.computeLRC( buf, 1, 3 );  // compute lrc
  
	return buf;
}

/**
 * toJSON
 *    Creates a JSON object out of an mpf packet.
 *
 * @param {Buffer}  buf
 *    The mpf packet
 * 
 * @return {JSON} 
 *    JSON formatted mpf data
 */
function toJSON (buf) {
  var json = {};
  
  // header
  if (buf[1]) {
    json.PacketType = buf[1];    
  }
  
  if (buf[2]) {
    json.SeqNo = buf[2];    
  }

  return json;
}

/**
 * deserialize
 *    deserializes mpf packets from partial byte stream.
 *
 * @param {Buffer} buf
 *    mpf bytes read from the stream
 * 
 * @access public
 */
Client.prototype.deserialize = function (buf) {
  for (var i = 0; i < buf.length; i++) {
    switch (this._state) {
      case MPF_PACKET_START:
        if (buf[i] == MPF_PACKET_START) {
          this._state = MPF_PACKET_END;
          this._packet = [];
        } else {
          console.log("Error: expecting mpf start of transmission, received " + buf[i]);
          // TODO
        }
      break;
      
      case MPF_PACKET_END:
        if (buf[i] == MPF_PACKET_END) {
          this._state = MPF_PACKET_LRC;
        }        
      break;

      case MPF_PACKET_LRC:
        lrc = myutil.computeLRC(this._packet, 1, this._packet.length-1);
        if (buf[i] == lrc) {
          this.emit('packet', toJSON(this._packet));
          this._state = MPF_PACKET_START;
        } else {
          console.log("Error: LRC Failed!! " + lrc + " != " + buf[i]);
          // TODO
        }        
      break;
    }
    
    // copy the byte into mpf array
    this._packet.push(buf[i]);
  }
}