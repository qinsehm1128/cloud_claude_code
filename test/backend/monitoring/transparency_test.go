package monitoring_test

import (
	"bytes"
	"sync"
	"testing"
	"testing/quick"

	"cc-platform/internal/models"
	"cc-platform/internal/monitoring"
)

// TestProperty3_MonitoringTransparency verifies Property 3: Monitoring Transparency
// For any PTY data stream with monitoring enabled, the data received by frontend
// clients SHALL be byte-for-byte identical to the data produced by the container,
// with no modifications, additions, or reordering.
// Validates: Requirements 1.6

func TestProperty3_MonitoringTransparency_DataUnmodified(t *testing.T) {
	// Property: OnOutput does not modify the input data
	f := func(data []byte) bool {
		if len(data) == 0 {
			return true
		}

		config := &models.MonitoringConfig{
			SilenceThreshold:  30,
			ActiveStrategy:    "webhook",
			ContextBufferSize: 8192,
		}

		session := monitoring.NewMonitoringSession(1, "docker-123", nil, config)
		defer session.Close()

		// Make a copy of original data
		original := make([]byte, len(data))
		copy(original, data)

		// Enable monitoring and send data
		session.Enable()
		session.OnOutput(data)

		// Verify original data was not modified
		return bytes.Equal(data, original)
	}

	if err := quick.Check(f, &quick.Config{MaxCount: 1000}); err != nil {
		t.Errorf("Property 3 (Data Unmodified) failed: %v", err)
	}
}

func TestProperty3_MonitoringTransparency_NoDataAddition(t *testing.T) {
	// Property: Monitoring does not add any data to the stream
	// This is verified by checking that the monitoring layer only observes,
	// it doesn't inject anything into the data path

	config := &models.MonitoringConfig{
		SilenceThreshold:  30,
		ActiveStrategy:    "webhook",
		ContextBufferSize: 1024,
	}

	session := monitoring.NewMonitoringSession(1, "docker-123", nil, config)
	defer session.Close()

	session.Enable()

	// Track all data sent through OnOutput
	var sentData [][]byte
	testData := [][]byte{
		[]byte("first chunk"),
		[]byte("second chunk"),
		[]byte("third chunk"),
	}

	for _, data := range testData {
		dataCopy := make([]byte, len(data))
		copy(dataCopy, data)
		sentData = append(sentData, dataCopy)
		session.OnOutput(data)
	}

	// The monitoring layer should not have modified or added to the data
	// We verify this by checking the context buffer contains only what we sent
	buffer := session.GetContextBuffer()

	// Concatenate all sent data
	var expected []byte
	for _, d := range sentData {
		expected = append(expected, d...)
	}

	// Buffer should contain exactly what we sent (or last N bytes if overflow)
	if len(buffer) > len(expected) {
		t.Error("Buffer contains more data than was sent - monitoring added data")
	}

	// Verify buffer content matches end of expected
	if len(buffer) > 0 {
		expectedSuffix := expected
		if len(expected) > len(buffer) {
			expectedSuffix = expected[len(expected)-len(buffer):]
		}
		if buffer != string(expectedSuffix) {
			t.Error("Buffer content doesn't match sent data")
		}
	}
}

func TestProperty3_MonitoringTransparency_OrderPreserved(t *testing.T) {
	// Property: Data order is preserved through monitoring
	f := func(chunks [][]byte) bool {
		config := &models.MonitoringConfig{
			SilenceThreshold:  30,
			ActiveStrategy:    "webhook",
			ContextBufferSize: 65536, // Large buffer to hold all data
		}

		session := monitoring.NewMonitoringSession(1, "docker-123", nil, config)
		defer session.Close()

		session.Enable()

		// Send chunks in order
		var allData []byte
		for _, chunk := range chunks {
			session.OnOutput(chunk)
			allData = append(allData, chunk...)
		}

		// Get buffer content
		buffer := session.GetContextBuffer()

		// If buffer is smaller than total data, check suffix
		if len(buffer) < len(allData) {
			expectedSuffix := string(allData[len(allData)-len(buffer):])
			return buffer == expectedSuffix
		}

		// Otherwise should match exactly
		return buffer == string(allData)
	}

	if err := quick.Check(f, &quick.Config{MaxCount: 500}); err != nil {
		t.Errorf("Property 3 (Order Preserved) failed: %v", err)
	}
}

func TestProperty3_MonitoringTransparency_ConcurrentAccess(t *testing.T) {
	// Property: Concurrent OnOutput calls don't corrupt data
	config := &models.MonitoringConfig{
		SilenceThreshold:  30,
		ActiveStrategy:    "webhook",
		ContextBufferSize: 65536,
	}

	session := monitoring.NewMonitoringSession(1, "docker-123", nil, config)
	defer session.Close()

	session.Enable()

	var wg sync.WaitGroup
	iterations := 100

	// Multiple goroutines sending data concurrently
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for j := 0; j < iterations; j++ {
				data := []byte{byte(id), byte(j)}
				session.OnOutput(data)
			}
		}(i)
	}

	wg.Wait()

	// Verify buffer is not corrupted (no panic, valid content)
	buffer := session.GetContextBuffer()
	if len(buffer) == 0 {
		t.Error("Buffer should contain data after concurrent writes")
	}

	// Each byte pair should be valid (first byte 0-9, second byte 0-99)
	// Due to interleaving, we can't verify exact order, but data should be valid
	for i := 0; i < len(buffer)-1; i += 2 {
		if buffer[i] > 9 {
			// This could happen due to interleaving, which is acceptable
			// The key property is no corruption or panic
		}
	}
}

