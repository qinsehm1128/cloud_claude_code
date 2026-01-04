package monitoring_test

import (
	"bytes"
	"math/rand"
	"sync"
	"testing"
	"testing/quick"

	"cc-platform/internal/monitoring"
)

// TestProperty2_RingBufferSemantics verifies Property 2: Context Buffer Ring Semantics
// For any sequence of PTY output bytes written to the Context_Buffer, the buffer SHALL
// always contain exactly the last N bytes (where N is the configured buffer size),
// maintaining correct order and discarding oldest bytes when full.
// Validates: Requirements 1.5

func TestProperty2_RingBufferSemantics_LastNBytes(t *testing.T) {
	// Property: After writing data, buffer contains exactly the last min(written, size) bytes
	f := func(data []byte, size uint8) bool {
		if size == 0 {
			size = 1
		}
		bufSize := int(size) + 1 // Ensure at least 1 byte buffer

		rb := monitoring.NewRingBuffer(bufSize)
		rb.Write(data)

		result := rb.Read()

		// Expected: last min(len(data), bufSize) bytes
		expectedLen := len(data)
		if expectedLen > bufSize {
			expectedLen = bufSize
		}

		if len(result) != expectedLen {
			return false
		}

		// Verify content matches last N bytes of input
		if expectedLen > 0 {
			expected := data[len(data)-expectedLen:]
			return bytes.Equal(result, expected)
		}
		return true
	}

	if err := quick.Check(f, &quick.Config{MaxCount: 1000}); err != nil {
		t.Errorf("Property 2 (Last N Bytes) failed: %v", err)
	}
}

func TestProperty2_RingBufferSemantics_OrderPreservation(t *testing.T) {
	// Property: Data order is preserved (oldest to newest)
	f := func(chunks [][]byte, size uint8) bool {
		if size == 0 {
			size = 1
		}
		bufSize := int(size) + 10 // Reasonable buffer size

		rb := monitoring.NewRingBuffer(bufSize)

		// Write all chunks
		var allData []byte
		for _, chunk := range chunks {
			rb.Write(chunk)
			allData = append(allData, chunk...)
		}

		result := rb.Read()

		// Expected: last bufSize bytes in order
		expectedLen := len(allData)
		if expectedLen > bufSize {
			expectedLen = bufSize
		}

		if len(result) != expectedLen {
			return false
		}

		if expectedLen > 0 {
			expected := allData[len(allData)-expectedLen:]
			return bytes.Equal(result, expected)
		}
		return true
	}

	if err := quick.Check(f, &quick.Config{MaxCount: 500}); err != nil {
		t.Errorf("Property 2 (Order Preservation) failed: %v", err)
	}
}

func TestProperty2_RingBufferSemantics_GetLast(t *testing.T) {
	// Property: GetLast(n) returns exactly the last n bytes (or all if n > length)
	f := func(data []byte, size uint8, lastN uint8) bool {
		if size == 0 {
			size = 1
		}
		bufSize := int(size) + 1

		rb := monitoring.NewRingBuffer(bufSize)
		rb.Write(data)

		n := int(lastN)
		result := rb.GetLast(n)

		// Calculate expected
		availableLen := len(data)
		if availableLen > bufSize {
			availableLen = bufSize
		}

		expectedLen := n
		if expectedLen > availableLen {
			expectedLen = availableLen
		}
		if n <= 0 {
			expectedLen = 0
		}

		if len(result) != expectedLen {
			return false
		}

		// Verify content
		if expectedLen > 0 {
			// Get the last expectedLen bytes from what should be in buffer
			bufferContent := data
			if len(data) > bufSize {
				bufferContent = data[len(data)-bufSize:]
			}
			expected := bufferContent[len(bufferContent)-expectedLen:]
			return bytes.Equal(result, expected)
		}
		return true
	}

	if err := quick.Check(f, &quick.Config{MaxCount: 1000}); err != nil {
		t.Errorf("Property 2 (GetLast) failed: %v", err)
	}
}

