package terminal

import (
	"bytes"
	"compress/gzip"
	"fmt"
	"io"
	"sync"
	"time"

	"cc-platform/internal/models"

	"gorm.io/gorm"
)

const (
	// Buffer settings
	MemoryBufferSize = 64 * 1024  // 64KB memory buffer per session
	FlushThreshold   = 32 * 1024  // Flush when buffer reaches 32KB
	FlushInterval    = 30 * time.Second // Flush every 30 seconds
	MaxChunkSize     = 256 * 1024 // 256KB per database chunk (before compression)
	
	// History limits - no limit on total history
	MaxHistoryChunks = 0          // 0 = unlimited chunks
	HistoryChunkSendSize = 64 * 1024 // 64KB per WebSocket message when sending history
)

// HistoryManager manages terminal history persistence
type HistoryManager struct {
	db       *gorm.DB
	buffers  map[string]*SessionBuffer
	mu       sync.RWMutex
	stopChan chan struct{}
}

// SessionBuffer holds in-memory buffer for a session
type SessionBuffer struct {
	sessionID   string
	data        []byte
	mu          sync.Mutex
	lastFlush   time.Time
	totalSize   int // Total bytes written since session start
}

// NewHistoryManager creates a new history manager
func NewHistoryManager(db *gorm.DB) *HistoryManager {
	hm := &HistoryManager{
		db:       db,
		buffers:  make(map[string]*SessionBuffer),
		stopChan: make(chan struct{}),
	}
	
	// Start periodic flush goroutine
	go hm.periodicFlush()
	
	return hm
}

// Close stops the history manager
func (hm *HistoryManager) Close() {
	close(hm.stopChan)
	
	// Flush all remaining buffers
	hm.mu.Lock()
	defer hm.mu.Unlock()
	
	for _, buf := range hm.buffers {
		hm.flushBuffer(buf)
	}
}

// periodicFlush flushes buffers periodically
func (hm *HistoryManager) periodicFlush() {
	ticker := time.NewTicker(FlushInterval)
	defer ticker.Stop()
	
	for {
		select {
		case <-hm.stopChan:
			return
		case <-ticker.C:
			hm.flushAllBuffers()
		}
	}
}

// flushAllBuffers flushes all session buffers
func (hm *HistoryManager) flushAllBuffers() {
	hm.mu.Lock()
	buffers := make([]*SessionBuffer, 0, len(hm.buffers))
	for _, buf := range hm.buffers {
		buffers = append(buffers, buf)
	}
	hm.mu.Unlock()
	
	for _, buf := range buffers {
		hm.flushBuffer(buf)
	}
}

// GetOrCreateBuffer gets or creates a buffer for a session
func (hm *HistoryManager) GetOrCreateBuffer(sessionID string) *SessionBuffer {
	hm.mu.Lock()
	defer hm.mu.Unlock()
	
	if buf, exists := hm.buffers[sessionID]; exists {
		return buf
	}
	
	buf := &SessionBuffer{
		sessionID: sessionID,
		data:      make([]byte, 0, MemoryBufferSize),
		lastFlush: time.Now(),
	}
	hm.buffers[sessionID] = buf
	return buf
}

// Write writes data to session buffer
func (hm *HistoryManager) Write(sessionID string, data []byte) {
	buf := hm.GetOrCreateBuffer(sessionID)
	
	buf.mu.Lock()
	defer buf.mu.Unlock()
	
	buf.data = append(buf.data, data...)
	buf.totalSize += len(data)
	
	// Check if we need to flush
	if len(buf.data) >= FlushThreshold {
		go hm.flushBuffer(buf)
	}
}

// flushBuffer flushes a session buffer to database
func (hm *HistoryManager) flushBuffer(buf *SessionBuffer) {
	buf.mu.Lock()
	if len(buf.data) == 0 {
		buf.mu.Unlock()
		return
	}
	
	// Take the data and reset buffer
	data := buf.data
	buf.data = make([]byte, 0, MemoryBufferSize)
	buf.lastFlush = time.Now()
	buf.mu.Unlock()
	
	// Compress and save to database
	hm.saveToDatabase(buf.sessionID, data)
}