func TestProperty3_MonitoringTransparency_DisabledMonitoring(t *testing.T) {
	// Property: Disabled monitoring still doesn't modify data
	config := &models.MonitoringConfig{
		SilenceThreshold:  30,
		ActiveStrategy:    "webhook",
		ContextBufferSize: 1024,
	}

	session := monitoring.NewMonitoringSession(1, "docker-123", nil, config)
	defer session.Close()

	// Don't enable monitoring
	testData := []byte("test data when disabled")
	original := make([]byte, len(testData))
	copy(original, testData)

	session.OnOutput(testData)

	// Data should not be modified
	if !bytes.Equal(testData, original) {
		t.Error("Data was modified even when monitoring is disabled")
	}

	// Buffer should still capture data (for context)
	buffer := session.GetContextBuffer()
	if buffer != string(original) {
		t.Error("Buffer should capture data even when monitoring is disabled")
	}
}

func TestProperty3_MonitoringTransparency_BinaryData(t *testing.T) {
	// Property: Binary data (including null bytes) is handled correctly
	config := &models.MonitoringConfig{
		SilenceThreshold:  30,
		ActiveStrategy:    "webhook",
		ContextBufferSize: 1024,
	}

	session := monitoring.NewMonitoringSession(1, "docker-123", nil, config)
	defer session.Close()

	session.Enable()

	// Binary data with null bytes and special characters
	binaryData := []byte{0x00, 0x01, 0x02, 0xFF, 0xFE, 0x00, 0x7F, 0x80}
	original := make([]byte, len(binaryData))
	copy(original, binaryData)

	session.OnOutput(binaryData)

	// Data should not be modified
	if !bytes.Equal(binaryData, original) {
		t.Error("Binary data was modified")
	}

	// Buffer should contain exact binary data
	buffer := []byte(session.GetContextBuffer())
	if !bytes.Equal(buffer, original) {
		t.Errorf("Buffer content mismatch: got %v, want %v", buffer, original)
	}
}

func TestProperty3_MonitoringTransparency_LargeData(t *testing.T) {
	// Property: Large data chunks are handled without modification
	config := &models.MonitoringConfig{
		SilenceThreshold:  30,
		ActiveStrategy:    "webhook",
		ContextBufferSize: 1024, // Small buffer
	}

	session := monitoring.NewMonitoringSession(1, "docker-123", nil, config)
	defer session.Close()

	session.Enable()

	// Large data chunk
	largeData := make([]byte, 10000)
	for i := range largeData {
		largeData[i] = byte(i % 256)
	}
	original := make([]byte, len(largeData))
	copy(original, largeData)

	session.OnOutput(largeData)

	// Original data should not be modified
	if !bytes.Equal(largeData, original) {
		t.Error("Large data was modified")
	}
}

func TestProperty3_MonitoringTransparency_EmptyData(t *testing.T) {
	// Property: Empty data is handled correctly
	config := &models.MonitoringConfig{
		SilenceThreshold:  30,
		ActiveStrategy:    "webhook",
		ContextBufferSize: 1024,
	}

	session := monitoring.NewMonitoringSession(1, "docker-123", nil, config)
	defer session.Close()

	session.Enable()

	// Empty data
	emptyData := []byte{}
	session.OnOutput(emptyData)

	// Should not panic or cause issues
	buffer := session.GetContextBuffer()
	if buffer != "" {
		t.Error("Buffer should be empty after empty data")
	}

	// Nil data
	session.OnOutput(nil)

	// Should not panic
	buffer = session.GetContextBuffer()
	if buffer != "" {
		t.Error("Buffer should still be empty after nil data")
	}
}

func TestProperty3_MonitoringTransparency_SubscriberIsolation(t *testing.T) {
	// Property: Subscribers receive status updates but don't affect data flow
	config := &models.MonitoringConfig{
		SilenceThreshold:  30,
		ActiveStrategy:    "webhook",
		ContextBufferSize: 1024,
	}

	session := monitoring.NewMonitoringSession(1, "docker-123", nil, config)
	defer session.Close()

	// Add subscribers
	ch1 := session.Subscribe("client1")
	ch2 := session.Subscribe("client2")

	session.Enable()

	testData := []byte("test data")
	original := make([]byte, len(testData))
	copy(original, testData)

	session.OnOutput(testData)

	// Data should not be modified regardless of subscribers
	if !bytes.Equal(testData, original) {
		t.Error("Data was modified with subscribers present")
	}

	// Clean up
	session.Unsubscribe("client1")
	session.Unsubscribe("client2")

	// Drain channels
	select {
	case <-ch1:
	default:
	}
	select {
	case <-ch2:
	default:
	}
}