func TestProperty2_RingBufferSemantics_ConcurrentAccess(t *testing.T) {
	// Property: Concurrent reads and writes don't cause data races or corruption
	rb := monitoring.NewRingBuffer(1024)

	var wg sync.WaitGroup
	iterations := 100

	// Writers
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for j := 0; j < iterations; j++ {
				data := make([]byte, rand.Intn(100)+1)
				rand.Read(data)
				rb.Write(data)
			}
		}(i)
	}

	// Readers
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < iterations; j++ {
				_ = rb.Read()
				_ = rb.GetLast(50)
				_ = rb.Len()
			}
		}()
	}

	wg.Wait()

	// If we get here without panic/race, the test passes
	if rb.Len() > rb.Cap() {
		t.Errorf("Buffer length %d exceeds capacity %d", rb.Len(), rb.Cap())
	}
}

func TestProperty2_RingBufferSemantics_EmptyBuffer(t *testing.T) {
	rb := monitoring.NewRingBuffer(100)

	// Empty buffer should return empty slice
	if len(rb.Read()) != 0 {
		t.Error("Empty buffer Read() should return empty slice")
	}

	if len(rb.GetLast(10)) != 0 {
		t.Error("Empty buffer GetLast() should return empty slice")
	}

	if rb.Len() != 0 {
		t.Error("Empty buffer Len() should be 0")
	}
}

func TestProperty2_RingBufferSemantics_ExactFill(t *testing.T) {
	// Test exact buffer fill
	size := 100
	rb := monitoring.NewRingBuffer(size)

	data := make([]byte, size)
	for i := range data {
		data[i] = byte(i)
	}

	rb.Write(data)

	result := rb.Read()
	if !bytes.Equal(result, data) {
		t.Error("Exact fill should preserve all data")
	}

	if rb.Len() != size {
		t.Errorf("Expected length %d, got %d", size, rb.Len())
	}
}

func TestProperty2_RingBufferSemantics_Overflow(t *testing.T) {
	// Test overflow behavior
	size := 10
	rb := monitoring.NewRingBuffer(size)

	// Write more than buffer size
	data := []byte("0123456789ABCDEF") // 16 bytes
	rb.Write(data)

	result := rb.Read()
	expected := []byte("6789ABCDEF") // Last 10 bytes

	if !bytes.Equal(result, expected) {
		t.Errorf("Expected %q, got %q", expected, result)
	}
}

func TestProperty2_RingBufferSemantics_MultipleWrites(t *testing.T) {
	size := 10
	rb := monitoring.NewRingBuffer(size)

	// Multiple small writes
	rb.Write([]byte("ABC"))
	rb.Write([]byte("DEF"))
	rb.Write([]byte("GHI"))
	rb.Write([]byte("JKL"))

	result := rb.Read()
	expected := []byte("CDEFGHIJKL") // Last 10 bytes of "ABCDEFGHIJKL"

	if !bytes.Equal(result, expected) {
		t.Errorf("Expected %q, got %q", expected, result)
	}
}

func TestProperty2_RingBufferSemantics_Clear(t *testing.T) {
	rb := monitoring.NewRingBuffer(100)
	rb.Write([]byte("test data"))

	rb.Clear()

	if rb.Len() != 0 {
		t.Error("Clear should reset length to 0")
	}

	if len(rb.Read()) != 0 {
		t.Error("Clear should result in empty Read()")
	}
}

func TestProperty2_RingBufferSemantics_LargeDataWrite(t *testing.T) {
	// Property: Writing data larger than buffer keeps only last N bytes
	size := 100
	rb := monitoring.NewRingBuffer(size)

	// Write data much larger than buffer
	largeData := make([]byte, 1000)
	for i := range largeData {
		largeData[i] = byte(i % 256)
	}

	rb.Write(largeData)

	result := rb.Read()
	expected := largeData[len(largeData)-size:]

	if !bytes.Equal(result, expected) {
		t.Error("Large data write should keep only last N bytes")
	}

	if rb.Len() != size {
		t.Errorf("Expected length %d after large write, got %d", size, rb.Len())
	}
}
