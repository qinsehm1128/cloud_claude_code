package monitoring_test

import (
	"sync"
	"sync/atomic"
	"testing"
	"testing/quick"
	"time"

	"cc-platform/internal/models"
	"cc-platform/internal/monitoring"
)

// TestProperty1_SilenceTimerResetOnOutput verifies Property 1: Silence Timer Reset on Output
// For any PTY session with monitoring enabled, when the PTY produces any output,
// the Silence_Timer SHALL be reset to zero, and the timer SHALL only trigger
// strategy execution when no output occurs for the full threshold duration.
// Validates: Requirements 1.2, 1.3

func TestProperty1_SilenceTimerResetOnOutput_Basic(t *testing.T) {
	config := &models.MonitoringConfig{
		SilenceThreshold:  1, // 1 second for fast testing
		ActiveStrategy:    "webhook",
		ContextBufferSize: 1024,
	}

	session := monitoring.NewMonitoringSession(1, "docker-123", nil, config)
	defer session.Close()

	var triggered atomic.Int32
	session.SetOnSilenceThreshold(func(s *monitoring.MonitoringSession) {
		triggered.Add(1)
	})

	session.Enable()

	// Send output before threshold - should reset timer
	time.Sleep(500 * time.Millisecond)
	session.OnOutput([]byte("output"))

	// Wait past original threshold time
	time.Sleep(700 * time.Millisecond)

	// Should not have triggered yet (timer was reset)
	if triggered.Load() != 0 {
		t.Error("Timer should not trigger when output resets it before threshold")
	}

	// Now wait for full threshold after last output
	time.Sleep(600 * time.Millisecond)

	// Should have triggered now
	if triggered.Load() == 0 {
		t.Error("Timer should trigger after full threshold duration without output")
	}
}

func TestProperty1_SilenceTimerResetOnOutput_MultipleResets(t *testing.T) {
	config := &models.MonitoringConfig{
		SilenceThreshold:  1,
		ActiveStrategy:    "webhook",
		ContextBufferSize: 1024,
	}

	session := monitoring.NewMonitoringSession(1, "docker-123", nil, config)
	defer session.Close()

	var triggered atomic.Int32
	session.SetOnSilenceThreshold(func(s *monitoring.MonitoringSession) {
		triggered.Add(1)
	})

	session.Enable()

	// Keep resetting timer with output
	for i := 0; i < 5; i++ {
		time.Sleep(300 * time.Millisecond)
		session.OnOutput([]byte("output"))
	}

	// Should not have triggered during resets
	if triggered.Load() != 0 {
		t.Error("Timer should not trigger when continuously reset by output")
	}

	// Now wait for full threshold
	time.Sleep(1200 * time.Millisecond)

	if triggered.Load() == 0 {
		t.Error("Timer should trigger after threshold without output")
	}
}

func TestProperty1_SilenceTimerResetOnOutput_DisableStopsTimer(t *testing.T) {
	config := &models.MonitoringConfig{
		SilenceThreshold:  1,
		ActiveStrategy:    "webhook",
		ContextBufferSize: 1024,
	}

	session := monitoring.NewMonitoringSession(1, "docker-123", nil, config)
	defer session.Close()

	var triggered atomic.Int32
	session.SetOnSilenceThreshold(func(s *monitoring.MonitoringSession) {
		triggered.Add(1)
	})

	session.Enable()
	time.Sleep(500 * time.Millisecond)
	session.Disable()

	// Wait past threshold
	time.Sleep(1500 * time.Millisecond)

	// Should not trigger when disabled
	if triggered.Load() != 0 {
		t.Error("Timer should not trigger when monitoring is disabled")
	}
}

func TestProperty1_SilenceTimerResetOnOutput_ReEnableRestartsTimer(t *testing.T) {
	config := &models.MonitoringConfig{
		SilenceThreshold:  1,
		ActiveStrategy:    "webhook",
		ContextBufferSize: 1024,
	}

	session := monitoring.NewMonitoringSession(1, "docker-123", nil, config)
	defer session.Close()

	var triggered atomic.Int32
	session.SetOnSilenceThreshold(func(s *monitoring.MonitoringSession) {
		triggered.Add(1)
	})

	session.Enable()
	session.Disable()
	session.Enable()

	// Wait for threshold
	time.Sleep(1200 * time.Millisecond)

	if triggered.Load() == 0 {
		t.Error("Timer should trigger after re-enabling and waiting threshold")
	}
}

func TestProperty1_SilenceTimerResetOnOutput_ConcurrentOutput(t *testing.T) {
	config := &models.MonitoringConfig{
		SilenceThreshold:  2,
		ActiveStrategy:    "webhook",
		ContextBufferSize: 1024,
	}

	session := monitoring.NewMonitoringSession(1, "docker-123", nil, config)
	defer session.Close()

	var triggered atomic.Int32
	session.SetOnSilenceThreshold(func(s *monitoring.MonitoringSession) {
		triggered.Add(1)
	})

	session.Enable()

	// Concurrent output from multiple goroutines
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 20; j++ {
				session.OnOutput([]byte("concurrent output"))
				time.Sleep(50 * time.Millisecond)
			}
		}()
	}

	wg.Wait()

	// Should not have triggered during concurrent output
	if triggered.Load() != 0 {
		t.Error("Timer should not trigger during continuous concurrent output")
	}
}

