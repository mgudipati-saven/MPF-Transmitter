/*
 */

var util = require('./util'),

	MPF_FRAME_START = exports.MPF_FRAME_START = 0x02, // start of transmission
	MPF_FRAME_END = exports.MPF_FRAME_END = 0x03, // end of transmission
	MPF_PACKET_TYPE_5 = exports.MPF_PACKET_TYPE_5 = 0x25, // packet type 5
	MPF_PACKET_TYPE_2 = exports.MPF_PACKET_TYPE_2 = 0x22, // packet type 2
	MPF_PACKET_TYPE_ACK = exports.MPF_PACKET_TYPE_ACK = 0x06, // positive acknowledgement packet
	MPF_PACKET_TYPE_NAK = exports.MPF_PACKET_TYPE_NAK = 0x15; // negative acknowledgement packet
	
/**
 * createType5Packet
 * Creates an mpf packet of type 5 for heartbeats.
 *
 * @param       int     sequence number
 * @param       string  banker code
 * @return      buffer  heartbeat packet
 * @access      public
 */
exports.createType5Packet = function createType5Packet (seqno, code) {
  buf = new Buffer(10);
  buf[0] = MPF_FRAME_START;       // start of transmission
  buf[1] = MPF_PACKET_TYPE_5;     // packet type
  buf[2] = seqno;                 // sequence number
  buf[3] = 0x20;                  // reserved for future use
  buf.write(code, 4, 4, 'ascii'); // broker bank code
  buf[8] = MPF_FRAME_END;         // end of transmission
  
  // compute lrc
  buf[9] = util.computeLRC( buf, 1, 8 );
  
	return buf;
}

/**
 * createType2Packet
 * Creates an mpf packet of type 2 for prices.
 *
 * @param       int     sequence number
 * @param       string  banker code
 * @param       string  banker code
 * @param       string  banker code
 * @param       string  banker code
 * @param       string  banker code
 * @param       string  banker code
 * @param       string  banker code
 * @param       string  banker code
 * @return      buffer  type 2 packet
 * @access      public
 */
exports.createType2Packet = function createType2Packet (seqno, rectype, srcid, time, idtype, id, num, data, cond) {
  buf = new Buffer(38 + 15 * num);

  var offset = 0;
  buf[offset++] = MPF_FRAME_START;                                    // start of transmission
  buf[offset++] = MPF_PACKET_TYPE_2;                                  // packet type
  buf[offset++] = seqno;                                              // sequence number
  buf.write(rectype, offset, 2, 'ascii');                             // record type
  offset += 2;
  buf.write(srcid, offset, 7, 'ascii');                               // source id
  offset += 7
  buf.write(time, offset, 8, 'ascii')                                 // time in HH:MM:SS GMT
  offset += 8;
  buf.write(idtype, offset++, 1, 'ascii');                            // security identifier type
  buf.write(util.ljust(id, ' ', 12), offset, 12, 'ascii');            // security identifier
  buf.writeInt16BE(num, 33);
  offset += 12;
  for (var item in data) {
    buf.write(item, offset++, 1, 'ascii');                            // transaction type
    buf.write(util.rjust(data[item], ' ', 14), offset, 14, 'ascii');  // data
    offset += 14;
  }
  buf[offset++] = cond;                                               // condition code
  buf[offset++] = MPF_FRAME_END;                                      // end of transmission
  
  // compute lrc
  buf[offset] = util.computeLRC( buf, 1, offset-1 );
  
	return buf;
}

/**
 * createACKPacket
 * Creates an mpf packet of type <ACK> for positive acknowledgement.
 *
 * @param       int     sequence number
 * @return      buffer  positive acknowledgement packet
 * @access      public
 */
exports.createACKPacket = function createACKPacket (seqno) {
  buf = new Buffer(5);
  buf[0] = MPF_FRAME_START;       // start of transmission
  buf[1] = MPF_PACKET_TYPE_ACK;   // packet type
  buf[2] = seqno;                 // sequence number
  buf[3] = MPF_FRAME_END;         // end of transmission
  
  // compute lrc
  buf[4] = util.computeLRC( buf, 1, 3 );
  
	return buf;
}

/**
 * createNAKPacket
 * Creates an mpf packet of type <NAK> for negative acknowledgement.
 *
 * @param       int     sequence number
 * @return      buffer  negative acknowledgement packet
 * @access      public
 */
exports.createNAKPacket = function createNAKPacket (seqno) {
  buf = new Buffer(5);
  buf[0] = MPF_FRAME_START;       // start of transmission
  buf[1] = MPF_PACKET_TYPE_NAK;   // packet type
  buf[2] = seqno;                 // sequence number
  buf[3] = MPF_FRAME_END;         // end of transmission
  
  // compute lrc
  buf[4] = util.computeLRC( buf, 1, 3 );
  
	return buf;
}

/**
 * parse
 * Parses an MPF Packet.
 *
 * @param       buffer  mpf packet
 * @return      json    json formatted mpf data
 * @access      public
 */
exports.parse = function parse (buf) {
  json = { "PacketType": buf[1], "SeqNo": buf[2] };

  return json;
}