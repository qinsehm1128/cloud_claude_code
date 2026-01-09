package headless

import (
	"testing"

	"cc-platform/internal/models"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func setupHeadlessTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}

	if err := db.AutoMigrate(
		&models.HeadlessConversation{},
		&models.HeadlessTurn{},
		&models.HeadlessEvent{},
	); err != nil {
		t.Fatalf("failed to migrate: %v", err)
	}

	return db
}

func TestHistoryManager_CreateAndGetConversation(t *testing.T) {
	db := setupHeadlessTestDB(t)
	mgr := NewHeadlessHistoryManager(db)

	conv, err := mgr.CreateConversation("session-1", 42)
	if err != nil {
		t.Fatalf("CreateConversation error: %v", err)
	}
	if conv.ID == 0 {
		t.Fatalf("expected conversation ID")
	}

	got, err := mgr.GetConversation("session-1")
	if err != nil {
		t.Fatalf("GetConversation error: %v", err)
	}
	if got == nil || got.ID != conv.ID {
		t.Fatalf("unexpected conversation: %+v", got)
	}
}

func TestHistoryManager_StartTurnAndAppendEvent(t *testing.T) {
	db := setupHeadlessTestDB(t)
	mgr := NewHeadlessHistoryManager(db)

	conv, err := mgr.CreateConversation("session-2", 7)
	if err != nil {
		t.Fatalf("CreateConversation error: %v", err)
	}

	turn, err := mgr.StartTurn(conv.ID, "hello", models.HeadlessPromptSourceUser)
	if err != nil {
		t.Fatalf("StartTurn error: %v", err)
	}
	if turn.TurnIndex != 0 {
		t.Fatalf("expected TurnIndex 0, got %d", turn.TurnIndex)
	}

	if err := mgr.AppendEvent(turn.ID, models.HeadlessEventTypeAssistant, "", `{"type":"assistant"}`); err != nil {
		t.Fatalf("AppendEvent error: %v", err)
	}
	if err := mgr.AppendEvent(turn.ID, models.HeadlessEventTypeResult, "", `{"type":"result"}`); err != nil {
		t.Fatalf("AppendEvent error: %v", err)
	}

	events, err := mgr.GetTurnEvents(turn.ID)
	if err != nil {
		t.Fatalf("GetTurnEvents error: %v", err)
	}
	if len(events) != 2 {
		t.Fatalf("expected 2 events, got %d", len(events))
	}
	if events[0].EventIndex != 0 || events[1].EventIndex != 1 {
		t.Fatalf("unexpected event indices: %d, %d", events[0].EventIndex, events[1].EventIndex)
	}
}

func TestHistoryManager_CompleteAndFailTurn(t *testing.T) {
	db := setupHeadlessTestDB(t)
	mgr := NewHeadlessHistoryManager(db)

	conv, err := mgr.CreateConversation("session-3", 9)
	if err != nil {
		t.Fatalf("CreateConversation error: %v", err)
	}

	turn, err := mgr.StartTurn(conv.ID, "go", models.HeadlessPromptSourceUser)
	if err != nil {
		t.Fatalf("StartTurn error: %v", err)
	}

	if err := mgr.CompleteTurn(turn.ID, "ok", "model", 1, 2, 0.01, 100); err != nil {
		t.Fatalf("CompleteTurn error: %v", err)
	}

	turnAfter, err := mgr.GetTurnByID(turn.ID)
	if err != nil {
		t.Fatalf("GetTurnByID error: %v", err)
	}
	if turnAfter.State != models.HeadlessTurnStateCompleted {
		t.Fatalf("expected completed, got %s", turnAfter.State)
	}

	convAfter, err := mgr.GetConversationByID(conv.ID)
	if err != nil {
		t.Fatalf("GetConversationByID error: %v", err)
	}
	if convAfter.State != models.HeadlessConversationStateIdle {
		t.Fatalf("expected idle, got %s", convAfter.State)
	}

	turn2, err := mgr.StartTurn(conv.ID, "fail", models.HeadlessPromptSourceUser)
	if err != nil {
		t.Fatalf("StartTurn error: %v", err)
	}
	if err := mgr.FailTurn(turn2.ID, "boom"); err != nil {
		t.Fatalf("FailTurn error: %v", err)
	}

	turn2After, err := mgr.GetTurnByID(turn2.ID)
	if err != nil {
		t.Fatalf("GetTurnByID error: %v", err)
	}
	if turn2After.State != models.HeadlessTurnStateError {
		t.Fatalf("expected error, got %s", turn2After.State)
	}
}

func TestHistoryManager_RecentAndBeforeTurns(t *testing.T) {
	db := setupHeadlessTestDB(t)
	mgr := NewHeadlessHistoryManager(db)

	conv, err := mgr.CreateConversation("session-4", 11)
	if err != nil {
		t.Fatalf("CreateConversation error: %v", err)
	}

	var turns []models.HeadlessTurn
	for i := 0; i < 5; i++ {
		turn, err := mgr.StartTurn(conv.ID, "p", models.HeadlessPromptSourceUser)
		if err != nil {
			t.Fatalf("StartTurn error: %v", err)
		}
		turns = append(turns, *turn)
	}

	recent, hasMore, err := mgr.GetRecentTurns(conv.ID, 3)
	if err != nil {
		t.Fatalf("GetRecentTurns error: %v", err)
	}
	if len(recent) != 3 || !hasMore {
		t.Fatalf("expected 3 turns with hasMore, got %d, hasMore=%v", len(recent), hasMore)
	}
	if recent[0].TurnIndex != 2 || recent[2].TurnIndex != 4 {
		t.Fatalf("unexpected turn order: %d..%d", recent[0].TurnIndex, recent[2].TurnIndex)
	}

	beforeID := turns[3].ID // TurnIndex 3
	before, beforeMore, err := mgr.GetTurnsBefore(conv.ID, beforeID, 2)
	if err != nil {
		t.Fatalf("GetTurnsBefore error: %v", err)
	}
	if len(before) != 2 || !beforeMore {
		t.Fatalf("expected 2 turns with hasMore, got %d, hasMore=%v", len(before), beforeMore)
	}
	if before[0].TurnIndex != 1 || before[1].TurnIndex != 2 {
		t.Fatalf("unexpected before order: %d, %d", before[0].TurnIndex, before[1].TurnIndex)
	}
}
