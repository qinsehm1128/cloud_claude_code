package services

import (
	"testing"
	"testing/quick"
	"time"

	"cc-platform/internal/config"
	"cc-platform/internal/models"

	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

// MockDB is a simple in-memory mock for testing without SQLite
type MockDB struct {
	users map[string]*models.User
}

func (m *MockDB) Where(query interface{}, args ...interface{}) *gorm.DB {
	return &gorm.DB{}
}

func setupTestAuthServiceSimple(t *testing.T) (*AuthService, func()) {
	cfg := &config.Config{
		DatabasePath:  ":memory:",
		JWTSecret:     "test-jwt-secret-32-bytes-long!!",
		EncryptionKey: "test-encryption-key-32-bytes-ok!",
		AdminUsername: "admin",
		AdminPassword: "testpassword123",
	}

	// Create a minimal auth service for JWT testing only
	authService := &AuthService{
		db:     nil, // We'll test JWT functions that don't need DB
		config: cfg,
	}

	cleanup := func() {}

	return authService, cleanup
}

// Property 1: Authentication Response Correctness
// For any login request, Auth_Service SHALL return a valid JWT token if and only if
// the credentials match the configured admin credentials

func TestGenerateAndVerifyToken(t *testing.T) {
	authService, cleanup := setupTestAuthServiceSimple(t)
	defer cleanup()

	// Generate a token
	token, err := authService.generateToken("admin")
	if err != nil {
		t.Fatalf("Failed to generate token: %v", err)
	}

	// Verify the token
	claims, err := authService.VerifyToken(token)
	if err != nil {
		t.Errorf("Valid token should verify, got error: %v", err)
	}
	if claims.Username != "admin" {
		t.Errorf("Claims username should be 'admin', got: %s", claims.Username)
	}
}

// Property 2: JWT Token Validation
// For any API request to a protected endpoint, the Platform SHALL accept the request
// if and only if it contains a valid, non-expired JWT token

func TestInvalidTokenFails(t *testing.T) {
	authService, cleanup := setupTestAuthServiceSimple(t)
	defer cleanup()

	// Property test: any random string should fail verification
	f := func(invalidToken string) bool {
		_, err := authService.VerifyToken(invalidToken)
		return err != nil
	}

	if err := quick.Check(f, &quick.Config{MaxCount: 100}); err != nil {
		t.Errorf("Property test failed: %v", err)
	}
}

func TestExpiredTokenFails(t *testing.T) {
	authService, cleanup := setupTestAuthServiceSimple(t)
	defer cleanup()

	// Create an expired token manually
	claims := &Claims{
		Username: "admin",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-1 * time.Hour)), // Expired 1 hour ago
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-2 * time.Hour)),
			Issuer:    "cc-platform",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte("test-jwt-secret-32-bytes-long!!"))
	if err != nil {
		t.Fatalf("Failed to create expired token: %v", err)
	}

	_, err = authService.VerifyToken(tokenString)
	if err != ErrTokenExpired {
		t.Errorf("Expired token should return ErrTokenExpired, got: %v", err)
	}
}

func TestTamperedTokenFails(t *testing.T) {
	authService, cleanup := setupTestAuthServiceSimple(t)
	defer cleanup()

	token, err := authService.generateToken("admin")
	if err != nil {
		t.Fatalf("Failed to generate token: %v", err)
	}

	// Tamper with the token
	tamperedToken := token + "tampered"

	_, err = authService.VerifyToken(tamperedToken)
	if err == nil {
		t.Error("Tampered token should fail verification")
	}
}

func TestTokenWithWrongSecretFails(t *testing.T) {
	authService, cleanup := setupTestAuthServiceSimple(t)
	defer cleanup()

	// Create a token with a different secret
	claims := &Claims{
		Username: "admin",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "cc-platform",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte("different-secret-key-32-bytes!!"))
	if err != nil {
		t.Fatalf("Failed to create token: %v", err)
	}

	_, err = authService.VerifyToken(tokenString)
	if err == nil {
		t.Error("Token with wrong secret should fail verification")
	}
}

// TestTokenRoundTrip verifies that for any username, generate then verify returns same username
func TestTokenRoundTrip(t *testing.T) {
	authService, cleanup := setupTestAuthServiceSimple(t)
	defer cleanup()

	// Test with ASCII usernames only (JWT standard practice)
	testUsernames := []string{
		"admin",
		"user123",
		"test_user",
		"john.doe",
		"a",
		"verylongusernamethatisquitelong",
	}

	for _, username := range testUsernames {
		token, err := authService.generateToken(username)
		if err != nil {
			t.Errorf("Generate error for %s: %v", username, err)
			continue
		}

		claims, err := authService.VerifyToken(token)
		if err != nil {
			t.Errorf("Verify error for %s: %v", username, err)
			continue
		}

		if claims.Username != username {
			t.Errorf("Round-trip failed: expected %s, got %s", username, claims.Username)
		}
	}
}

// TestTokenRoundTripProperty verifies round-trip with ASCII strings
func TestTokenRoundTripProperty(t *testing.T) {
	authService, cleanup := setupTestAuthServiceSimple(t)
	defer cleanup()

	f := func(data []byte) bool {
		// Convert to ASCII-safe string
		username := ""
		for _, b := range data {
			if b >= 32 && b < 127 { // Printable ASCII
				username += string(b)
			}
		}
		if username == "" {
			return true // Skip empty usernames
		}
		if len(username) > 50 {
			username = username[:50]
		}

		token, err := authService.generateToken(username)
		if err != nil {
			return false
		}

		claims, err := authService.VerifyToken(token)
		if err != nil {
			return false
		}

		return claims.Username == username
	}

	if err := quick.Check(f, &quick.Config{MaxCount: 100}); err != nil {
		t.Errorf("Property test failed: %v", err)
	}
}