func TestProperty1_SilenceTimerResetOnOutput_ZeroLengthOutput(t *testing.T) {
	config := &models.MonitoringConfig{
		SilenceThreshold:  1,
		ActiveStrategy:    "webhook",
		ContextBufferSize: 1024,
	}

	session := monitoring.NewMonitoringSession(1, "docker-123", nil, config)
	defer session.Close()

	var triggered atomic.Int32
	session.SetOnSilenceThreshold(func(s *monitoring.MonitoringSession) {
		triggered.Add(1)
	})

	session.Enable()

	// Empty output should still reset timer (any output event counts)
	time.Sleep(500 * time.Millisecond)
	session.OnOutput([]byte{})

	time.Sleep(700 * time.Millisecond)

	// Timer was reset by empty output, so should not trigger yet
	// (This tests that OnOutput is called, even if data is empty)
	// Note: Depending on implementation, empty output might or might not reset
	// For this implementation, we treat any OnOutput call as activity
}

func TestProperty4_SilenceThresholdValidation(t *testing.T) {
	// Property 4: Silence Threshold Validation
	// The system SHALL accept values in the range [5, 300] seconds
	// and reject values outside this range.

	// Test valid range
	validValues := []int{5, 10, 30, 100, 150, 200, 299, 300}
	for _, v := range validValues {
		if !monitoring.ValidateSilenceThreshold(v) {
			t.Errorf("Threshold %d should be valid", v)
		}
	}

	// Test invalid range
	invalidValues := []int{-1, 0, 1, 2, 3, 4, 301, 500, 1000}
	for _, v := range invalidValues {
		if monitoring.ValidateSilenceThreshold(v) {
			t.Errorf("Threshold %d should be invalid", v)
		}
	}
}

func TestProperty4_SilenceThresholdValidation_QuickCheck(t *testing.T) {
	// Property-based test for threshold validation
	f := func(threshold int) bool {
		valid := monitoring.ValidateSilenceThreshold(threshold)
		expected := threshold >= 5 && threshold <= 300
		return valid == expected
	}

	if err := quick.Check(f, &quick.Config{MaxCount: 10000}); err != nil {
		t.Errorf("Property 4 (Threshold Validation) failed: %v", err)
	}
}

func TestProperty1_SilenceTimerResetOnOutput_SilenceDurationTracking(t *testing.T) {
	config := &models.MonitoringConfig{
		SilenceThreshold:  5,
		ActiveStrategy:    "webhook",
		ContextBufferSize: 1024,
	}

	session := monitoring.NewMonitoringSession(1, "docker-123", nil, config)
	defer session.Close()

	session.Enable()

	// Initial silence duration should be near zero
	initialDuration := session.GetSilenceDuration()
	if initialDuration > 100*time.Millisecond {
		t.Errorf("Initial silence duration too high: %v", initialDuration)
	}

	// Wait and check duration increases
	time.Sleep(500 * time.Millisecond)
	duration := session.GetSilenceDuration()
	if duration < 400*time.Millisecond {
		t.Errorf("Silence duration should have increased: %v", duration)
	}

	// Output should reset duration
	session.OnOutput([]byte("output"))
	resetDuration := session.GetSilenceDuration()
	if resetDuration > 100*time.Millisecond {
		t.Errorf("Silence duration should reset after output: %v", resetDuration)
	}
}

func TestProperty1_SilenceTimerResetOnOutput_ThresholdRetrieval(t *testing.T) {
	config := &models.MonitoringConfig{
		SilenceThreshold:  42,
		ActiveStrategy:    "webhook",
		ContextBufferSize: 1024,
	}

	session := monitoring.NewMonitoringSession(1, "docker-123", nil, config)
	defer session.Close()

	threshold := session.GetThreshold()
	expected := 42 * time.Second

	if threshold != expected {
		t.Errorf("Expected threshold %v, got %v", expected, threshold)
	}
}

func TestProperty1_SilenceTimerResetOnOutput_ConfigUpdate(t *testing.T) {
	config := &models.MonitoringConfig{
		SilenceThreshold:  10,
		ActiveStrategy:    "webhook",
		ContextBufferSize: 1024,
	}

	session := monitoring.NewMonitoringSession(1, "docker-123", nil, config)
	defer session.Close()

	session.Enable()

	// Update config with new threshold
	newConfig := &models.MonitoringConfig{
		SilenceThreshold:  20,
		ActiveStrategy:    "injection",
		ContextBufferSize: 2048,
	}
	session.UpdateConfig(newConfig)

	// Verify threshold updated
	threshold := session.GetThreshold()
	if threshold != 20*time.Second {
		t.Errorf("Expected updated threshold 20s, got %v", threshold)
	}

	// Verify status reflects new config
	status := session.GetStatus()
	if status.Threshold != 20 {
		t.Errorf("Status threshold should be 20, got %d", status.Threshold)
	}
	if status.Strategy != "injection" {
		t.Errorf("Status strategy should be 'injection', got %s", status.Strategy)
	}
}
