package mode

import "testing"

func TestModeManager_SwitchingAndCallbacks(t *testing.T) {
	mgr := NewModeManager(nil, nil, nil)

	if got := mgr.GetMode(1); got != ModeTUI {
		t.Fatalf("expected default mode TUI, got %s", got)
	}

	var cbContainer uint
	var cbMode ContainerMode
	var cbClosed int
	mgr.SetOnModeSwitch(func(containerID uint, mode ContainerMode, closedSessions int) {
		cbContainer = containerID
		cbMode = mode
		cbClosed = closedSessions
	})

	closed, err := mgr.SwitchToHeadless(1, "docker-id")
	if err != nil {
		t.Fatalf("SwitchToHeadless error: %v", err)
	}
	if closed != 0 {
		t.Fatalf("expected 0 closed sessions, got %d", closed)
	}
	if got := mgr.GetMode(1); got != ModeHeadless {
		t.Fatalf("expected headless mode, got %s", got)
	}
	if cbContainer != 1 || cbMode != ModeHeadless || cbClosed != 0 {
		t.Fatalf("callback not invoked as expected")
	}

	closed, err = mgr.SwitchToTUI(1)
	if err != nil {
		t.Fatalf("SwitchToTUI error: %v", err)
	}
	if closed != 0 {
		t.Fatalf("expected 0 closed sessions, got %d", closed)
	}
	if got := mgr.GetMode(1); got != ModeTUI {
		t.Fatalf("expected TUI mode, got %s", got)
	}
}

func TestModeManager_EnsureMode(t *testing.T) {
	mgr := NewModeManager(nil, nil, nil)

	closed, err := mgr.EnsureMode(2, "docker-id", ModeHeadless)
	if err != nil {
		t.Fatalf("EnsureMode error: %v", err)
	}
	if closed != 0 {
		t.Fatalf("expected 0 closed sessions, got %d", closed)
	}
	if got := mgr.GetMode(2); got != ModeHeadless {
		t.Fatalf("expected headless mode, got %s", got)
	}

	closed, err = mgr.EnsureMode(2, "docker-id", ModeHeadless)
	if err != nil {
		t.Fatalf("EnsureMode repeat error: %v", err)
	}
	if closed != 0 {
		t.Fatalf("expected 0 closed sessions, got %d", closed)
	}
}