// saveToDatabase saves data to database in chunks
func (hm *HistoryManager) saveToDatabase(sessionID string, data []byte) {
	if len(data) == 0 {
		return
	}
	
	// Get current max chunk index
	var maxIndex int
	hm.db.Model(&models.TerminalHistory{}).
		Where("session_id = ?", sessionID).
		Select("COALESCE(MAX(chunk_index), -1)").
		Scan(&maxIndex)
	
	// Split data into chunks if needed
	for i := 0; i < len(data); i += MaxChunkSize {
		end := i + MaxChunkSize
		if end > len(data) {
			end = len(data)
		}
		chunk := data[i:end]
		
		// Compress chunk
		compressed, err := compressData(chunk)
		if err != nil {
			fmt.Printf("Failed to compress history chunk: %v\n", err)
			compressed = chunk // Fall back to uncompressed
		}
		
		maxIndex++
		history := &models.TerminalHistory{
			SessionID:  sessionID,
			ChunkIndex: maxIndex,
			Data:       compressed,
			DataSize:   len(chunk),
		}
		
		if err := hm.db.Create(history).Error; err != nil {
			fmt.Printf("Failed to save history chunk: %v\n", err)
		}
	}
	
	// Cleanup old chunks if we have too many
	hm.cleanupOldChunks(sessionID)
}

// cleanupOldChunks removes old chunks if we exceed the limit (disabled when MaxHistoryChunks = 0)
func (hm *HistoryManager) cleanupOldChunks(sessionID string) {
	if MaxHistoryChunks <= 0 {
		return // No limit
	}
	
	var count int64
	hm.db.Model(&models.TerminalHistory{}).
		Where("session_id = ?", sessionID).
		Count(&count)
	
	if count > int64(MaxHistoryChunks) {
		// Delete oldest chunks
		deleteCount := count - int64(MaxHistoryChunks)
		
		var oldestChunks []models.TerminalHistory
		hm.db.Where("session_id = ?", sessionID).
			Order("chunk_index ASC").
			Limit(int(deleteCount)).
			Find(&oldestChunks)
		
		for _, chunk := range oldestChunks {
			hm.db.Delete(&chunk)
		}
	}
}

// GetHistory retrieves full history for a session (database + buffer)
func (hm *HistoryManager) GetHistory(sessionID string) ([]byte, error) {
	// Get from database
	var chunks []models.TerminalHistory
	if err := hm.db.Where("session_id = ?", sessionID).
		Order("chunk_index ASC").
		Find(&chunks).Error; err != nil {
		return nil, err
	}
	
	// Decompress and combine chunks
	var result []byte
	for _, chunk := range chunks {
		data, err := decompressData(chunk.Data)
		if err != nil {
			// Try using raw data if decompression fails
			data = chunk.Data
		}
		result = append(result, data...)
	}
	
	// Add current buffer content
	hm.mu.RLock()
	buf, exists := hm.buffers[sessionID]
	hm.mu.RUnlock()
	
	if exists {
		buf.mu.Lock()
		result = append(result, buf.data...)
		buf.mu.Unlock()
	}
	
	return result, nil
}

// GetHistorySize returns the total size of history for a session
func (hm *HistoryManager) GetHistorySize(sessionID string) int64 {
	var totalSize int64
	
	// Get database size
	hm.db.Model(&models.TerminalHistory{}).
		Where("session_id = ?", sessionID).
		Select("COALESCE(SUM(data_size), 0)").
		Scan(&totalSize)
	
	// Add buffer size
	hm.mu.RLock()
	buf, exists := hm.buffers[sessionID]
	hm.mu.RUnlock()
	
	if exists {
		buf.mu.Lock()
		totalSize += int64(len(buf.data))
		buf.mu.Unlock()
	}
	
	return totalSize
}

// GetRecentHistory gets only recent history from buffer (fast)
func (hm *HistoryManager) GetRecentHistory(sessionID string) []byte {
	hm.mu.RLock()
	buf, exists := hm.buffers[sessionID]
	hm.mu.RUnlock()
	
	if !exists {
		return nil
	}
	
	buf.mu.Lock()
	defer buf.mu.Unlock()
	
	result := make([]byte, len(buf.data))
	copy(result, buf.data)
	return result
}

// DeleteSessionHistory deletes all history for a session
func (hm *HistoryManager) DeleteSessionHistory(sessionID string) {
	// Remove buffer
	hm.mu.Lock()
	delete(hm.buffers, sessionID)
	hm.mu.Unlock()
	
	// Delete from database
	hm.db.Where("session_id = ?", sessionID).Delete(&models.TerminalHistory{})
}

// FlushSession forces a flush for a specific session
func (hm *HistoryManager) FlushSession(sessionID string) {
	hm.mu.RLock()
	buf, exists := hm.buffers[sessionID]
	hm.mu.RUnlock()
	
	if exists {
		hm.flushBuffer(buf)
	}
}

// compressData compresses data using gzip
func compressData(data []byte) ([]byte, error) {
	var buf bytes.Buffer
	writer := gzip.NewWriter(&buf)
	
	if _, err := writer.Write(data); err != nil {
		return nil, err
	}
	
	if err := writer.Close(); err != nil {
		return nil, err
	}
	
	return buf.Bytes(), nil
}

// decompressData decompresses gzip data
func decompressData(data []byte) ([]byte, error) {
	reader, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	defer reader.Close()
	
	return io.ReadAll(reader)
}
