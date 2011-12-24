require 'socket'

# global sequence number
$seqno = 32

# mutex used to synchronize global sequence number
$mutex = Mutex.new

# Open TCP socket connection to bloomberg server
#mpfSocket = TCPSocket::new( "160.43.94.171", 23876 )
#mpfSocket = TCPSocket::new( "160.43.166.170", 23876 )
mpfSocket = TCPSocket::new( "127.0.0.1", 2000 )

# increment the global sequence number.
def get_next_seq_no
  $mutex.synchronize do
    if $seqno == 127
      # wrap around to 32
      $seqno = 32
    end
    
    $seqno += 1
  end
end

# compute LRC
def compute_lrc mpfPacket
  mpfPacket.byteslice(1, mpfPacket.bytesize-1).bytes.inject { |a,b| a ^ b }
end

# print mpf packet in hex format
def print_mpf_packet mpfPacket
  mpfPacket.bytes { |c| print c.to_s(16), ' ' }
  puts
end

# send heartbeats to bb every 1 minute
heartbeatThread = Thread.new do
  puts "Started heartbeat thread..."
  loop do
    # Format a Type 5 MPF packet...
    type5Packet = [ 0x02,         # start of transmission
                    0x25,         # packet type
                    get_next_seq_no, # sequence number
                    " ",          # reserved for future use
                    "IDCO",       # broker bank code
                    0x03          # end of transmission
                  ].pack("cccAA*c")

    # Compute LRC
    lrc = compute_lrc( type5Packet )

    # Append LRC byte to the MPF packet
    type5Packet << lrc
    print_mpf_packet type5Packet

    # Send the MPF packet
    mpfSocket.send( type5Packet, 0 )
    resp = mpfSocket.recv( 1024 )
    puts "<= #{resp}"    

    sleep(10)
  end
end

# send prices to bb every 1 minute
priceThread = Thread.new do
  puts "Started price thread..."
  loop do
    # Format a Type 2 MPF packet...    
    type2Packet = [ 0x02,               # start of transmission 
                    0x22,               # packet type
                    get_next_seq_no,    # sequence number
                    "82",               # record type - funds
                    "NYCIDCO",          # source id
                    "02:30:00",         # time in HH:MM:SS GMT
                    4,                  # security identifier type - ticker symbol
                    "GOOG".ljust(12),   # security identifier
                    1,                  # instances
                    "T",                # transaction type - Trade
                    "600.00".rjust(14), # data
                    0x30,               # condition code
                    0x03                # end of transmission
                  ].pack("cccA2A7A8cA12cAA14cc")
    
    # Compute LRC
    lrc = compute_lrc( type2Packet )

    # Append LRC byte to the MPF packet
    type2Packet << lrc
    print_mpf_packet type2Packet
    
    # Send the MPF packet
    mpfSocket.send( type2Packet, 0 )
    resp = mpfSocket.recv( 1024 )
    puts "<= #{resp}"    
    
    sleep(1)
  end
end
   
heartbeatThread.join()
priceThread.join()

=begin
# read response messages from bloomberg server
mpfMessage = nil
mpfState = :ExpectingFrameStart
payloadSizeBytes = 0
done = false
while !done
	# Read the MPF messages
	mpfResponse = mpfSocket.recv( 4*1024 )
	puts mpfResponse
	if mpfResponse.length == 0 #EOF
		break
	end
	i = 0
	until i == mpfResponse.bytesize
		case mpfState
			when :ExpectingFrameStart
				if mpfResponse.getbyte(i) == 4
					puts "MPF Message Begin"
					mpfMessage = String.new
					mpfState = :ExpectingProtocolSignature
				else
					puts "Error: MPF protocol violated. Expecting frame start, received " + mpfResponse[i]
					break
				end
		
			when :ExpectingProtocolSignature
				if mpfResponse.getbyte(i) == 32
					payloadSizeBytes = 0
					mpfState = :ExpectingPayloadSize
				else
					puts "Error: MPF protocol violated. Expecting protocol signature, received " + mpfResponse[i]
					break
				end
		
			when :ExpectingPayloadSize
				payloadSizeBytes += 1
				if payloadSizeBytes == 4
					mpfState = :ExpectingFrameEnd
				end
			
			when :ExpectingFrameEnd
				if mpfResponse.getbyte(i) == 3
					puts "MPF Message End"
					payload = mpfMessage.unpack("ccNA*")[3]
					puts payload
					mpfState = :ExpectingFrameStart
				end
		end
		mpfMessage += mpfResponse[i]
		i += 1
	end
end
=end

# Close the socket
mpfSocket.close