package monitoring

import (
	"sync"
)

// RingBuffer implements a thread-safe circular buffer for storing PTY output context.
// It maintains the last N bytes of output, discarding oldest bytes when full.
type RingBuffer struct {
	data     []byte
	size     int
	writePos int
	length   int // actual data length (0 to size)
	mu       sync.RWMutex
}

// NewRingBuffer creates a new ring buffer with the specified size in bytes.
func NewRingBuffer(size int) *RingBuffer {
	if size <= 0 {
		size = 8192 // default 8KB
	}
	return &RingBuffer{
		data:     make([]byte, size),
		size:     size,
		writePos: 0,
		length:   0,
	}
}

// Write appends data to the buffer, overwriting oldest data if necessary.
// Returns the number of bytes written (always len(p) unless buffer is nil).
func (rb *RingBuffer) Write(p []byte) (n int, err error) {
	if len(p) == 0 {
		return 0, nil
	}

	rb.mu.Lock()
	defer rb.mu.Unlock()

	// If incoming data is larger than buffer, only keep the last 'size' bytes
	if len(p) >= rb.size {
		copy(rb.data, p[len(p)-rb.size:])
		rb.writePos = 0
		rb.length = rb.size
		return len(p), nil
	}

	// Write data byte by byte, wrapping around
	for _, b := range p {
		rb.data[rb.writePos] = b
		rb.writePos = (rb.writePos + 1) % rb.size
		if rb.length < rb.size {
			rb.length++
		}
	}

	return len(p), nil
}

// Read reads all data from the buffer in correct order (oldest to newest).
// Returns a copy of the data, leaving the buffer unchanged.
func (rb *RingBuffer) Read() []byte {
	rb.mu.RLock()
	defer rb.mu.RUnlock()

	if rb.length == 0 {
		return []byte{}
	}

	result := make([]byte, rb.length)

	if rb.length < rb.size {
		// Buffer not full yet, data starts at 0
		copy(result, rb.data[:rb.length])
	} else {
		// Buffer is full, data starts at writePos (oldest) and wraps around
		// First part: from writePos to end
		firstPart := rb.size - rb.writePos
		copy(result[:firstPart], rb.data[rb.writePos:])
		// Second part: from 0 to writePos
		copy(result[firstPart:], rb.data[:rb.writePos])
	}

	return result
}

// GetLast returns the last n bytes from the buffer.
// If n is greater than the buffer content, returns all available data.
func (rb *RingBuffer) GetLast(n int) []byte {
	rb.mu.RLock()
	defer rb.mu.RUnlock()

	if rb.length == 0 || n <= 0 {
		return []byte{}
	}

	if n > rb.length {
		n = rb.length
	}

	result := make([]byte, n)

	// Calculate start position for last n bytes
	// The newest byte is at (writePos - 1 + size) % size
	// We want n bytes ending at that position
	endPos := rb.writePos // writePos is where next write will go, so last written is at writePos-1
	startPos := (endPos - n + rb.size) % rb.size

	if startPos < endPos {
		// Contiguous region
		copy(result, rb.data[startPos:endPos])
	} else {
		// Wrapped region
		firstPart := rb.size - startPos
		copy(result[:firstPart], rb.data[startPos:])
		copy(result[firstPart:], rb.data[:endPos])
	}

	return result
}

// Len returns the current number of bytes stored in the buffer.
func (rb *RingBuffer) Len() int {
	rb.mu.RLock()
	defer rb.mu.RUnlock()
	return rb.length
}

// Cap returns the capacity of the buffer.
func (rb *RingBuffer) Cap() int {
	return rb.size
}

// Clear resets the buffer to empty state.
func (rb *RingBuffer) Clear() {
	rb.mu.Lock()
	defer rb.mu.Unlock()
	rb.writePos = 0
	rb.length = 0
}

// String returns the buffer content as a string.
func (rb *RingBuffer) String() string {
	return string(rb.Read())
}
