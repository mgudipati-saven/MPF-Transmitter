/*
 */

var util = require('./util'),

	MPF_FRAME_START = exports.MPF_FRAME_START = 0x02, // start of transmission
	MPF_FRAME_END = exports.MPF_FRAME_END = 0x03, // end of transmission
	MPF_PACKET_TYPE_5 = exports.MPF_PACKET_TYPE_5 = 0x25 // packet type 5
	MPF_PACKET_TYPE_2 = exports.MPF_PACKET_TYPE_2 = 0x22 // packet type 2
	
/**
 * createType5Packet
 * Creates an mpf packet of type 5 for heartbeats.
 *
 * @param       int     sequence number
 * @param       string  banker code
 * @return      buffer  heartbeat message
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
 * Creates an mpf packet of type 5 for prices.
 *
 * @param       int     sequence number
 * @param       string  banker code
 * @return      buffer  heartbeat message
 * @access      public
 */
exports.createType2Packet = function createType2Packet (seqno, rectype, srcid, bcode, time, idtype, secid, data, cond) {
  buf = new Buffer(53);
  buf[0] = MPF_FRAME_START;                   // start of transmission
  buf[1] = MPF_PACKET_TYPE_2;                 // packet type
  buf[2] = seqno;                             // sequence number
  buf.write('80', 3, 2, 'ascii');             // record type
  buf.write('NYCTEST', 5, 7, 'ascii');        // source id
  buf.write('09:51:21', 12, 8, 'ascii')       // time in HH:MM:SS GMT
  buf.write('2', 20, 1, 'ascii');             // security identifier type
  buf.write(util.ljust('DE0008408477', ' ', 12), 21, 12, 'ascii'); // security identifier
  buf.write('01', 33, 2, 'ascii');            // instances
  buf.write('A', 35, 1, 'ascii');             // transaction type
  buf.write(util.rjust('396.09', ' ', 14), 36, 14, 'ascii');       // data
  buf[50] = 0x30;                             // condition code
  buf[51] = MPF_FRAME_END;                    // end of transmission
  
  // compute lrc
  buf[52] = util.computeLRC( buf, 1, 51 );
  
	return buf;
}
