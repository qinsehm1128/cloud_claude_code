package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// RateLimiter implements a simple token bucket rate limiter
type RateLimiter struct {
	mu       sync.Mutex
	tokens   map[string]int
	lastTime map[string]time.Time
	rate     int           // tokens per interval
	interval time.Duration // refill interval
	burst    int           // max tokens
}

// NewRateLimiter creates a new rate limiter
func NewRateLimiter(rate int, interval time.Duration, burst int) *RateLimiter {
	return &RateLimiter{
		tokens:   make(map[string]int),
		lastTime: make(map[string]time.Time),
		rate:     rate,
		interval: interval,
		burst:    burst,
	}
}

// Allow checks if a request from the given key is allowed
func (rl *RateLimiter) Allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	last, exists := rl.lastTime[key]

	if !exists {
		// First request from this key
		rl.tokens[key] = rl.burst - 1
		rl.lastTime[key] = now
		return true
	}

	// Calculate tokens to add based on time elapsed
	elapsed := now.Sub(last)
	tokensToAdd := int(elapsed / rl.interval) * rl.rate

	currentTokens := rl.tokens[key] + tokensToAdd
	if currentTokens > rl.burst {
		currentTokens = rl.burst
	}

	if currentTokens <= 0 {
		return false
	}

	rl.tokens[key] = currentTokens - 1
	rl.lastTime[key] = now
	return true
}

// LoginRateLimiter is a global rate limiter for login attempts
var LoginRateLimiter = NewRateLimiter(5, time.Minute, 10)

// RateLimit returns a middleware that limits requests
func RateLimit(limiter *RateLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Use client IP as the key
		key := c.ClientIP()

		if !limiter.Allow(key) {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "Too many requests, please try again later",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// LoginRateLimit returns a middleware specifically for login rate limiting
func LoginRateLimit() gin.HandlerFunc {
	return RateLimit(LoginRateLimiter)
}
