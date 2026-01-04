package monitoring

import (
	"time"
)

// Timer-related methods for MonitoringSession

// startTimer starts the silence timer with the configured threshold.
// Must be called with stateMu held.
func (s *MonitoringSession) startTimer() {
	s.timerMu.Lock()
	defer s.timerMu.Unlock()

	// Stop existing timer if any
	if s.silenceTimer != nil {
		s.silenceTimer.Stop()
	}

	threshold := time.Duration(s.Config.SilenceThreshold) * time.Second
	s.silenceTimer = time.AfterFunc(threshold, s.onTimerExpired)
}

// stopTimer stops the silence timer.
// Must be called with stateMu held.
func (s *MonitoringSession) stopTimer() {
	s.timerMu.Lock()
	defer s.timerMu.Unlock()

	if s.silenceTimer != nil {
		s.silenceTimer.Stop()
		s.silenceTimer = nil
	}
}

// resetTimer resets the silence timer to start counting from now.
// Must be called with stateMu held.
func (s *MonitoringSession) resetTimer() {
	s.timerMu.Lock()
	defer s.timerMu.Unlock()

	threshold := time.Duration(s.Config.SilenceThreshold) * time.Second

	if s.silenceTimer != nil {
		// Reset existing timer
		s.silenceTimer.Reset(threshold)
	} else {
		// Create new timer
		s.silenceTimer = time.AfterFunc(threshold, s.onTimerExpired)
	}
}

// onTimerExpired is called when the silence threshold is reached.
func (s *MonitoringSession) onTimerExpired() {
	s.stateMu.Lock()
	
	// Check if still enabled (might have been disabled while timer was running)
	if !s.enabled {
		s.stateMu.Unlock()
		return
	}

	// Update silence duration
	s.silenceDuration = time.Since(s.lastOutputTime)
	
	// Get callback
	callback := s.onSilenceThreshold
	s.stateMu.Unlock()

	// Trigger strategy execution callback
	if callback != nil {
		callback(s)
	}

	// Restart timer for next check (if still enabled)
	s.stateMu.Lock()
	if s.enabled {
		s.startTimer()
	}
	s.stateMu.Unlock()
}

// GetSilenceDuration returns the current silence duration.
func (s *MonitoringSession) GetSilenceDuration() time.Duration {
	s.stateMu.RLock()
	defer s.stateMu.RUnlock()
	
	if !s.enabled {
		return 0
	}
	return time.Since(s.lastOutputTime)
}

// GetThreshold returns the configured silence threshold.
func (s *MonitoringSession) GetThreshold() time.Duration {
	s.stateMu.RLock()
	defer s.stateMu.RUnlock()
	return time.Duration(s.Config.SilenceThreshold) * time.Second
}

// ValidateSilenceThreshold validates that a threshold value is within acceptable range.
// Returns true if valid (5-300 seconds), false otherwise.
func ValidateSilenceThreshold(threshold int) bool {
	return threshold >= 5 && threshold <= 300
}
