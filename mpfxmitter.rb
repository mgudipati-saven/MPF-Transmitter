require 'socket'

# Global sequence number
$seqno = 32

# Mutex used to synchronize global sequence number
$mutex = Mutex.new

# Open TCP socket connection to bloomberg server
#mpfSocket = TCPSocket::new( "160.43.94.171", 23876 )
#mpfSocket = TCPSocket::new( "160.43.166.170", 23876 )
mpfSocket = TCPSocket::new( "127.0.0.1", 2000 )

# Increment the global sequence number.
def get_next_seq_no
  $mutex.synchronize do
    if $seqno == 127
      # wrap around to 32
      $seqno = 32
    end
    
    $seqno += 1
  end
end

# Compute LRC
def compute_lrc mpfPacket
  mpfPacket.byteslice(1, mpfPacket.bytesize-1).bytes.inject { |a,b| a ^ b }
end

# Print mpf packet in hex format
def print_mpf_packet mpfPacket
  mpfPacket.bytes { |c| print c.to_s(16), ' ' }
  puts
end

# Send heartbeats to bb every 1 minute
heartbeatThread = Thread.new do
  puts "Started heartbeat thread..."
  loop do
    # Format a Type 5 MPF packet...
    type5Packet = [ 0x02,             # start of transmission
                    0x25,             # packet type
                    get_next_seq_no,  # sequence number
                    0x20,             # reserved for future use
                    "IDCO",           # broker bank code
                    0x03              # end of transmission
                  ].pack("ccccA*c")

    # Compute LRC
    lrc = compute_lrc( type5Packet )

    # Append LRC byte to the MPF packet
    type5Packet << lrc
    print "=> "
    print_mpf_packet type5Packet

    # Send the MPF packet
    mpfSocket.send( type5Packet, 0 )

    # Sleep for a minute
    sleep(10)
  end
end

# Send prices to bb every 1 minute
priceThread = Thread.new do
  puts "Started price thread..."
  loop do
    # Format a Type 2 MPF packet...    
    type2Packet = [ 0x02,               # start of transmission 
                    0x22,               # packet type
                    get_next_seq_no,    # sequence number
                    '82',               # record type - funds
                    "NYCIDCO",          # source id
                    "02:30:00",         # time in HH:MM:SS GMT
                    '4',                # security identifier type - ticker symbol
                    "GOOG".ljust(12),   # security identifier
                    '01',               # instances
                    'T',                # transaction type - Trade
                    "600.00".rjust(14), # data
                    0x30,               # condition code
                    0x03                # end of transmission
                  ].pack("cccA2A7A8AA12A2AA14cc")
    
    # Compute LRC
    lrc = compute_lrc( type2Packet )

    # Append LRC byte to the MPF packet
    type2Packet << lrc
    print "=> "
    print_mpf_packet type2Packet
    
    # Send the MPF packet
    mpfSocket.send( type2Packet, 0 )

    # sleep for a minute
    sleep(10)
  end
end

# Read response packets from bloomberg server
readerThread = Thread.new do
  mpfPacket = nil
  mpfState = :ExpectingSTX
  loop do
  	# Read the responses
  	resp = mpfSocket.recv( 64 )
  	if resp.length == 0 #EOF
  		break
  	end
  	i = 0
  	until i == resp.bytesize
  		case mpfState
  			when :ExpectingSTX # Start of transmission
  				if resp.getbyte(i) == 0x02
  					mpfPacket = String.new
  					mpfState = :ExpectingETX
  				else
  					puts "Error: MPF protocol violated. Expecting <STX>, received " + resp[i]
  					break
  				end

  			when :ExpectingETX
  				if resp.getbyte(i) == 0x03
  					mpfState = :ExpectingLRC
  				end

  			when :ExpectingLRC
  			  # verify lrc
  			  mylrc = compute_lrc(mpfPacket)
  			  if resp.getbyte(i) == mylrc
  			    puts "LRC Passed!!"
  					arr = mpfPacket.unpack("cccc")
  					p arr
  					if arr[1] == 0x06
  					  # positive acknowledgement
  					  puts "ACK!"
					  elsif arr[1] == 0x15
					    # negative acknowledgement
					    puts "NAK!"
				    else
    					puts "Error: MPF protocol violated. Expecting <ACK> or <NAK>, received " + arr[1]
  					end
  					mpfState = :ExpectingSTX
			    else
  					puts "Error: LRC Failed!!. #{resp.getbyte(i)} != #{mylrc}"
  					break
          end
  		end # case 
  		mpfPacket += resp[i]
  		i += 1
  	end #until i == resp.bytesize
  end # read loop
end

# Wait for threads to run
heartbeatThread.join()
priceThread.join()
readerThread.join()

# Close the socket
mpfSocket.close